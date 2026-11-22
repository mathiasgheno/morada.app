import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const argument = name => process.argv[process.argv.indexOf(name) + 1];
const root = resolve(import.meta.dirname, '..');
const resources = process.argv.includes('--resources') ? resolve(argument('--resources')) : resolve(root, 'desktop-resources/runtime');
const binary = process.argv.includes('--binary') ? resolve(argument('--binary')) : process.execPath;
const data = await mkdtemp(join(tmpdir(), 'morada-packaged-smoke-'));
const session = randomUUID().replaceAll('-', '');
const env = { ...process.env, PORT: '0', MORADA_ASSET_DIR: resources, MORADA_DATA_DIR: data,
  MORADA_DESKTOP_RUNTIME: '1', MORADA_PARENT_PID: String(process.pid), MORADA_SESSION_TOKEN: session };
const child = spawn(binary, ['--no-install', join(resources, 'server.ts')], { env, cwd: data, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = '';
child.stderr.on('data', chunk => { errors += chunk; });
try {
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('Servidor não iniciou: ' + errors)); }, 15000);
    let output = '';
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Servidor encerrou (${code}): ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/MORADA_READY (http:\/\/127\.0\.0\.1:\d+\/)\r?\n/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  assert.equal((await fetch(origin + 'api/projetos')).status, 403);
  const bootstrap = await fetch(origin + 'launcher.html?session=' + session, { redirect: 'manual' });
  assert.equal(bootstrap.status, 302);
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  async function request(path, body, method = 'POST') {
    const response = await fetch(origin + path, { method: body ? method : 'GET',
      headers: { Cookie: cookie, Origin: new URL(origin).origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
    return response.json();
  }
  assert.deepEqual(await request('api/projetos'), []);
  assert.equal((await request('api/recursos')).map.ready, false);
  const source = { id: 'teste', name: 'Projeto temporário', city: 'São Paulo', state: 'SP', reference: null, createdAt: new Date().toISOString() };
  const properties = [{ id: 123456789, origem: 'viva-real', note: { text: 'Preservar', updatedAt: new Date().toISOString() }, walkability: { score: 35 }, archived: false }];
  const project = await request('api/projetos/importar', { type: 'morada-project', version: 1, project: source, properties, favorites: ['123456789'] });
  const backup = await request(`api/projetos/${project.id}/exportar`);
  assert.deepEqual(backup.properties, properties);
  assert.deepEqual(backup.favorites, ['123456789']);
  await request(`projetos/${project.id}/api/anotacoes`, { '123456789': { text: 'Atualizado', updatedAt: new Date().toISOString() } }, 'PUT');
  await request(`projetos/${project.id}/api/arquivamento`, { id: '123456789', archived: true }, 'PUT');
  const stored = JSON.parse(await readFile(join(data, 'projetos', project.id, 'imoveis.json'), 'utf8'));
  assert.equal(stored[0].note.text, 'Atualizado'); assert.equal(stored[0].archived, true);
  const added = await request(`api/projetos/${project.id}/imoveis`, { value: '123456789' });
  assert.match(added.message, /já existe/);
  const playwright = await spawnResult(binary, ['--no-install', '-e', `import { chromium } from ${JSON.stringify(join(resources, 'node_modules/playwright/index.mjs'))}; if (!chromium) process.exit(1);`]);
  assert.equal(playwright, 0);
  for (const name of ['imoveis.json', 'favoritos.json', 'sao-paulo.pmtiles', 'projetos']) assert.ok(!(await readdir(resources)).includes(name), `Dado pessoal/grande incluído: ${name}`);
  console.log('Smoke OK: runtime independente, sessão protegida, projeto vazio, importar/exportar, notas, arquivar, inclusão e Playwright.');
} finally {
  const closed = new Promise(resolve => child.once('exit', resolve));
  if (child.exitCode === null) { child.kill(); await closed; }
  await rm(data, { recursive: true, force: true });
}

function spawnResult(command, args) {
  return new Promise((resolve, reject) => { const process = spawn(command, args, { cwd: data, env, stdio: 'inherit' }); process.once('error', reject); process.once('exit', resolve); });
}
