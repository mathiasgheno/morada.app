export const NOTES_KEY = 'morada.notes.v1';

export function validateNotes(notes) {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) throw new Error('Formato de anotações inválido.');
  const result = {};
  for (const [id, note] of Object.entries(notes)) {
    if (!/^\d{1,12}$/.test(id) && !/^DEMO-\d+$/.test(id)) throw new Error('ID inválido no backup.');
    if (!note || typeof note.text !== 'string' || note.text.length > 20000 || typeof note.updatedAt !== 'string' || !Number.isFinite(Date.parse(note.updatedAt))) throw new Error('Anotação inválida no backup.');
    result[id] = { text: note.text, updatedAt: note.updatedAt };
  }
  return result;
}

export function parseNotesBackup(text) {
  const data = JSON.parse(text);
  if (data.version !== 1 || data.type !== 'morada-notes') throw new Error('Este arquivo não é um backup de anotações do Morada.');
  return validateNotes(data.notes);
}

export function mergeNotes(current, incoming, replace = false) {
  const merged = { ...validateNotes(current) };
  for (const [id, note] of Object.entries(validateNotes(incoming))) {
    if (!merged[id] || replace) merged[id] = note;
  }
  return merged;
}
