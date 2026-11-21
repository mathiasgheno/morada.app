import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { adquirirTrava } from './arquivo-lock.mjs';

export async function definirArquivamento(file, id, archived) {
  if (!/^\d{1,12}$/.test(String(id)) || typeof archived !== 'boolean') throw new Error('Dados de arquivamento inválidos.');
  const release = adquirirTrava(new URL(`${file.href}.lock`));
  const temporary = new URL(`${file.href}.archive-${process.pid}.tmp`);
  try {
    const properties = JSON.parse(await readFile(file, 'utf8'));
    const property = properties.find(property => String(property.id) === String(id));
    if (!property) throw new Error('Imóvel não encontrado.');
    property.archived = archived;
    if (archived) property.archivedAt = new Date().toISOString();
    else delete property.archivedAt;
    await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    return { id: String(id), archived: property.archived, archivedAt: property.archivedAt || null };
  } finally { await unlink(temporary).catch(() => {}); release(); }
}
