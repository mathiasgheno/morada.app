import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { consultarEstabelecimentos } from './estabelecimentos.mjs';

const file = new URL('./imoveis.json', import.meta.url);
const lock = new URL('./imoveis.json.lock', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let locked = false;
try {
  await writeFile(lock, '', { flag: 'wx' });
  locked = true;
  const properties = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(properties)) throw new Error('Formato inválido');
  const results = await consultarEstabelecimentos(properties);
  properties.forEach((property, index) => { property.nearbyEstablishments = results[index]; });
  await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, file);
  console.log(`${properties.length} imóveis atualizados com estabelecimentos em 350 m.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (locked) { await unlink(temporary).catch(() => {}); await unlink(lock); }
}
