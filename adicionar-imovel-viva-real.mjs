import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adquirirTrava } from './arquivo-lock.mjs';
import { consultarEstabelecimentos } from './estabelecimentos.mjs';

const file = new URL('./imoveis.json', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let release;
try {
  const url = new URL(process.argv[2]);
  const id = url.pathname.match(/-id-(\d+)\/?$/)?.[1];
  if (url.protocol !== 'https:' || !['www.vivareal.com.br', 'vivareal.com.br'].includes(url.hostname) || !id) throw new Error('Informe a URL HTTPS completa do anúncio do Viva Real.');
  release = adquirirTrava(new URL('./imoveis.json.lock', import.meta.url));
  const properties = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(properties)) throw new Error('imoveis.json precisa conter uma lista.');
  const existing = properties.find(property => String(property.id) === id);
  if (existing) {
    if (existing.origem !== 'viva-real') throw new Error('Este ID já pertence a outra origem; inclusão cancelada para preservar favoritos e anotações.');
    console.log(`Imóvel ${id} já existe; nenhuma alteração.`);
  } else {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./scrap-vivareal.mjs', import.meta.url)), url.href], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    if (code !== 0) throw new Error(`Extração falhou (${code}); lista preservada.`);
    const property = JSON.parse(Buffer.concat(chunks).toString());
    if (String(property.id) !== id) throw new Error('Resposta para outro imóvel; lista preservada.');
    property.origem = 'viva-real';
    property.url = url.href;
    property.statusAnuncio = { status: 'active', checkedAt: Date.now(), method: 'browser-page-access' };
    try { [property.nearbyEstablishments] = await consultarEstabelecimentos([property]); }
    catch (error) { property.nearbyEstablishments = { radius: 350, items: [], checkedAt: null, error: error.message }; console.warn(`Estabelecimentos pendentes: ${error.message}`); }
    await writeFile(temporary, JSON.stringify([...properties, property], null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    console.log(`Viva Real ${id} adicionado. Recarregue a página.`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (release) { await unlink(temporary).catch(() => {}); release(); } }
