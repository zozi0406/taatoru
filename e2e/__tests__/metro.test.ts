/** @jest-environment node */
import { createServer } from 'node:http';
import { runInThisContext } from 'node:vm';
import { startMetroBridge } from '../runner/metro';

test('IPv4 device bridge reaches an IPv6-only Metro server without changing request path', async () => {
  const upstream = createServer((request, response) => response.end(request.url));
  await new Promise<void>(resolve => upstream.listen(0, '::1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const bridge = await startMetroBridge(address.port, 0);
  try {
    const response = await (runInThisContext('fetch') as typeof fetch)(`${bridge.origin}/status?test=1`);
    expect(await response.text()).toBe('/status?test=1');
  } finally { await bridge.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});

test('development manifest uses explicit real app routes, not router-root inference', async () => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/expo+json' });
    response.end(JSON.stringify({ launchAsset: { url: 'http://127.0.0.1:8091/node_modules/expo-router/entry.bundle?transform.routerRoot=wrong&lazy=true' } }));
  });
  await new Promise<void>(resolve => upstream.listen(0, '::1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const bridge = await startMetroBridge(address.port, 0);
  try {
    const response = await (runInThisContext('fetch') as typeof fetch)(bridge.origin);
    const manifest = await response.json() as { launchAsset: { url: string } };
    const url = new URL(manifest.launchAsset.url);
    expect(url.pathname).toBe('/src/test/e2e/entry.bundle');
    expect(url.searchParams.has('transform.routerRoot')).toBe(false);
    expect(url.searchParams.get('lazy')).toBe('false');
  } finally { await bridge.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
