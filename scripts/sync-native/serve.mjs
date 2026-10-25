// Test-only manifest proxy. Production package.json and authentication stay intact.
import http from 'node:http';

const upstream = 'http://127.0.0.1:8091';
http.createServer(async (request, response) => {
  try {
    const result = await fetch(`${upstream}${request.url}`, {
      headers: { accept: 'application/expo+json', 'expo-platform': 'android' },
    });
    const manifest = await result.json();
    const bundle = new URL(manifest.launchAsset.url);
    bundle.hostname = '127.0.0.1';
    bundle.pathname = '/src/test/sync/androidFixtureEntry.bundle';
    bundle.searchParams.set('lazy', 'false');
    bundle.searchParams.delete('transform.routerRoot');
    manifest.launchAsset.url = bundle.toString();
    manifest.extra.expoClient.name = 'Taatoru sync fixtures';
    response.writeHead(200, { 'content-type': 'application/expo+json', 'expo-protocol-version': '0', 'expo-sfv-version': '0' });
    response.end(JSON.stringify(manifest));
  } catch {
    response.writeHead(503); response.end('Start the local Expo server on port 8091 first.');
  }
}).listen(8092, '127.0.0.1', () => process.stdout.write('Fixture manifest ready on port 8092\n'));
