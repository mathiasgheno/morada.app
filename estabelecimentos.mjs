import { normalizeProperty } from './src/data.mjs';
import { readFile } from 'node:fs/promises';
import { RADIUS_METERS, poiQuery, parsePois, haversineMeters } from './src/geo.mjs';

export function retryDelay(value, attempt = 0, now = Date.now()) {
  const seconds = value && /^\d+$/.test(value.trim()) ? Number(value) : null;
  const date = value ? Date.parse(value) : NaN;
  return Math.max(1000, seconds !== null ? seconds * 1000 : Number.isFinite(date) ? date - now : Math.min(900000, 60000 * 2 ** attempt));
}

export function dadosLocaisValidos(property) {
  const data = property.nearbyEstablishments;
  const coordinates = normalizeProperty(property).coordinates;
  return Boolean(data?.checkedAt && !data.error && Number.isFinite(data.radius) && data.radius >= RADIUS_METERS && Array.isArray(data.items) && coordinates && data.coordinates?.lat === coordinates.lat && data.coordinates?.lng === coordinates.lng);
}

let localDatabase;
export async function consultarEstabelecimentos(properties) {
  if (!localDatabase) {
    const data = JSON.parse(await readFile(new URL('./estabelecimentos-locais.json', import.meta.url), 'utf8'));
    if (!Array.isArray(data.items) || !Array.isArray(data.bounds)) throw new Error('Base local inválida');
    localDatabase = data;
  }
  return consultarNaBase(properties, localDatabase);
}

export function consultarNaBase(properties, database) {
  return properties.map(property => {
    const center = normalizeProperty(property).coordinates;
    if (!center) throw new Error(`Imóvel ${property.id}: coordenadas ausentes`);
    const [west, south, east, north] = database.bounds;
    const marginLat = RADIUS_METERS / 110000;
    const marginLng = marginLat / Math.cos(center.lat * Math.PI / 180);
    if (center.lng - marginLng < west || center.lng + marginLng > east || center.lat - marginLat < south || center.lat + marginLat > north) throw new Error(`Imóvel ${property.id}: fora da cobertura da base local`);
    const items = database.items.filter(poi => Math.abs(poi.lat - center.lat) <= marginLat && Math.abs(poi.lng - center.lng) <= marginLng && haversineMeters(center, poi) <= RADIUS_METERS);
    return { radius: RADIUS_METERS, coordinates: center, checkedAt: new Date().toISOString(), source: database.source, dataGeneratedAt: database.generatedAt, items, error: null };
  });
}

export async function consultarEstabelecimentosOverpass(properties) {
  const coordinates = properties.map(property => normalizeProperty(property).coordinates);
  const bodies = coordinates.filter(Boolean).map(point => poiQuery(point).split(';(')[1]?.split(');out center;')[0]);
  if (!bodies.length) throw new Error('Coordenadas ausentes');
  const query = `[out:json][timeout:25];(${bodies.join('')});out center;`;
  let lastError;
  for (const host of ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const response = await fetch(host, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(30000) });
      if (response.status === 429) {
        const error = new Error('HTTP 429: limite de consultas');
        error.status = 429;
        error.retryAfter = response.headers.get('retry-after');
        await response.body?.cancel();
        throw error;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.elements) || data.remark) throw new Error(data.remark || 'Resposta inválida');
      const pois = parsePois(data.elements);
      return coordinates.map(center => center ? { radius: RADIUS_METERS, coordinates: center, checkedAt: new Date().toISOString(), items: pois.filter(poi => haversineMeters(center, poi) <= RADIUS_METERS), error: null } : { radius: RADIUS_METERS, items: [], checkedAt: null, error: 'Coordenadas ausentes' });
    } catch (error) {
      if (error.status === 429) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
