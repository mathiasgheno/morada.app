import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePropertyWalkability, propertyWalkability, localPois } from '../src/walkability.mjs';
import { sortProperties } from '../src/data.mjs';

test('Ordenação por caminhabilidade preserva zero e deixa indisponíveis no fim nos dois sentidos', () => {
  const properties = [{ id: 'sem', raw: { walkability: { score: 100 } } }, { id: 'alto' }, { id: 'zero' }, { id: 'medio' }];
  const scores = new Map([['alto', { score: 100 }], ['zero', { score: 0 }], ['medio', { score: 35 }]]);
  assert.deepEqual(sortProperties(properties, 'score-asc', null, scores).map(p => p.id), ['zero', 'medio', 'alto', 'sem']);
  assert.deepEqual(sortProperties(properties, 'score-desc', null, scores).map(p => p.id), ['alto', 'medio', 'zero', 'sem']);
  assert.equal(properties[0].id, 'sem');
});

test('Índice usa apenas 300 m, aceita cache anterior de 350 m e não confunde dados ausentes com zero', () => {
  const coordinates = { lat: -23.55, lng: -46.65 };
  const property = { id: 894723967, ...coordinates, nearbyEstablishments: {
    radius: 350, checkedAt: '2026-11-21T12:00:00Z', coordinates,
    items: [{ ...coordinates, category: 'market' }, { ...coordinates, category: 'market' },
      { lat: coordinates.lat + 0.0029, lng: coordinates.lng, category: 'park' },
      { ...coordinates, category: 'bakery', is24Hours: true }], error: null,
  } };
  const score = calculatePropertyWalkability(property);
  assert.equal(score.score, 35);
  assert.equal(score.radius, 300);
  assert.equal(score.categories.park.nearest, null);
  assert.equal(localPois(property).length, 3);
  property.walkability = score;
  assert.equal(propertyWalkability(property), score);
  assert.equal(calculatePropertyWalkability({ ...property, nearbyEstablishments: null }), null);
  assert.equal(propertyWalkability({ ...property, lat: -23.56 }), null);
  assert.equal(calculatePropertyWalkability({ ...property, nearbyEstablishments: { ...property.nearbyEstablishments, items: [] } }).score, 0);
  assert.equal(calculatePropertyWalkability({ ...property, nearbyEstablishments: { ...property.nearbyEstablishments, error: 'Sem dados' } }), null);
});
