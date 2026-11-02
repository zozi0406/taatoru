import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createScenario, PRESETS, type ScenarioName } from '../scenarios/factory';
import { MockWorld, MockValidationError } from '../scenarios/world';

export interface Fault {
  method: string; path: string; kind: 'reject' | 'drop-before' | 'drop-after' | 'hold-after' | 'malformed-after';
  status?: number; assignmentId?: number;
}
export interface JournalEntry {
  sequence: number; method: string; path: string; body: unknown; accepted: boolean; status: number; fault?: string;
}
interface Options { scenario?: ScenarioName; seed?: number; port?: number; pageSize?: number }

const FIXTURE_ORIGIN = 'http://127.0.0.1:8787';
const LINK_FIELDS = new Set(['url', 'document_url', 'profile_url', 'next_url', 'previous_url']);

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    text += String(chunk);
    if (text.length > 1_000_000) throw new MockValidationError('Body too large', 413);
  }
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new MockValidationError('Expected JSON object'); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MockValidationError('Missing mutation object');
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new MockValidationError('Expected nonnegative integer');
  return value;
}

/** Loopback-only fake API. Control routes never exist in the production app. */
export async function startMockServer(options: Options = {}) {
  let world = new MockWorld(createScenario(options.scenario ?? 'daily', options.seed ?? 42), Date.now);
  world.scenario.runId += `-${randomUUID()}`;
  let origin = '';
  const journal: JournalEntry[] = [];
  const faults: Fault[] = [];
  const held = new Set<() => void>();
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      // Resource URLs are local even when tests request an ephemeral port.
      res.end(JSON.stringify(value, (key, field: unknown) =>
        LINK_FIELDS.has(key) && typeof field === 'string' && field.startsWith(`${FIXTURE_ORIGIN}/`)
          ? origin + field.slice(FIXTURE_ORIGIN.length) : field));
    };
    let entry: JournalEntry | undefined;
    try {
      const url = new URL(req.url ?? '/', origin);
      const method = req.method ?? 'GET';
      const body = method === 'GET' ? {} : await bodyOf(req);
      if (url.pathname.startsWith('/__e2e/')) {
        if (method === 'GET' && url.pathname === '/__e2e/bootstrap') return send(200, {
          runId: world.scenario.runId, scenario: world.scenario.name, resources: world.resources(), answers: world.scenario.answers,
          targets: world.scenario.targets, expected: { lessonIds: world.availableLessons().map(a => a.data.subject_id), reviewIds: world.dueReviews().map(a => a.data.subject_id) },
        });
        if (method === 'GET' && url.pathname === '/__e2e/state') return send(200, { scenario: world.scenario, journal, held: held.size });
        if (method === 'POST' && url.pathname === '/__e2e/reset') {
          if (typeof body.scenario !== 'string' || !Object.hasOwn(PRESETS, body.scenario)) throw new MockValidationError('Unknown scenario');
          // Build and validate first: rejected control input must not disturb an active run.
          const replacement = new MockWorld(createScenario(body.scenario as ScenarioName,
            body.seed === undefined ? 42 : integer(body.seed)), Date.now);
          replacement.scenario.runId += `-${randomUUID()}`;
          for (const release of held) release();
          held.clear(); faults.length = 0; journal.length = 0;
          world = replacement;
          return send(200, { runId: world.scenario.runId });
        }
        if (method === 'POST' && url.pathname === '/__e2e/fault') {
          if (!['PUT', 'POST', 'GET'].includes(String(body.method)) || typeof body.path !== 'string' || !body.path.startsWith('/v2/') ||
            !['reject', 'drop-before', 'drop-after', 'hold-after', 'malformed-after'].includes(String(body.kind))) throw new MockValidationError('Invalid fault');
          faults.push({ method: String(body.method), path: body.path, kind: body.kind as Fault['kind'],
            ...(body.status === undefined ? {} : { status: integer(body.status) }),
            ...(body.assignmentId === undefined ? {} : { assignmentId: integer(body.assignmentId) }) });
          return send(200, { armed: true });
        }
        if (method === 'POST' && url.pathname === '/__e2e/release') {
          for (const release of held) release(); held.clear(); return send(200, { released: true });
        }
        if (method === 'POST' && url.pathname === '/__e2e/make-due') {
          if (!Array.isArray(body.assignmentIds)) throw new MockValidationError('Expected assignmentIds');
          world.makeDue(body.assignmentIds.map(integer)); return send(200, { updated: true });
        }
        throw new MockValidationError('Unknown control route', 404);
      }
      entry = { sequence: journal.length + 1, method, path: url.pathname + url.search, body, accepted: false, status: 200 };
      journal.push(entry);
      const faultIndex = faults.findIndex(f => f.method === method && f.path === url.pathname &&
        (f.assignmentId === undefined || record(body.review).assignment_id === f.assignmentId));
      const fault = faultIndex < 0 ? undefined : faults.splice(faultIndex, 1)[0];
      if (fault) entry.fault = fault.kind;
      if (fault?.kind === 'drop-before') { entry.status = 0; res.destroy(); return; }
      if (fault?.kind === 'reject') {
        entry.status = fault.status ?? 500;
        if (entry.status === 429) res.setHeader('Retry-After', '2');
        return send(entry.status, { error: 'Synthetic injected rejection', code: entry.status });
      }
      let result: unknown;
      const start = /^\/v2\/assignments\/(\d+)\/start$/.exec(url.pathname);
      const assignment = /^\/v2\/assignments\/(\d+)$/.exec(url.pathname);
      const material = /^\/v2\/study_materials\/(\d+)$/.exec(url.pathname);
      if (method === 'PUT' && start) {
        result = world.start(Number(start[1]), typeof body.started_at === 'string' ? body.started_at : new Date().toISOString());
        entry.accepted = true;
      } else if (method === 'POST' && url.pathname === '/v2/reviews') {
        const review = record(body.review);
        if ((review.assignment_id === undefined) === (review.subject_id === undefined)) throw new MockValidationError('Expected exactly one identity');
        const id = review.assignment_id === undefined ? world.scenario.assignments.find(a => a.data.subject_id === integer(review.subject_id))?.id : integer(review.assignment_id);
        if (id === undefined) throw new MockValidationError('Unknown review subject', 404);
        const receipt = world.review(id, integer(review.incorrect_meaning_answers), integer(review.incorrect_reading_answers),
          typeof review.created_at === 'string' ? review.created_at : new Date().toISOString());
        result = { object: 'review', resources_updated: { assignment: receipt.assignment, review_statistic: receipt.reviewStatistic } };
        entry.accepted = true;
      } else if ((method === 'POST' && url.pathname === '/v2/study_materials') || (method === 'PUT' && material)) {
        const fields = record(body.study_material);
        const id = material ? Number(material[1]) : undefined;
        const subjectId = id === undefined ? integer(fields.subject_id) : world.scenario.studyMaterials.find(m => m.id === id)?.data.subject_id;
        if (subjectId === undefined) throw new MockValidationError('Unknown material', 404);
        result = world.material(subjectId, { meaning_note: fields.meaning_note as string | null,
          reading_note: fields.reading_note as string | null, meaning_synonyms: fields.meaning_synonyms as string[] }, id);
        entry.accepted = true;
      } else if (method === 'GET' && assignment) result = world.assignment(Number(assignment[1]));
      else if (method === 'GET' && url.pathname === '/v2/user') result = world.scenario.user;
      else if (method === 'GET') {
        const collections: Record<string, readonly { id: number; data_updated_at: string; data: unknown }[]> = {
          subjects: world.scenario.subjects, assignments: world.scenario.assignments,
          study_materials: world.scenario.studyMaterials, review_statistics: world.scenario.reviewStatistics,
          level_progressions: world.scenario.levelProgressions, voice_actors: [], resets: [],
        };
        let data = collections[url.pathname.replace('/v2/', '')];
        if (!data) throw new MockValidationError('Unknown API route', 404);
        const subjectIds = url.searchParams.get('subject_ids')?.split(',').map(Number);
        data = data.filter(r => {
          const d = r.data as { subject_id?: number; hidden?: boolean; hidden_at?: string | null; unlocked_at?: string | null };
          return (!subjectIds || subjectIds.includes(d.subject_id ?? -1)) &&
            (url.searchParams.get('hidden') !== 'false' || (!d.hidden && !d.hidden_at)) &&
            (url.searchParams.get('unlocked') !== 'true' || d.unlocked_at != null) &&
            (!url.searchParams.get('updated_after') || Date.parse(r.data_updated_at) > Date.parse(url.searchParams.get('updated_after')!));
        }).sort((a, b) => a.id - b.id);
        const offset = Number(url.searchParams.get('page_after_id') ?? 0);
        const limit = options.pageSize ?? 1000;
        const page = data.filter(r => r.id > offset).slice(0, limit);
        const next = page.length === limit && data.some(r => r.id > page[page.length - 1]!.id) ? new URL(url) : null;
        next?.searchParams.set('page_after_id', String(page[page.length - 1]!.id));
        result = { object: 'collection', url: url.toString(), pages: { next_url: next?.toString() ?? null, previous_url: null, per_page: limit },
          total_count: data.length, data_updated_at: data.length ? data.reduce((max, r) => r.data_updated_at > max ? r.data_updated_at : max, data[0]!.data_updated_at) : null, data: page };
      } else throw new MockValidationError('Unknown mutation route', 404);
      if (fault?.kind === 'drop-after') { entry.status = 0; res.destroy(); return; }
      if (fault?.kind === 'malformed-after') return send(200, { malformed: true });
      if (fault?.kind === 'hold-after') {
        await new Promise<void>(resolve => { const release = () => { held.delete(release); resolve(); }; held.add(release); });
      }
      send(200, result);
    } catch (error) {
      const status = error instanceof MockValidationError ? error.status : 500;
      if (entry) entry.status = status;
      send(status, { error: error instanceof Error ? error.message : 'Mock error', code: status });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 8787, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock did not bind a TCP port');
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, get world() { return world; }, journal,
    arm(fault: Fault) { faults.push(fault); },
    release() { for (const release of held) release(); },
    async waitForHeld(timeoutMs = 5000) { const deadline = Date.now() + timeoutMs; while (!held.size) {
      if (Date.now() > deadline) throw new Error('No response reached barrier');
      await new Promise(resolve => setTimeout(resolve, 10));
    } },
    async close() { for (const release of held) release(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
