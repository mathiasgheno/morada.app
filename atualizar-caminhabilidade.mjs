import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { arquivoDados } from './dados-projeto.mjs';
import { adquirirTrava } from './arquivo-lock.mjs';
import { calculatePropertyWalkability } from './src/walkability.mjs';
import { pathToFileURL } from 'node:url';

export async function atualizarCaminhabilidade(file = arquivoDados('imoveis.json')) {
  const release = adquirirTrava(new URL(`${file.href}.lock`));
  const temporary = new URL(`${file.href}.walkability-${process.pid}.tmp`);
  try {
    const properties = JSON.parse(await readFile(file, 'utf8'));
    let calculated = 0;
    for (const property of properties) {
      property.walkability = calculatePropertyWalkability(property);
      if (property.walkability) calculated++;
    }
    await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    return { calculated, unavailable: properties.length - calculated };
  } finally { await unlink(temporary).catch(() => {}); release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  atualizarCaminhabilidade().then(result => console.log(`${result.calculated} índices salvos; ${result.unavailable} sem dados locais válidos.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
