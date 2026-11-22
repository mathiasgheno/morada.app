import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { adquirirTrava } from './arquivo-lock.mjs';
import { validateNotes } from './src/notes.mjs';

export function extrairAnotacoes(properties) {
  return validateNotes(Object.fromEntries(properties.filter(property => property.note?.text?.trim()).map(property => [String(property.id), property.note])));
}
export async function lerAnotacoes(file) {
  return extrairAnotacoes(JSON.parse(await readFile(file, 'utf8')));
}
export async function salvarAnotacoes(changes, file) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Anotações inválidas');
  const notes = validateNotes(Object.fromEntries(Object.entries(changes).filter(([, note]) => note !== null)));
  const release = adquirirTrava(new URL(`${file.href}.lock`));
  const temporary = new URL(`${file.href}.notes-${process.pid}.tmp`);
  try {
    const properties = JSON.parse(await readFile(file, 'utf8'));
    const ids = new Set(properties.map(property => String(property.id)));
    for (const id of Object.keys(changes)) if (!ids.has(id)) throw new Error(`Imóvel ${id} não encontrado; nenhuma anotação foi alterada.`);
    for (const property of properties) {
      const id = String(property.id);
      if (!Object.hasOwn(changes, id)) continue;
      if (notes[id]?.text.trim()) property.note = notes[id];
      else delete property.note;
    }
    await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    return extrairAnotacoes(properties);
  } finally { await unlink(temporary).catch(() => {}); release(); }
}
