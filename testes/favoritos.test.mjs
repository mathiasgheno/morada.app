import test from 'node:test';
import assert from 'node:assert/strict';
import { alterarFavoritos } from '../favorito.mjs';

test('Favoritos são únicos, podem ser removidos e não modificam a lista original', () => {
  const original = ['893631548'];
  assert.deepEqual(alterarFavoritos(original, '893631548'), original);
  assert.deepEqual(alterarFavoritos(original, '895427749'), ['893631548', '895427749']);
  assert.deepEqual(alterarFavoritos(original, '893631548', true), []);
  assert.deepEqual(original, ['893631548']);
  assert.throws(() => alterarFavoritos({}, '893631548'));
  assert.throws(() => alterarFavoritos(original, 'inválido'));
});
