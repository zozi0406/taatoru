/** @jest-environment node */
import { cleanupRunnerResources } from '../runner/cleanup';

test('cleanup releases later owned resources even when an earlier close fails', async () => {
  const released: string[] = [];
  await expect(cleanupRunnerResources([
    async () => { released.push('reverse'); },
    async () => { released.push('metro'); throw new Error('close failed'); },
    async () => { released.push('bridge'); },
    async () => { released.push('server'); },
  ])).rejects.toThrow('close failed');
  expect(released).toEqual(['reverse', 'metro', 'bridge', 'server']);
});
