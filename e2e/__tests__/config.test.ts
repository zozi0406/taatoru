const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; jest.resetModules(); });
function config() { jest.resetModules(); return require('../../app.config').default; }

test('normal configuration keeps production identity and no E2E metadata', () => {
  delete process.env.EXPO_PUBLIC_TAATORU_E2E;
  expect(config().android.package).toBe('app.taatoru');
  expect(config().extra.localE2E).toBeUndefined();
});

test('local E2E has its own package and refuses all EAS profiles', () => {
  process.env.EXPO_PUBLIC_TAATORU_E2E = '1';
  delete process.env.EAS_BUILD; delete process.env.EAS_BUILD_PROFILE;
  expect(config().android.package).toBe('app.taatoru.e2e');
  expect(config().scheme).toBe('taatoru-e2e');
  process.env.EAS_BUILD_PROFILE = 'production';
  expect(config).toThrow('cannot be used for EAS');
});
