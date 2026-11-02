import type { Scenario } from '../scenarios/factory';

/** Original cached-media fixture: download transport is covered separately by cache tests. */
export function seedCachedRadical(scenario: Scenario) {
  const subject = scenario.subjects.find(item => item.object === 'radical' &&
    scenario.assignments.some(assignment => assignment.data.subject_id === item.id &&
      assignment.data.available_at !== null && Date.parse(assignment.data.available_at) <= Date.parse(scenario.now)));
  if (!subject || subject.object !== 'radical') throw new Error('Media fixture needs a due radical');
  const image = { url: 'https://synthetic-media.invalid/original-square.svg', content_type: 'image/svg+xml' as const,
    metadata: { color: '#ffffff', dimensions: '10x10', style_name: 'synthetic' } };
  const index = scenario.subjects.indexOf(subject);
  scenario.subjects[index] = { ...subject, data: { ...subject.data, characters: null, character_images: [image] } };
  const key = image.url + '\n' + image.content_type;
  const encoded = encodeURIComponent(key).replace(/_/g, '%5F').replace(/%/g, '_');
  return {
    subjectId: subject.id,
    path: 'files/radical-images-v1/' + encoded.match(/.{1,100}/g)!.join('/') + '/image.json',
    payload: JSON.stringify({ key, image: { kind: 'svg', content:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M1 1h8v8H1z"/></svg>' } }),
  };
}
