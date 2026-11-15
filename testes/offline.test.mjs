import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarNaBase } from '../estabelecimentos.mjs';

const database = {
  bounds: [-47.2, -24.2, -46, -23.1], source: 'Teste', generatedAt: '2026-11-15',
  items: [{ id: 'perto', lat: -23.5501, lng: -46.63 }, { id: 'longe', lat: -23.56, lng: -46.63 }],
};

test('Consulta offline limita os resultados a 350 m e preserva origem', () => {
  const [result] = consultarNaBase([{ id: 1, lat: -23.55, lng: -46.63 }], database);
  assert.deepEqual(result.items.map(item => item.id), ['perto']);
  assert.equal(result.radius, 350);
  assert.equal(result.dataGeneratedAt, database.generatedAt);
});

test('Não confunde imóvel fora da cobertura com ausência de estabelecimentos', () => {
  assert.throws(() => consultarNaBase([{ id: 1, lat: -22, lng: -43 }], database), /fora da cobertura/);
  assert.throws(() => consultarNaBase([{ id: 2, lat: -23.55, lng: -46.0001 }], database), /fora da cobertura/);
  assert.throws(() => consultarNaBase([{ id: 3 }], database), /coordenadas ausentes/);
});
