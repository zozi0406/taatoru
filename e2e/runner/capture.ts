import { openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Copy potentially large SQLite/WAL output directly to a file, not exec's small buffer. */
export function captureFile(binary: string, args: readonly string[], destination: string): void {
  const descriptor = openSync(destination, 'w');
  try {
    const result = spawnSync(binary, [...args], { stdio: ['ignore', descriptor, 'pipe'], timeout: 30000 });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`Snapshot command failed: ${result.stderr?.toString()}`);
  } finally { closeSync(descriptor); }
}
