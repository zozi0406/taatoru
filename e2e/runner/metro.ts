import { createServer, request } from 'node:http';

/** Expo's localhost mode binds ::1; adb reverse needs an IPv4 loopback listener. */
export async function startMetroBridge(upstreamPort = 8090, port = 8091) {
  const bridge = createServer((req, res) => {
    const upstream = request({ hostname: '::1', port: upstreamPort, path: req.url, method: req.method, headers: req.headers }, response => {
      if (String(response.headers['content-type']).includes('application/expo+json')) {
        let body = '';
        response.on('data', chunk => { body += String(chunk); });
        response.on('end', () => {
          try {
            const manifest = JSON.parse(body);
            const bundle = new URL(manifest.launchAsset.url);
            bundle.pathname = '/src/test/e2e/entry.bundle';
            bundle.searchParams.set('lazy', 'false');
            bundle.searchParams.delete('transform.routerRoot');
            manifest.launchAsset.url = bundle.toString();
            res.writeHead(response.statusCode ?? 200, { 'Content-Type': 'application/expo+json', 'expo-protocol-version': '0', 'expo-sfv-version': '0' });
            res.end(JSON.stringify(manifest));
          } catch { res.writeHead(502); res.end('Invalid Metro manifest'); }
        });
      } else { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); }
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Metro is not ready'); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { bridge.once('error', reject); bridge.listen(port, '127.0.0.1', resolve); });
  const address = bridge.address();
  if (!address || typeof address === 'string') throw new Error('No Metro bridge port');
  return { origin: `http://127.0.0.1:${address.port}`, async close() {
    bridge.closeAllConnections(); await new Promise<void>(resolve => bridge.close(() => resolve()));
  } };
}
