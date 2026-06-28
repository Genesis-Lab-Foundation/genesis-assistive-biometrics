#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5174);
const root = process.cwd();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm'
};

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const filePath = safeFilePath(pathname);
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const target = existsSync(filePath) && statSync(filePath).isDirectory() ? join(filePath, 'index.html') : filePath;
  if (!existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes[extname(target)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Genesis Assistive Biometrics: http://${host}:${port}`);
});

function safeFilePath(pathname) {
  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  const filePath = resolve(root, relative || 'index.html');
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return null;
  return filePath;
}
