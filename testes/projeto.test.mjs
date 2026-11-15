import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProperties, sortProperties, normalizeProperty, parseDate, toNumber, dateText } from '../src/data.mjs';
import { haversineMeters, parsePois, categorize, parseMetro, calculateWalkability, poiQuery, metroQuery } from '../src/geo.mjs';

test('Reconhece hospitais sem classificar clínicas como hospitais ou alterar o índice', () => {
  assert.equal(categorize({ amenity: 'hospital' }), 'hospital');
  assert.equal(categorize({ healthcare: 'hospital' }), 'hospital');
  assert.equal(categorize({ healthcare: 'clinic' }), null);
  const coordinates = { lat: -23.55, lng: -46.63 };
  assert.equal(calculateWalkability(coordinates, [{ ...coordinates, category: 'hospital' }]).score, calculateWalkability(coordinates, []).score);
});

test('Ordena distância à referência nos dois sentidos e mantém sem coordenadas no fim', () => {
  const reference = { lat: -23.556866, lng: -46.661231 };
  const properties = [{ id: 'longe', coordinates: { lat: -23.6, lng: -46.7 } }, { id: 'perto', coordinates: reference }, { id: 'sem', coordinates: null }];
  assert.deepEqual(sortProperties(properties, 'distance-asc', reference).map(property => property.id), ['perto', 'longe', 'sem']);
  assert.deepEqual(sortProperties(properties, 'distance-desc', reference).map(property => property.id), ['longe', 'perto', 'sem']);
});

test('Preserva total mensal e ordena pelo custo total em vez do aluguel', () => {
  const first = normalizeProperty({ id: '1', rentValue: 2000, condominiumValue: 800, totalCost: 3000 });
  const second = normalizeProperty({ id: '2', rentValue: 2300, totalCost: 2600 });
  assert.equal(first.condo, 800);
  assert.equal(first.total, 3000);
  assert.equal(first.price, 2000);
  assert.deepEqual(sortProperties([first, second]).map(property => property.id), ['2', '1']);
});

test('Lê formatos JSON array, encapsulado e objeto indexado por ID', () => {
  const raw = { id: '123', rentPrice: 1900, latitude: -23.5, longitude: -46.6 };
  assert.equal(extractProperties([raw]).length, 1);
  assert.equal(extractProperties({ imoveis: [raw] })[0].price, 1900);
  assert.equal(extractProperties({ data: { properties: [raw] } })[0].id, '123');
  assert.equal(extractProperties({ '123': { rentPrice: 1900 } })[0].id, '123');
});

test('Normaliza campos de imóvel aninhados no QuintoAndar, moeda e data', () => {
  const p = normalizeProperty({ id: 893123456, data: {
    address: { street: 'Rua Exemplo', neighborhood: 'Pinheiros', city: 'São Paulo' },
    location: { latitude: -23.56, longitude: -46.7 }, pricing: { rentPrice: 'R$ 3.450,00' },
    availableDate: '15/12/2026', bedrooms: 2,
  } });
  assert.equal(p.price, 3450);
  assert.equal(p.kind, 'Aluguel');
  assert.equal(p.neighborhood, 'Pinheiros');
  assert.deepEqual(p.coordinates, { lat: -23.56, lng: -46.7 });
  assert.equal(p.availableAt, parseDate('2026-12-15'));
  assert.equal(p.bedrooms, 2);
});

test('Suporta coordenadas GeoJSON e tipos numéricos', () => {
  const p = normalizeProperty({ id: 'x', coordinates: [-46.6, -23.5], salePrice: 950000 });
  assert.deepEqual(p.coordinates, { lat: -23.5, lng: -46.6 });
  assert.equal(p.kind, 'Venda');
  assert.equal(toNumber('2.350,50'), 2350.5);
  assert.equal(toNumber('1,200.50'), 1200.5);
  assert.equal(toNumber('2.350'), 2350);
  assert.equal(toNumber(''), null);
  assert.equal(parseDate('31/02/2026'), null);
});

test('Ordena corretamente com valores nulos sempre no final', () => {
  const properties = [
    { id: 'A', price: 3000, availableAt: parseDate('2026-12-01') },
    { id: 'B', price: 1000, availableAt: parseDate('2026-11-10') },
    { id: 'C', price: null, availableAt: null },
    { id: 'D', price: 2000, availableAt: parseDate('2027-01-01') },
  ];
  const ids = mode => sortProperties(properties, mode).map(p => p.id).join('');
  assert.equal(ids('price-asc'), 'BDAC');
  assert.equal(ids('price-desc'), 'ADBC');
  assert.equal(ids('date-asc'), 'BADC');
  assert.equal(ids('date-desc'), 'DABC');
});

test('Calcula caminhabilidade ponderada sem inventar locais', () => {
  const center = { lat: -23.56, lng: -46.65 };
  const allNear = [
    { lat: center.lat, lng: center.lng, category: 'gym' },
    { lat: center.lat, lng: center.lng, category: 'pharmacy' },
    { lat: center.lat, lng: center.lng, category: 'market' },
    { lat: center.lat, lng: center.lng, category: 'park' },
  ];
  assert.equal(haversineMeters(center, center), 0);
  assert.equal(calculateWalkability(center, allNear).score, 100);
  assert.equal(calculateWalkability(center, []).score, 0);
  assert.equal(calculateWalkability(center, allNear.filter(p => p.category !== 'park')).score, 75);
});

test('Classifica estabelecimentos e extrai pontos de polígono', () => {
  assert.equal(categorize({ leisure: 'park' }), 'park');
  assert.equal(categorize({ amenity: 'pharmacy' }), 'pharmacy');
  assert.equal(categorize({ shop: 'supermarket' }), 'market');
  assert.equal(categorize({ leisure: 'fitness_centre' }), 'gym');
  const result = parsePois([{ type: 'way', id: 100, center: { lat: -23.5, lon: -46.6 }, tags: { leisure: 'park', name: 'Parque' } }]);
  assert.equal(result[0].name, 'Parque');
  assert.equal(result[0].category, 'park');
});

test('Extrai polilinhas e cor de rota metroviária', () => {
  const result = parseMetro([{ type: 'relation', id: 45, tags: { ref: 'Linha Azul', colour: '#0000ff' }, members: [{ type: 'way', ref: 8, geometry: [{ lat: -23, lon: -46 }, { lat: -24, lon: -46 }] }] }]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.lines[0].color, '#0000ff');
  assert.deepEqual(result.segments[0].latlngs, [[-23, -46], [-24, -46]]);
});

test('Consultas Overpass abrangem categorias e rotas de metrô', () => {
  assert.match(poiQuery({ lat: -23.5, lng: -46.6 }), /fitness_centre/);
  assert.match(poiQuery({ lat: -23.5, lng: -46.6 }), /pharmacy/);
  assert.match(metroQuery({ lat: -23.5, lng: -46.6 }), /subway/);
});
