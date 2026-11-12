import { readFile, writeFile, rename, unlink } from 'node:fs/promises';

const id = process.argv[2];
const file = new URL('./imoveis.json', import.meta.url);
const lock = new URL('./imoveis.json.lock', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let locked = false;
try {
  if (!/^\d{7,12}$/.test(id || '')) throw new Error('Informe o ID completo: bun run add:imovel 893877048');
  await writeFile(lock, '', { flag: 'wx' });
  locked = true;
  let properties;
  try { properties = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') properties = [];
    else throw error;
  }
  if (!Array.isArray(properties)) throw new Error('imoveis.json precisa conter uma lista.');
  if (properties.some(property => String(property.id) === id)) {
    console.log(`Imóvel ${id} já existe; nenhuma alteração.`);
  } else {
    const response = await fetch(`https://www.quintoandar.com.br/property/v2/${id}?variant=0&showPartnerId=true&condoPageValidation=false`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`QuintoAndar respondeu HTTP ${response.status}.`);
    const property = await response.json();
    if (!property || typeof property !== 'object' || Array.isArray(property) || String(property.id) !== id) throw new Error('Resposta sem o ID solicitado.');
    await writeFile(temporary, JSON.stringify([...properties, property], null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    console.log(`Imóvel ${id} adicionado. Recarregue a página.`);
  }
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Outra inclusão está em andamento ou existe arquivo temporário pendente.' : error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    await unlink(temporary).catch(() => {});
    await unlink(lock);
  }
}
