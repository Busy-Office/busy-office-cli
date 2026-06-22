import { createServer as createNetServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { writeProjectConfig } from './config.js';
import { deriveWorkerId } from './worker-id.js';

const TIMEOUT_MS = 120_000;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Busy Office CLI</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f0}
.card{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
h1{margin:0 0 .5rem;font-size:1.4rem;color:#1a1a1a}p{color:#555;margin:0}</style></head>
<body><div class="card"><h1>✓ CLI authorized</h1><p>You can close this tab and return to the terminal.</p></div></body>
</html>`;

export async function login(opts: { url: string }): Promise<void> {
  const port = await findFreePort();
  const callbackUrl = `http://localhost:${port}/callback`;
  const loginUrl = `${opts.url.replace(/\/$/, '')}/cli-auth?callback=${encodeURIComponent(callbackUrl)}`;

  console.log(`Opening browser to authorize — waiting up to 120s…`);
  console.log(`  ${loginUrl}`);
  openBrowser(loginUrl);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for browser authorization (120s). Re-run `busyoffice login`.'));
    }, TIMEOUT_MS);

    const server = createHttpServer((req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const params = new URL(req.url, 'http://localhost').searchParams;
      const token = params.get('token');
      const ingestUrl = params.get('ingest_url');

      if (!token || !ingestUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing token or ingest_url');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SUCCESS_HTML);

      clearTimeout(timer);
      server.close(() => {
        try {
          const host = new URL(ingestUrl).hostname;
          const workerId = deriveWorkerId();
          writeProjectConfig({ host, ingestUrl, token, workerId });
          console.log(`✓ Credentials saved (project: ${host})`);
          console.log(`✓ Worker ID: ${workerId}`);
          console.log('');
          console.log('Next: cd into your Claude Code project and run:');
          console.log('  busyoffice init');
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    server.listen(port, '127.0.0.1');
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
