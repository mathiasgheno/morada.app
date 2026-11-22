import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { criarRepositorioProjetos } from '../projetos.mjs';

test('Backup restaura todos os dados em outro ID e rejeita arquivos inválidos sem criar projetos parciais', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'morada-project-backup-'));
  const legacyDirectory = pathToFileURL(temp + '/');
  const repo = criarRepositorioProjetos({ directory: new URL('projetos/', legacyDirectory), legacyDirectory });
  const properties = [{ id: 894723967, origem: 'quinto-andar', lat: -23.55, lng: -46.65,
    images: [{ url: 'https://example.com/foto.jpg' }], video: { hasVideo: true, items: [{ provider: 'VIMEO', sourceId: '12345' }] },
    note: { text: 'Texto original\ncom espaços e acentuação. ', updatedAt: '2026-11-17T04:08:30.981Z' },
    archived: true, archivedAt: '2026-11-21T12:00:00Z', statusAnuncio: { status: 'inactive', checkedAt: 1 },
    nearbyEstablishments: { radius: 300, checkedAt: '2026-11-21T12:00:00Z', items: [{ category: 'market', name: 'Mercado', openingHours: '24/7', is24Hours: true }] },
    walkability: { score: 35, radius: 300, categories: { market: { count: 1, nearest: 12, grade: 100 } } },
    futureField: { preserve: true } }];
  try {
    await writeFile(new URL('imoveis.json', legacyDirectory), JSON.stringify(properties));
    await writeFile(new URL('favoritos.json', legacyDirectory), '["894723967"]');
    await repo.inicializar();
    const [source] = await repo.listar();
    const configFile = await repo.arquivo(source.id, 'projeto.json');
    const config = JSON.parse(await readFile(configFile, 'utf8'));
    config.preferences = { custom: 'preservar' };
    await writeFile(configFile, JSON.stringify(config));
    const backup = JSON.parse(JSON.stringify(await repo.exportar(source.id)));
    assert.equal(backup.type, 'morada-project');
    assert.equal(backup.version, 1);
    assert.deepEqual(backup.properties, properties);
    assert.deepEqual(backup.favorites, ['894723967']);
    const imported = await repo.importar(backup);
    assert.notEqual(imported.id, source.id);
    assert.equal(imported.name, source.name);
    assert.deepEqual(imported.reference, source.reference);
    assert.deepEqual(imported.preferences, config.preferences);
    const roundtrip = await repo.exportar(imported.id);
    assert.deepEqual(roundtrip.properties, backup.properties);
    assert.deepEqual(roundtrip.favorites, backup.favorites);
    assert.deepEqual((await repo.exportar(source.id)).project, backup.project);
    const invalid = [
      { ...backup, type: 'outro' }, { ...backup, version: 2 },
      { ...backup, project: { ...backup.project, city: 'Outra cidade' } },
      { ...backup, project: { ...backup.project, id: '../fora' } },
      { ...backup, properties: [...properties, properties[0]] },
      { ...backup, properties: [{ ...properties[0], note: { text: 123 } }] },
    ];
    for (const input of invalid) await assert.rejects(repo.importar(input));
    assert.equal((await repo.listar()).length, 2);
    const metadata = { ...backup.project, duplicateFrom: '../nao-ler-diretorios' };
    const safe = await repo.importar({ ...backup, project: metadata });
    assert.deepEqual((await repo.exportar(safe.id)).properties, properties);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
