import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConsultaEnderecos, formatarEndereco } from '../enderecos.mjs';

test('Endereço usa dados retornados sem inventar número e reutiliza consultas ao mesmo ponto', async () => {
  assert.equal(formatarEndereco({ street: 'Avenida Paulista', housenumber: '2300', city: 'São Paulo' }), 'Avenida Paulista, 2300 · São Paulo');
  assert.equal(formatarEndereco({ street: 'Rua Augusta' }), 'Rua Augusta · São Paulo');
  assert.throws(() => formatarEndereco({ city: 'São Paulo' }));
  let calls = 0;
  const lookup = criarConsultaEnderecos({ interval: 0, fetcher: async () => {
    calls++;
    return { ok: true, json: async () => ({ features: [{ properties: { street: 'Rua Augusta', city: 'São Paulo' } }] }) };
  } });
  const results = await Promise.all([lookup(-23.55, -46.65), lookup(-23.55, -46.65)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(calls, 1);
  await lookup(-23.55, -46.65);
  assert.equal(calls, 1);
  await assert.rejects(lookup(0, 0), /São Paulo/);
  assert.equal(calls, 1);
});
