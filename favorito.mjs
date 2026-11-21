import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adquirirTrava } from './arquivo-lock.mjs';
import { arquivoDados } from './dados-projeto.mjs';

export function alterarFavoritos(favorites, id, remove = false) {
  if (!Array.isArray(favorites) || !favorites.every(value => /^\d{7,12}$/.test(String(value)))) throw new Error('favoritos.json inválido; arquivo preservado.');
  if (!/^\d{7,12}$/.test(String(id))) throw new Error('Informe o ID completo do imóvel.');
  const ids = new Set(favorites.map(String));
  if (remove) ids.delete(String(id)); else ids.add(String(id));
  return [...ids];
}

async function main() {
  const args = process.argv.slice(2);
  const file = arquivoDados('favoritos.json');
  const temporary = new URL(`${file.href}.tmp`);
  const release = adquirirTrava(new URL(`${file.href}.lock`));
  try {
    let favorites;
    try { favorites = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') favorites = []; else throw error; }
    if (args.length === 1 && args[0] === '--list') {
      if (!Array.isArray(favorites)) throw new Error('favoritos.json inválido');
      console.log(favorites.length ? favorites.join('\n') : 'Nenhum favorito.');
      return;
    }
    const id = args.find(value => !value.startsWith('--'));
    const remove = args.includes('--remove');
    if (args.some(value => value.startsWith('--') && value !== '--remove') || args.filter(value => !value.startsWith('--')).length !== 1) throw new Error('Uso: bun run favorito ID [--remove] ou bun run favorito --list');
    const next = alterarFavoritos(favorites, id, remove);
    if (!remove) {
      const properties = JSON.parse(await readFile(arquivoDados('imoveis.json'), 'utf8'));
      if (!properties.some(property => String(property.id) === id)) throw new Error('Imóvel não encontrado em imoveis.json.');
    }
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    console.log(`${id}: ${remove ? 'removido dos' : 'marcado nos'} favoritos. Recarregue a página.`);
  } finally { await unlink(temporary).catch(() => {}); release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
