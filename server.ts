import { resolve, sep } from 'node:path';
import { verificarAnuncios } from './anuncios';
import { lerAnotacoes, salvarAnotacoes } from './anotacoes.mjs';
import { criarRepositorioProjetos, MAX_PROJECT_BACKUP_BYTES } from './projetos.mjs';
import { criarConsultaEnderecos } from './enderecos.mjs';
import { definirArquivamento } from './arquivamento.mjs';
import { assetRoot, dataRoot } from './caminhos.mjs';
import { criarGerenciadorRecursos } from './recursos-desktop.mjs';

const root = assetRoot;
const projects = criarRepositorioProjetos();
const resources = criarGerenciadorRecursos({ assetRoot, dataRoot });
const consultarEndereco = criarConsultaEnderecos();
await projects.inicializar();
const jsonHeaders = { 'Cache-Control': 'no-store' };
function permittedWrite(request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('content-type')?.startsWith('application/json');
}
async function bodyJSON(request, limit = 5_000_000) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error(`Arquivo maior que ${limit / 1_000_000} MB`);
  const body = await request.text();
  if (Buffer.byteLength(body) > limit) throw new Error(`Arquivo maior que ${limit / 1_000_000} MB`);
  return JSON.parse(body);
}
const server = Bun.serve({
  port: Number(process.env.PORT || 8000),
  hostname: '127.0.0.1',
  idleTimeout: 180,
  maxRequestBodySize: MAX_PROJECT_BACKUP_BYTES,
  async fetch(request) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('URL inválida', { status: 400 }); }
    const session = process.env.MORADA_SESSION_TOKEN;
    if (session) {
      const url = new URL(request.url);
      const cookie = `morada-${session.slice(0, 12)}`;
      if (pathname === '/launcher.html' && url.searchParams.get('session') === session) {
        return new Response(null, { status: 302, headers: { Location: '/launcher.html', 'Set-Cookie': `${cookie}=${session}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' } });
      }
      if (!request.headers.get('cookie')?.split(';').some(part => part.trim() === `${cookie}=${session}`)) return new Response('Sessão local inválida.', { status: 403 });
    }
    if (pathname === '/api/recursos') return request.method === 'GET' ? Response.json(await resources.status(), { headers: jsonHeaders }) : new Response(null, { status: 405 });
    if (pathname === '/api/recursos/mapa') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
      await resources.download();
      return Response.json(await resources.status(), { status: 202, headers: jsonHeaders });
    }
    if (pathname === '/api/endereco') {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      const parameters = new URL(request.url).searchParams;
      if (!parameters.get('lat') || !parameters.get('lng')) return Response.json({ error: 'Informe latitude e longitude.' }, { status: 400 });
      try { return Response.json(await consultarEndereco(Number(parameters.get('lat')), Number(parameters.get('lng'))), { headers: jsonHeaders }); }
      catch (error) { return Response.json({ error: error.message }, { status: 400, headers: jsonHeaders }); }
    }
    if (pathname === '/api/projetos/importar' && request.method === 'POST') {
      if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
      try { return Response.json(await projects.importar(await bodyJSON(request, MAX_PROJECT_BACKUP_BYTES)), { status: 201, headers: jsonHeaders }); }
      catch (error) { return Response.json({ error: error.message }, { status: 400, headers: jsonHeaders }); }
    }
    const exportRoute = /^\/api\/projetos\/([a-z0-9-]+)\/exportar$/.exec(pathname);
    if (exportRoute) {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      try {
        const backup = await projects.exportar(exportRoute[1]);
        const slug = backup.project.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'projeto';
        const contents = JSON.stringify(backup, null, 2) + '\n';
        if (Buffer.byteLength(contents) > MAX_PROJECT_BACKUP_BYTES) throw new Error('Projeto maior que 50 MB.');
        return new Response(contents, { headers: { ...jsonHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}.morada.json"` } });
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers: jsonHeaders }); }
    }
    if (pathname === '/api/projetos/restaurar' && request.method === 'POST') {
      if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
      try { return Response.json(await projects.restaurar((await bodyJSON(request)).token)); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
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
        if (!['POST', 'PUT', 'DELETE'].includes(request.method)) return new Response(null, { status: 405 });
        if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
        const input = await bodyJSON(request);
        if (id && request.method === 'DELETE') return Response.json(await projects.excluir(id, input.name));
        if (id && request.method === 'PUT') return Response.json(await projects.atualizar(id, input));
        if (!id && request.method === 'POST') {
          if (input.duplicateFrom && !Object.hasOwn(input, 'reference')) input.reference = (await projects.ler(input.duplicateFrom)).reference;
          return Response.json(await projects.criar(input), { status: 201 });
        }
        return new Response(null, { status: 405 });
      } catch (error) { return Response.json({ error: error.message }, { status: error.code === 'ENOENT' ? 404 : 400 }); }
    }
    let projectId;
    let dataFile;
    const scoped = /^\/projetos\/([^/]+)(\/.*)?$/.exec(pathname);
    if (scoped) {
      projectId = scoped[1];
      try { dataFile = await projects.arquivo(projectId, 'imoveis.json'); }
      catch { return new Response('Projeto não encontrado', { status: 404 }); }
      if (!scoped[2]) return Response.redirect(new URL(`${pathname}/`, request.url), 302);
      pathname = scoped[2];
    }
    if (!projectId && ['/', '/index.html'].includes(pathname)) return Response.redirect(new URL('/launcher.html', request.url), 302);
    if (!projectId && ['/api/arquivamento', '/api/anotacoes', '/api/anuncios'].includes(pathname)) return Response.json({ error: 'Abra um projeto para acessar seus dados.' }, { status: 404 });
    if (pathname === '/api/arquivamento') {
      if (request.method !== 'PUT') return new Response(null, { status: 405 });
      if (!permittedWrite(request)) return new Response('Forbidden', { status: 403 });
      try {
        const body = await bodyJSON(request);
        return Response.json(await definirArquivamento(dataFile, body.id, body.archived), { headers: jsonHeaders });
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers: jsonHeaders }); }
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
    if (!/^\/(?:|index\.html|launcher\.html|(?:style|theme|launcher|ui)\.css|(?:metro|estabelecimentos-locais)\.json|sao-paulo\.pmtiles|src\/[a-z0-9-]+\.mjs|assets\/[a-z0-9-]+\.(?:svg|png)|vendor\/(?:leaflet\.(?:css|js)|protomaps-leaflet\.js|images\/[a-z0-9-]+\.png))$/.test(pathname)) return new Response('Not found', { status: 404 });
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      return new Response('Forbidden', { status: 403 });
    }
    const file = Bun.file(pathname === '/sao-paulo.pmtiles' ? await resources.mapFile() : path);
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
if (process.env.MORADA_DESKTOP_RUNTIME) {
  console.log(`MORADA_READY ${server.url}`);
  const parent = Number(process.env.MORADA_PARENT_PID);
  if (Number.isInteger(parent) && parent > 0) setInterval(() => {
    try { process.kill(parent, 0); }
    catch (error) { if (error.code === 'ESRCH') { server.stop(true); process.exit(0); } }
  }, 2000).unref();
}
