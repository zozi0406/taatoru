/** @jest-environment node */
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureFile } from '../runner/capture';

test('snapshot transport writes database-sized output beyond the default process buffer', () => {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-capture-'));
  try {
    const target = join(directory, 'data');
    captureFile(process.execPath, ['-e', 'process.stdout.write(Buffer.alloc(5 * 1024 * 1024))'], target);
    expect(statSync(target).size).toBe(5 * 1024 * 1024);
  } finally { rmSync(directory, { recursive: true }); }
});
