import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { salvarAnotacoes, lerAnotacoes } from '../anotacoes.mjs';

test('Anotações persistem no imóvel sem alterar anúncio, status ou outros registros', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'morada-notes-'));
  const file = pathToFileURL(join(folder, 'imoveis.json'));
  const properties = [{ id: 894723967, statusAnuncio: { status: 'active' }, images: [{ url: 'foto' }] }, { id: 2909076148, origem: 'viva-real' }];
  const note = { text: 'Texto com espaços \n<script>literal</script>', updatedAt: '2026-11-16T03:12:36.595Z' };
  try {
    await writeFile(file, JSON.stringify(properties));
    await salvarAnotacoes({ '894723967': note }, file);
    assert.deepEqual(await lerAnotacoes(file), { '894723967': note });
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ ...properties[0], note }, properties[1]]);
    const original = await readFile(file, 'utf8');
    await assert.rejects(salvarAnotacoes({ '894723967': null, '999': note }, file), /não encontrado/);
    assert.equal(await readFile(file, 'utf8'), original);
    await assert.rejects(salvarAnotacoes({ '894723967': { text: 123 } }, file), /inválida/);
    assert.equal(await readFile(file, 'utf8'), original);
    await salvarAnotacoes({ '894723967': null }, file);
    assert.deepEqual(await lerAnotacoes(file), {});
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), properties);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
