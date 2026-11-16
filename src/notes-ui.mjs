import { NOTES_KEY, validateNotes, parseNotesBackup, mergeNotes } from './notes.mjs';

export function initNotes({ onChange, getProperty }) {
  const element = id => document.getElementById(id);
  const dialog = element('notesDialog');
  const textarea = element('noteText');
  let notes = {};
  let propertyId;
  let timer;
  let dirty = false;
  let loadError = '';
  function read() { return validateNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')); }
  try { notes = read(); } catch (error) { loadError = error.message; }
  function save() {
    clearTimeout(timer);
    if (!dirty) return true;
    try {
      const latest = read();
      if (textarea.value.trim()) latest[propertyId] = { text: textarea.value, updatedAt: new Date().toISOString() };
      else delete latest[propertyId];
      localStorage.setItem(NOTES_KEY, JSON.stringify(latest));
      notes = latest;
      dirty = false;
      element('noteSaveStatus').textContent = 'Salvo neste navegador';
      onChange();
      return true;
    } catch (error) {
      element('noteSaveStatus').textContent = `Não foi possível salvar: ${error.message}. Copie o texto antes de sair.`;
      return false;
    }
  }
  textarea.addEventListener('input', () => {
    dirty = true;
    element('noteSaveStatus').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(save, 300);
  });
  element('closeNotes').addEventListener('click', () => { if (save()) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (!save()) event.preventDefault(); });
  dialog.addEventListener('close', () => document.querySelector(`[data-id="${CSS.escape(propertyId)}"] [data-action="notes"]`)?.focus({ preventScroll: true }));
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', event => { if (dirty && !save()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    if (event.key !== NOTES_KEY || dirty) return;
    try { notes = read(); onChange(); } catch {}
  });
  element('notesTools').addEventListener('click', () => {
    element('notesBackupStatus').textContent = loadError ? `Não foi possível ler as anotações: ${loadError}` : `${Object.keys(notes).length} imóveis com anotações neste navegador.`;
    element('notesBackupDialog').showModal();
  });
  element('closeNotesBackup').addEventListener('click', () => element('notesBackupDialog').close());
  element('exportNotes').addEventListener('click', () => {
    try {
      notes = read();
      const data = { type: 'morada-notes', version: 1, exportedAt: new Date().toISOString(), notes };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `anotacoes-imoveis-${new Date().toLocaleDateString('sv-SE')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      element('notesBackupStatus').textContent = 'Backup exportado. Guarde o arquivo em um local seguro.';
    } catch (error) { element('notesBackupStatus').textContent = error.message; }
  });
  element('importNotesButton').addEventListener('click', () => element('importNotes').click());
  element('importNotes').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Backup maior que 5 MB.');
      const incoming = parseNotesBackup(await file.text());
      const current = read();
      const conflicts = Object.keys(incoming).filter(id => current[id] && current[id].text !== incoming[id].text);
      let replace = false;
      if (conflicts.length) replace = window.confirm(`${conflicts.length} anotações já existem com textos diferentes (IDs: ${conflicts.join(', ')}).\n\nOK: substituir pelas do backup.\nCancelar: manter as atuais e importar somente as novas.`);
      const merged = mergeNotes(current, incoming, replace);
      localStorage.setItem(NOTES_KEY, JSON.stringify(merged));
      notes = merged;
      loadError = '';
      onChange();
      element('notesBackupStatus').textContent = `Backup importado. ${Object.keys(notes).length} imóveis com anotações. ${conflicts.length && !replace ? 'Conflitos preservados.' : ''}`;
    } catch (error) { element('notesBackupStatus').textContent = `Importação não realizada: ${error.message}`; }
    event.target.value = '';
  });
  return {
    has: id => Boolean(notes[id]?.text.trim()),
    open(id) {
      propertyId = id;
      textarea.value = notes[id]?.text || '';
      dirty = false;
      element('noteTitle').textContent = `Anotação · ${getProperty(id)?.title || id}`;
      element('noteSaveStatus').textContent = loadError ? `Não foi possível ler o armazenamento: ${loadError}` : notes[id] ? `Salvo neste navegador · ${new Date(notes[id].updatedAt).toLocaleString('pt-BR')}` : 'Sua anotação será salva automaticamente neste navegador.';
      dialog.showModal();
      textarea.focus();
    },
  };
}
