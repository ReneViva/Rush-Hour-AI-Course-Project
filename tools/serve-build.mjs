import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4173);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.py': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/lab') {
      res.writeHead(308, { Location: '/lab/' }).end();
      return;
    }
    if (path.startsWith('/lab/')) path = path.slice(4);
    if (path === '/') path = '/index.html';
    const file = resolve(root, '.' + path);
    const boundary = relative(root, file);
    if (boundary === '..' || boundary.startsWith('../') || boundary.startsWith('..\\') || isAbsolute(boundary)) {
      res.writeHead(404).end();
      return;
    }
    const entry = await stat(file);
    if (!entry.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': entry.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Rush Hour Lab is available at http://127.0.0.1:${port}/`));
