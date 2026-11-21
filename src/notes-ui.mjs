import { validateNotes, parseNotesBackup, mergeNotes } from './notes.mjs';

export function initNotes({ onChange, getProperty }) {
  const element = id => document.getElementById(id);
  const dialog = element('notesDialog');
  const textarea = element('noteText');
  let notes = {};
  let propertyId;
  let timer;
  let dirty = false;
  let revision = 0;
  let pending = Promise.resolve();
  async function request(changes) {
    const response = await fetch('/api/anotacoes', changes ? {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      signal: AbortSignal.timeout(15000),
    } : { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return validateNotes(result);
  }
  function save() {
    clearTimeout(timer);
    if (!dirty) return Promise.resolve(true);
    const id = propertyId;
    const version = revision;
    const note = textarea.value.trim() ? { text: textarea.value, updatedAt: new Date().toISOString() } : null;
    pending = pending.catch(() => {}).then(async () => {
      try {
        notes = await request({ [id]: note });
        if (id === propertyId && version === revision) {
          dirty = false;
          element('noteSaveStatus').textContent = 'Salvo no arquivo de imóveis';
        }
        onChange();
        return true;
      } catch (error) {
        element('noteSaveStatus').textContent = `Não foi possível salvar: ${error.message}. Copie o texto antes de sair.`;
        return false;
      }
    });
    return pending;
  }
  textarea.addEventListener('input', () => {
    dirty = true;
    revision++;
    element('noteSaveStatus').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(save, 300);
  });
  element('closeNotes').addEventListener('click', async () => { if (await save() && !dirty) dialog.close(); });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    save().then(ok => { if (ok && !dirty) dialog.close(); });
  });
  dialog.addEventListener('close', () => document.querySelector(`[data-id="${CSS.escape(propertyId)}"] [data-action="notes"]`)?.focus({ preventScroll: true }));
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  element('notesTools').addEventListener('click', async () => {
    element('notesBackupDialog').showModal();
    try {
      notes = await request();
      element('notesBackupStatus').textContent = `${Object.keys(notes).length} imóveis com anotações no arquivo de imóveis.`;
    } catch (error) { element('notesBackupStatus').textContent = `Não foi possível ler as anotações: ${error.message}`; }
  });
  element('closeNotesBackup').addEventListener('click', () => element('notesBackupDialog').close());
  element('exportNotes').addEventListener('click', async () => {
    try {
      notes = await request();
      const data = { type: 'morada-notes', version: 1, exportedAt: new Date().toISOString(), notes };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `anotacoes-imoveis-${new Date().toLocaleDateString('sv-SE')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      element('notesBackupStatus').textContent = 'Backup exportado.';
    } catch (error) { element('notesBackupStatus').textContent = error.message; }
  });
  element('importNotesButton').addEventListener('click', () => element('importNotes').click());
  element('importNotes').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Backup maior que 5 MB.');
      const incoming = parseNotesBackup(await file.text());
      const current = await request();
      const conflicts = Object.keys(incoming).filter(id => current[id] && current[id].text !== incoming[id].text);
      const replace = conflicts.length ? window.confirm(`${conflicts.length} anotações já existem com textos diferentes (IDs: ${conflicts.join(', ')}).\n\nOK: substituir pelas do backup.\nCancelar: manter as atuais e importar somente as novas.`) : false;
      const merged = mergeNotes(current, incoming, replace);
      const changes = Object.fromEntries(Object.keys(incoming).filter(id => !current[id] || replace).map(id => [id, merged[id]]));
      notes = Object.keys(changes).length ? await request(changes) : current;
      onChange();
      element('notesBackupStatus').textContent = `Backup importado. ${Object.keys(notes).length} imóveis com anotações. ${conflicts.length && !replace ? 'Conflitos preservados.' : ''}`;
    } catch (error) { element('notesBackupStatus').textContent = `Importação não realizada: ${error.message}`; }
    event.target.value = '';
  });
  return {
    load(properties) {
      notes = validateNotes(Object.fromEntries(properties.filter(property => property.raw.note).map(property => [property.id, property.raw.note])));
    },
    has: id => Boolean(notes[id]?.text.trim()),
    open(id) {
      propertyId = id;
      revision++;
      textarea.value = notes[id]?.text || '';
      dirty = false;
      element('noteTitle').textContent = `Anotação · ${getProperty(id)?.title || id}`;
      element('noteSaveStatus').textContent = notes[id] ? `Salvo no arquivo de imóveis · ${new Date(notes[id].updatedAt).toLocaleString('pt-BR')}` : 'Sua anotação será salva automaticamente no arquivo de imóveis.';
      dialog.showModal();
      textarea.focus();
    },
  };
}
