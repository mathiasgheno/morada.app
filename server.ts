import { resolve, sep } from 'node:path';
import { verificarAnuncios } from './anuncios';
import { lerAnotacoes, salvarAnotacoes } from './anotacoes.mjs';
import { criarRepositorioProjetos } from './projetos.mjs';
import { criarConsultaEnderecos } from './enderecos.mjs';

const root = import.meta.dir;
const projects = criarRepositorioProjetos();
const consultarEndereco = criarConsultaEnderecos();
await projects.inicializar();
const jsonHeaders = { 'Cache-Control': 'no-store' };
function permittedWrite(request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('content-type')?.startsWith('application/json');
}
async function bodyJSON(request) {
  const body = await request.text();
  if (body.length > 5_000_000) throw new Error('Arquivo maior que 5 MB');
  return JSON.parse(body);
}
const server = Bun.serve({
  port: Number(process.env.PORT || 8000),
  hostname: '127.0.0.1',
  idleTimeout: 180,
  async fetch(request) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('URL inválida', { status: 400 }); }
    if (pathname === '/api/endereco') {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      const parameters = new URL(request.url).searchParams;
      if (!parameters.get('lat') || !parameters.get('lng')) return Response.json({ error: 'Informe latitude e longitude.' }, { status: 400 });
      try { return Response.json(await consultarEndereco(Number(parameters.get('lat')), Number(parameters.get('lng'))), { headers: jsonHeaders }); }
      catch (error) { return Response.json({ error: error.message }, { status: 400, headers: jsonHeaders }); }
    }
    const projectRoute = /^\/api\/projetos(?:\/([a-z0-9-]+)(?:\/(imoveis))?)?$/.exec(pathname);
    if (projectRoute) {
      try {
        const id = projectRoute[1];
        if (projectRoute[2]) {
          if (request.method !== 'POST') return new Response(null, { status: 405 });
          if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
          await projects.ler(id);
          const input = await bodyJSON(request);
          if (typeof input.value !== 'string' || input.value.length > 2000) throw new Error('Informe o ID ou URL do anúncio.');
          const quintoAndar = /^\d{7,12}$/.test(input.value);
          if (!quintoAndar) {
            const url = new URL(input.value);
            if (url.protocol !== 'https:' || !['vivareal.com.br', 'www.vivareal.com.br'].includes(url.hostname)) throw new Error('Informe o ID do QuintoAndar ou uma URL do VivaReal.');
          }
          const child = Bun.spawn([process.execPath, resolve(root, quintoAndar ? 'adicionar-imovel.mjs' : 'adicionar-imovel-viva-real.mjs'), input.value, '--project', id], { cwd: root, env: { ...process.env, MORADA_PROJECT_ID: id }, stdout: 'pipe', stderr: 'pipe' });
          const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
          if (code !== 0) throw new Error((stderr || stdout || 'Falha ao adicionar imóvel.').slice(-3000));
          return Response.json({ message: stdout.trim() });
        }
        if (request.method === 'GET') return Response.json(id ? await projects.ler(id) : await projects.listar(), { headers: jsonHeaders });
        if (!['POST', 'PUT'].includes(request.method)) return new Response(null, { status: 405 });
        if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
        const input = await bodyJSON(request);
        if (id && request.method === 'PUT') return Response.json(await projects.atualizar(id, input));
        if (!id && request.method === 'POST') {
          if (input.duplicateFrom && !input.reference) input.reference = (await projects.ler(input.duplicateFrom)).reference;
          return Response.json(await projects.criar(input), { status: 201 });
        }
        return new Response(null, { status: 405 });
      } catch (error) { return Response.json({ error: error.message }, { status: error.code === 'ENOENT' ? 404 : 400 }); }
    }
    let projectId;
    let dataFile = new URL('./imoveis.json', import.meta.url);
    const scoped = /^\/projetos\/([^/]+)(\/.*)?$/.exec(pathname);
    if (scoped) {
      projectId = scoped[1];
      try { dataFile = await projects.arquivo(projectId, 'imoveis.json'); }
      catch { return new Response('Projeto não encontrado', { status: 404 }); }
      if (!scoped[2]) return Response.redirect(new URL(`${pathname}/`, request.url), 302);
      pathname = scoped[2];
    }
    if (pathname === '/api/anotacoes') {
      const headers = { 'Cache-Control': 'no-store' };
      if (request.method === 'GET') {
        try { return Response.json(await lerAnotacoes(dataFile), { headers }); }
        catch { return Response.json({ error: 'Não foi possível ler as anotações.' }, { status: 500, headers }); }
      }
      if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
      if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
      try {
        return Response.json(await salvarAnotacoes(await bodyJSON(request), dataFile), { headers });
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
    }
    if (pathname === '/api/anuncios') {
      try {
        return Response.json(await verificarAnuncios(dataFile), { headers: jsonHeaders });
      }
      catch { return Response.json({ error: 'Falha ao consultar anúncios' }, { status: 503 }); }
    }
    if (projectId && ['/imoveis.json', '/favoritos.json', '/projeto.json'].includes(pathname)) {
      return new Response(Bun.file(await projects.arquivo(projectId, pathname.slice(1))), { headers: jsonHeaders });
    }
    // Somente assets públicos: nunca disponibiliza os diretórios de outros projetos.
    if (!/^\/(?:|index\.html|launcher\.html|(?:style|theme|launcher)\.css|(?:imoveis|imoveis\.exemplo|favoritos|metro|estabelecimentos-locais)\.json|sao-paulo\.pmtiles|src\/[a-z0-9-]+\.mjs|assets\/[a-z0-9-]+\.(?:svg|png))$/.test(pathname)) return new Response('Not found', { status: 404 });
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
