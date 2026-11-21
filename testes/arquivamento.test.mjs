import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { definirArquivamento } from '../arquivamento.mjs';

test('Arquivar e desarquivar preserva notas, preços e demais imóveis', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morada-archive-'));
  const file = pathToFileURL(join(directory, 'imoveis.json'));
  const properties = [{ id: 894723967, rentValue: 3000, note: { text: 'Preservar' } }, { id: 893499121, archived: false }];
  try {
    await writeFile(file, JSON.stringify(properties));
    await definirArquivamento(file, '894723967', true);
    const archived = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(archived[0].archived, true);
    assert.ok(archived[0].archivedAt);
    assert.deepEqual(archived[0].note, properties[0].note);
    assert.equal(archived[0].rentValue, 3000);
    assert.deepEqual(archived[1], properties[1]);
    const before = await readFile(file, 'utf8');
    await assert.rejects(definirArquivamento(file, '123', true), /não encontrado/);
    await assert.rejects(definirArquivamento(file, '894723967', 'true'), /inválidos/);
    assert.equal(await readFile(file, 'utf8'), before);
    await definirArquivamento(file, '894723967', false);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ ...properties[0], archived: false }, properties[1]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
