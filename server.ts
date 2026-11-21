import { resolve, sep } from 'node:path';
import { verificarAnuncios, estadoAnuncios } from './anuncios';
import { lerAnotacoes, salvarAnotacoes } from './anotacoes.mjs';

const root = import.meta.dir;
const server = Bun.serve({
  port: Number(process.env.PORT || 8000),
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/api/anotacoes') {
      const headers = { 'Cache-Control': 'no-store' };
      if (request.method === 'GET') {
        try { return Response.json(await lerAnotacoes(), { headers }); }
        catch { return Response.json({ error: 'Não foi possível ler as anotações.' }, { status: 500, headers }); }
      }
      if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
      if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return new Response('Forbidden', { status: 403 });
      try {
        const body = await request.text();
        if (body.length > 5_000_000) return new Response('Arquivo maior que 5 MB', { status: 413 });
        return Response.json(await salvarAnotacoes(JSON.parse(body)), { headers });
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
    }
    if (pathname === '/api/anuncios') {
      try {
        await verificarAnuncios();
        return Response.json(estadoAnuncios(), { headers: { 'Cache-Control': 'no-store' } });
      }
      catch { return Response.json({ error: 'Falha ao consultar anúncios' }, { status: 503 }); }
    }
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
