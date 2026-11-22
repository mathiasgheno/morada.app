import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { criarRepositorioProjetos, DEFAULT_REFERENCE, validarIdProjeto } from '../projetos.mjs';
import { salvarAnotacoes } from '../anotacoes.mjs';
import { adquirirTrava } from '../arquivo-lock.mjs';

test('Projetos copiam o legado uma vez, isolam cópias e compartilham apenas os assets', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'morada-projects-'));
  const legacyDirectory = pathToFileURL(temp + '/');
  const directory = new URL('projetos/', legacyDirectory);
  const repository = criarRepositorioProjetos({ directory, legacyDirectory });
  const note = { text: 'Original', updatedAt: '2026-11-16T03:12:36.595Z' };
  const original = JSON.stringify([{ id: 894723967, note, statusAnuncio: { status: 'active' } }]);
  try {
    await writeFile(new URL('imoveis.json', legacyDirectory), original);
    await writeFile(new URL('favoritos.json', legacyDirectory), '["894723967"]');
    await repository.inicializar();
    const [initial] = await repository.listar();
    assert.equal(initial.propertyCount, 1);
    assert.equal(initial.noteCount, 1);
    assert.equal(initial.favoriteCount, 1);
    const source = await repository.arquivo(initial.id, 'imoveis.json');
    assert.equal(await readFile(source, 'utf8'), original);
    const copy = await repository.criar({ name: 'Perto do Arca', reference: { ...DEFAULT_REFERENCE, name: 'Arca', lat: -23.54 }, duplicateFrom: initial.id });
    const copiedFile = await repository.arquivo(copy.id, 'imoveis.json');
    await salvarAnotacoes({ '894723967': { ...note, text: 'Só na cópia' } }, copiedFile);
    assert.equal(await readFile(source, 'utf8'), original);
    assert.equal(await readFile(new URL('imoveis.json', legacyDirectory), 'utf8'), original);
    assert.equal((await repository.ler(initial.id)).reference.lat, DEFAULT_REFERENCE.lat);
    assert.equal((await repository.ler(copy.id)).reference.lat, -23.54);
    await repository.inicializar();
    assert.equal((await repository.listar()).length, 2);
    const empty = await repository.criar({ name: 'Nova busca' });
    assert.equal(empty.reference, null);
    const noReferenceCopy = await repository.criar({ name: 'Cópia sem referência', duplicateFrom: initial.id, reference: null });
    assert.equal(noReferenceCopy.reference, null);
    await repository.atualizar(empty.id, { name: 'Agora com referência', reference: DEFAULT_REFERENCE });
    assert.deepEqual((await repository.ler(empty.id)).reference, DEFAULT_REFERENCE);
    await repository.atualizar(empty.id, { name: 'Novamente sem referência', reference: null });
    assert.equal((await repository.ler(empty.id)).reference, null);
    assert.deepEqual(JSON.parse(await readFile(await repository.arquivo(empty.id, 'imoveis.json'), 'utf8')), []);
    assert.deepEqual((await readdir(new URL(`${empty.id}/`, directory))).sort(), ['favoritos.json', 'imoveis.json', 'projeto.json']);
    await assert.rejects(repository.arquivo(copy.id, '../imoveis.json'));
    await assert.rejects(repository.criar({ name: '', reference: DEFAULT_REFERENCE }));
    await assert.rejects(repository.criar({ name: 'Outra cidade', reference: { ...DEFAULT_REFERENCE, lat: 0 } }));
    for (const id of ['../', '/tmp', 'a/b', '.', 'a%2fb']) assert.throws(() => validarIdProjeto(id));
    const beforeDeletion = (await repository.listar()).length;
    const release = adquirirTrava(new URL(`${source.href}.lock`));
    try { await assert.rejects(repository.excluir(initial.id, initial.name), /atualização está ativa/); }
    finally { release(); }
    assert.equal(await readFile(source, 'utf8'), original);
    await assert.rejects(repository.excluir(initial.id, 'Outro nome'), /nome/);
    assert.equal((await repository.listar()).length, beforeDeletion);
    const deleted = await repository.excluir(initial.id, initial.name);
    assert.equal((await repository.listar()).length, beforeDeletion - 1);
    await assert.rejects(repository.ler(initial.id));
    await repository.inicializar();
    assert.equal((await repository.listar()).length, beforeDeletion - 1);
    assert.equal(await readFile(new URL('imoveis.json', legacyDirectory), 'utf8'), original);
    await repository.restaurar(deleted.token);
    assert.equal((await repository.listar()).length, beforeDeletion);
    assert.equal(await readFile(await repository.arquivo(initial.id, 'imoveis.json'), 'utf8'), original);
    await assert.rejects(repository.restaurar('../imoveis.json'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
