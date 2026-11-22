import { cp, mkdir, rm, writeFile, readFile, chmod, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const target = process.env.TAURI_ENV_TARGET_TRIPLE || host;
if (target !== host) throw new Error('Este build requer um runner nativo da arquitetura escolhida para empacotar o Bun correto.');
const runtime = resolve(root, 'desktop-resources/runtime');
await rm(resolve(root, 'desktop-resources'), { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
const files = [
  'index.html', 'launcher.html', 'launcher.css', 'ui.css', 'assets', 'style.css', 'theme.css', 'src', 'vendor',
  'metro.json', 'estabelecimentos-locais.json', 'LICENSE', 'server.ts', 'anuncios.ts', 'anotacoes.mjs',
  'projetos.mjs', 'arquivo-lock.mjs', 'enderecos.mjs', 'arquivamento.mjs', 'caminhos.mjs', 'recursos-desktop.mjs',
  'status-anuncios.mjs', 'dados-projeto.mjs', 'estabelecimentos.mjs', 'videos.mjs',
  'adicionar-imovel.mjs', 'adicionar-imovel-viva-real.mjs', 'scrap-vivareal.mjs',
];
for (const name of files) await cp(resolve(root, name), resolve(runtime, name), { recursive: true });
// Playwright é incluído, mas não um navegador: o cadastro VivaReal usa o Chrome instalado.
for (const name of ['playwright', 'playwright-core']) {
  await mkdir(resolve(runtime, 'node_modules'), { recursive: true });
  await cp(resolve(root, 'node_modules', name), resolve(runtime, 'node_modules', name), { recursive: true, dereference: true });
}
const map = await readFile(resolve(root, 'sao-paulo.pmtiles'));
const revision = execFileSync('git', ['log', '-1', '--format=%H', '--', 'sao-paulo.pmtiles'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Mapa sem revisão Git para o download verificável.');
await writeFile(resolve(runtime, 'recursos.json'), JSON.stringify({ map: {
  bytes: map.length, sha256: createHash('sha256').update(map).digest('hex'),
  url: `https://raw.githubusercontent.com/mathiasgheno/morada.app/${revision}/sao-paulo.pmtiles`,
} }, null, 2));
const binary = resolve(root, `src-tauri/binaries/morada-runtime-${target}${process.platform === 'win32' ? '.exe' : ''}`);
await mkdir(dirname(binary), { recursive: true });
await cp(process.execPath, binary);
if (process.platform !== 'win32') await chmod(binary, 0o755);
const dist = resolve(root, 'desktop-dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Morada</title><p>Iniciando o Morada…</p></html>');
console.log(`Preparado ${target}: Bun ${(await stat(binary)).size} bytes; mapa separado do instalador.`);
