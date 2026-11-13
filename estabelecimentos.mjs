import { normalizeProperty } from './src/data.mjs';
import { RADIUS_METERS, poiQuery, parsePois, haversineMeters } from './src/geo.mjs';

export async function consultarEstabelecimentos(properties) {
  const coordinates = properties.map(property => normalizeProperty(property).coordinates);
  const bodies = coordinates.filter(Boolean).map(point => poiQuery(point).split(';(')[1]?.split(');out center;')[0]);
  if (!bodies.length) throw new Error('Coordenadas ausentes');
  const query = `[out:json][timeout:25];(${bodies.join('')});out center;`;
  let lastError;
  for (const host of ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const response = await fetch(host, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.elements) || data.remark) throw new Error(data.remark || 'Resposta inválida');
      const pois = parsePois(data.elements);
      return coordinates.map(center => center ? { radius: RADIUS_METERS, coordinates: center, checkedAt: new Date().toISOString(), items: pois.filter(poi => haversineMeters(center, poi) <= RADIUS_METERS), error: null } : { radius: RADIUS_METERS, items: [], checkedAt: null, error: 'Coordenadas ausentes' });
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
