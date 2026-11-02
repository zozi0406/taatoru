/** Try every owned release even if one process or socket has already failed. */
export async function cleanupRunnerResources(
  releases: readonly (() => void | Promise<void>)[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const release of releases) {
    try { await release(); } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, failures.map(String).join('; '));
  }
}
