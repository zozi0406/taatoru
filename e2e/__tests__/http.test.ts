/** @jest-environment node */
import { request } from 'node:http';
import { runInThisContext } from 'node:vm';
import { HttpWaniKaniApi } from '../../src/api/HttpWaniKaniApi';
import { startMockServer } from '../mock/server';

const networkFetch = runInThisContext('fetch') as typeof fetch;
let server: Awaited<ReturnType<typeof startMockServer>>;
beforeEach(async () => { server = await startMockServer({ scenario: 'smoke', port: 0 }); });
afterEach(async () => { await server.close(); });
const api = () => new HttpWaniKaniApi({ token: 'synthetic-only', fetch: networkFetch, baseUrl: `${server.origin}/v2/` });

test('real HTTP client decodes receipts and filtered lookups, and follows local pages', async () => {
  const client = api();
  expect((await client.getSubjects(null)).data).toHaveLength(server.world.scenario.subjects.length);
  expect((await client.getResets(null)).data).toEqual([]);
  const lesson = server.world.availableLessons()[0]!;
  const receipt = await client.startAssignment({ assignmentId: lesson.id, startedAt: new Date() });
  expect(receipt.assignment.id).toBe(lesson.id);
  expect((await client.getAssignment(lesson.id)).data.started_at).not.toBeNull();
  const due = server.world.dueReviews()[0]!;
  const review = await client.createReview({ assignmentId: due.id, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0, createdAt: new Date() });
  expect(review.reviewStatistic?.data.meaning_incorrect).toBe(1);
  expect((await client.findReviewStatistic(due.data.subject_id))?.id).toBe(review.reviewStatistic?.id);
  expect(await client.findStudyMaterial(due.data.subject_id)).toBeNull();
  const material = await client.upsertStudyMaterial({ subjectId: due.data.subject_id, meaningNote: 'invented note', readingNote: null, meaningSynonyms: [] });
  expect((await client.findStudyMaterial(due.data.subject_id))?.id).toBe(material.id);
  expect(await client.findStudyMaterial(lesson.data.subject_id)).toBeNull();
});

test('accepted lost response exposes evidence and duplicate review does not apply twice', async () => {
  const client = api();
  const due = server.world.dueReviews()[0]!;
  server.arm({ method: 'POST', path: '/v2/reviews', kind: 'drop-after' });
  const input = { assignmentId: due.id, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0, createdAt: new Date() };
  await expect(client.createReview(input)).rejects.toThrow();
  expect((await client.getAssignment(due.id)).data.available_at).not.toBe(due.data.available_at);
  await expect(client.createReview(input)).rejects.toMatchObject({ status: 422 });
  expect(server.journal.filter(e => e.accepted)).toHaveLength(1);
});

test('fault before acceptance leaves state intact and hold/release publishes accepted state first', async () => {
  const client = api();
  const lesson = server.world.availableLessons()[0]!;
  server.arm({ method: 'PUT', path: `/v2/assignments/${lesson.id}/start`, kind: 'reject', status: 500 });
  await expect(client.startAssignment({ assignmentId: lesson.id })).rejects.toMatchObject({ status: 500 });
  expect(server.world.assignment(lesson.id).data.started_at).toBeNull();
  server.arm({ method: 'PUT', path: `/v2/assignments/${lesson.id}/start`, kind: 'hold-after' });
  const writing = client.startAssignment({ assignmentId: lesson.id });
  await server.waitForHeld();
  expect((await client.getAssignment(lesson.id)).data.started_at).not.toBeNull();
  server.release();
  await expect(writing).resolves.toHaveProperty('assignment.id', lesson.id);
});

test('control reset changes run identity and malformed input fails visibly', async () => {
  const old = server.world.scenario.runId;
  const result = await networkFetch(`${server.origin}/__e2e/reset`, { method: 'POST', body: JSON.stringify({ scenario: 'daily', seed: 9 }) });
  expect(result.status).toBe(200);
  expect(server.world.scenario.runId).not.toBe(old);
  const invalid = await networkFetch(`${server.origin}/v2/reviews`, { method: 'POST', body: '{}' });
  expect(invalid.status).toBe(422);
});

test('preserves synthetic Unicode notes when a UTF-8 character spans request chunks', async () => {
  const note = 'Synthetic もあな moon';
  const bytes = Buffer.from(JSON.stringify({ study_material: { subject_id: 1001, meaning_note: note, reading_note: null, meaning_synonyms: [] } }));
  const split = bytes.indexOf(Buffer.from('も')) + 1;
  await new Promise<void>((resolve, reject) => {
    const url = new URL('/v2/study_materials', server.origin);
    const outgoing = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, response => {
      response.resume(); response.on('end', resolve);
    });
    outgoing.once('error', reject);
    outgoing.write(bytes.subarray(0, split));
    setTimeout(() => outgoing.end(bytes.subarray(split)), 20);
  });
  expect(server.world.scenario.studyMaterials[0]?.data.meaning_note).toBe(note);
});

test('localizes API links without rewriting authored notes and synonyms', async () => {
  const note = 'Synthetic hint: http://127.0.0.1:8787/v2/reviews is literal note text';
  const synonym = 'invented http://127.0.0.1:8787 marker';
  const subjectId = server.world.dueReviews()[0]!.data.subject_id;
  const receipt = await api().upsertStudyMaterial({ subjectId, meaningNote: note,
    readingNote: note, meaningSynonyms: [synonym] });
  expect(receipt.url).toBe(`${server.origin}/v2/study_materials/${receipt.id}`);
  expect(receipt.data.meaning_note).toBe(note);
  expect(receipt.data.reading_note).toBe(note);
  expect(receipt.data.meaning_synonyms).toEqual([synonym]);
  expect((await api().findStudyMaterial(subjectId))?.data.meaning_note).toBe(note);
  const bootstrap = await (await networkFetch(`${server.origin}/__e2e/bootstrap`)).json();
  expect(bootstrap.resources.studyMaterials.data[0].data.meaning_note).toBe(note);
  const subject = bootstrap.resources.subjects.data[0];
  expect(subject.url).toBe(`${server.origin}/v2/subjects/${subject.id}`);
  expect(bootstrap.resources.user.data.profile_url).toBe(`${server.origin}/synthetic`);
});

test.each([{ scenario: 'daily', seed: -1 }, { scenario: 'constructor' }, { scenario: 'toString' }])('invalid reset %j preserves account, journal, armed faults and held responses', async payload => {
  const lesson = server.world.availableLessons()[0]!;
  const runId = server.world.scenario.runId;
  server.arm({ method: 'PUT', path: `/v2/assignments/${lesson.id}/start`, kind: 'hold-after' });
  const writing = api().startAssignment({ assignmentId: lesson.id });
  await server.waitForHeld();
  server.arm({ method: 'GET', path: `/v2/assignments/${lesson.id}`, kind: 'reject', status: 500 });
  try {
    const reset = await networkFetch(`${server.origin}/__e2e/reset`, { method: 'POST',
      body: JSON.stringify(payload) });
    expect(reset.status).toBe(422);
    expect(server.world.scenario.runId).toBe(runId);
    expect(server.world.assignment(lesson.id).data.started_at).not.toBeNull();
    expect(server.journal).toHaveLength(1);
    const state = await (await networkFetch(`${server.origin}/__e2e/state`)).json();
    expect(state.held).toBe(1);
    await expect(api().getAssignment(lesson.id)).rejects.toMatchObject({ status: 500 });
  } finally { server.release(); await writing; }
});
