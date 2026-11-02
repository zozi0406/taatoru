import { resolveE2ERuntime } from '@/test/e2e/runtime';

test('production stays default; E2E requires all explicit development gates', () => {
  expect(resolveE2ERuntime(false, false, 'app.taatoru', false)).toBeNull();
  expect(resolveE2ERuntime(true, true, 'app.taatoru.e2e', true, 'app.taatoru.e2e')?.baseUrl).toBe('http://127.0.0.1:8787/v2/');
  for (const args of [[true, false, 'app.taatoru.e2e', true], [true, true, 'app.taatoru', true], [false, true, 'app.taatoru.e2e', true]] as const)
    expect(() => resolveE2ERuntime(args[0], args[1], args[2], args[3])).toThrow();
});

test('a normal installed app cannot enable fixtures from an E2E Metro manifest', () => {
  expect(() => resolveE2ERuntime(true, true, 'app.taatoru.e2e', true, 'app.taatoru')).toThrow();
  expect(resolveE2ERuntime(true, true, 'app.taatoru.e2e', true, 'app.taatoru.e2e')).not.toBeNull();
});

test('isolated installed app fails closed if opened against ordinary Metro', () => {
  expect(() => resolveE2ERuntime(false, true, 'app.taatoru', false, 'app.taatoru.e2e')).toThrow();
});
