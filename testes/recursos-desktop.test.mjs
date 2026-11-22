import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { criarGerenciadorRecursos } from '../recursos-desktop.mjs';

test('Mapa é baixado uma vez, verifica integridade e permite tentar novamente após falha', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morada-assets-'));
  const bytes = Buffer.from('mapa de teste');
  let calls = 0, valid = false;
  try {
    await writeFile(join(directory, 'recursos.json'), JSON.stringify({ map: { bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), url: 'https://raw.githubusercontent.com/example/map' } }));
    const manager = criarGerenciadorRecursos({ assetRoot: directory, dataRoot: directory,
      fetcher: async () => { calls++; return new Response(valid ? bytes : Buffer.alloc(bytes.length)); } });
    async function wait() {
      for (let i = 0; i < 200; i++) {
        const { map } = await manager.status();
        if (['ready', 'error'].includes(map.status)) return map;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error('Download não terminou');
    }
    assert.equal((await manager.status()).map.ready, false);
    await manager.download();
    assert.equal((await wait()).status, 'error');
    assert.equal((await manager.status()).map.ready, false);
    valid = true;
    await Promise.all([manager.download(), manager.download()]);
    assert.equal((await wait()).ready, true);
    assert.deepEqual(await readFile(await manager.mapFile()), bytes);
    assert.equal(calls, 2);
    await manager.download();
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
