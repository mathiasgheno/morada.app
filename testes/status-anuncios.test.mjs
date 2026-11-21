import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { consultarStatusAnuncio, atualizarStatusAnuncios } from '../status-anuncios.mjs';

const response = (status, id) => ({ status, ok: status === 200, url: `https://www.quintoandar.com.br/imovel/${id}`, body: { cancel: async () => {} } });

test('Status diferencia acesso, remoção e falhas sem apagar confirmação anterior', async () => {
  const id = '894911604';
  assert.equal((await consultarStatusAnuncio(id, null, async () => response(404, id))).status, 'inactive');
  assert.equal((await consultarStatusAnuncio(id, null, async () => response(410, id))).status, 'inactive');
  const active = await consultarStatusAnuncio(id, null, async () => response(200, id));
  assert.equal(active.status, 'active');
  const blocked = await consultarStatusAnuncio(id, active, async () => response(429, id));
  assert.equal(blocked.status, 'active');
  assert.equal(blocked.checkedAt, active.checkedAt);
  assert.match(blocked.error, /429/);
  const failed = await consultarStatusAnuncio(id, null, async () => { throw new Error('timeout'); });
  assert.equal(failed.status, 'unknown');
  assert.equal(failed.checkedAt, null);
});

test('Persistência preserva alterações concorrentes, ignora VivaReal e respeita um minuto', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'morada-status-'));
  const file = pathToFileURL(join(folder, 'imoveis.json'));
  const properties = [{ id: 894911604, title: 'Original' }, { id: 2917113336, origem: 'viva-real', statusAnuncio: { status: 'active', checkedAt: 1 } }];
  try {
    await writeFile(file, JSON.stringify(properties));
    let calls = 0;
    await atualizarStatusAnuncios({ file, fetcher: async () => {
      calls++;
      const edited = JSON.parse(await readFile(file, 'utf8'));
      edited[0].title = 'Alterado durante a consulta';
      edited.push({ id: 893877048, origem: 'quinto-andar' });
      await writeFile(file, JSON.stringify(edited));
      return response(404, '894911604');
    } });
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(calls, 1);
    assert.equal(saved[0].title, 'Alterado durante a consulta');
    assert.equal(saved[0].statusAnuncio.status, 'inactive');
    assert.deepEqual(saved[1], properties[1]);
    assert.equal(saved.length, 3);
    await atualizarStatusAnuncios({ file, fetcher: async url => { calls++; return response(200, url.split('/').at(-1)); } });
    assert.equal(calls, 2); // Apenas o imóvel incluído durante a primeira consulta.
    await atualizarStatusAnuncios({ file, fetcher: async () => { throw new Error('Consulta antes de um minuto'); } });
    assert.equal((JSON.parse(await readFile(file, 'utf8')))[0].statusAnuncio.error, null);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
