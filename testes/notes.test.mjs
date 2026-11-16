import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotes, parseNotesBackup } from '../src/notes.mjs';

test('Backup valida formato e preserva textos sem interpretar HTML', () => {
  const notes = { '893631548': { text: '<script>teste</script>', updatedAt: '2026-11-15T12:00:00Z' } };
  assert.deepEqual(parseNotesBackup(JSON.stringify({ type: 'morada-notes', version: 1, notes })), notes);
  assert.throws(() => parseNotesBackup(JSON.stringify({ type: 'outro', version: 1, notes })));
  assert.throws(() => parseNotesBackup(JSON.stringify({ type: 'morada-notes', version: 1, notes: { '1': { text: 123 } } })));
});
test('Importação preserva conflitos por padrão e só substitui quando solicitado', () => {
  const current = { '1': { text: 'atual', updatedAt: '2026-11-15' } };
  const incoming = { '1': { text: 'backup', updatedAt: '2026-11-14' }, '2': { text: 'nova', updatedAt: '2026-11-15' } };
  assert.equal(mergeNotes(current, incoming)['1'].text, 'atual');
  assert.equal(mergeNotes(current, incoming)['2'].text, 'nova');
  assert.equal(mergeNotes(current, incoming, true)['1'].text, 'backup');
  assert.equal(current['1'].text, 'atual');
});
