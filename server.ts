import { resolve, sep } from 'node:path';

const root = import.meta.dir;
const server = Bun.serve({
  port: Number(process.env.PORT || 8000),
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      return new Response('Forbidden', { status: 403 });
    }
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Content-Type': file.type });
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, file.size - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end || start >= file.size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(request.method === 'HEAD' ? null : file.slice(start, end + 1), { status: 206, headers });
    }
    headers.set('Content-Length', String(file.size));
    return new Response(request.method === 'HEAD' ? null : file, { headers });
  },
});

console.log(`Morada: ${server.url}`);
