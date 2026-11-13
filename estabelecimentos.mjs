import { normalizeProperty } from './src/data.mjs';
import { RADIUS_METERS, poiQuery, parsePois, haversineMeters } from './src/geo.mjs';

export function retryDelay(value, attempt = 0, now = Date.now()) {
  const seconds = value && /^\d+$/.test(value.trim()) ? Number(value) : null;
  const date = value ? Date.parse(value) : NaN;
  return Math.max(1000, seconds !== null ? seconds * 1000 : Number.isFinite(date) ? date - now : Math.min(900000, 60000 * 2 ** attempt));
}

export function dadosLocaisValidos(property) {
  const data = property.nearbyEstablishments;
  const coordinates = normalizeProperty(property).coordinates;
  return Boolean(data?.checkedAt && !data.error && data.radius === RADIUS_METERS && Array.isArray(data.items) && coordinates && data.coordinates?.lat === coordinates.lat && data.coordinates?.lng === coordinates.lng);
}

export async function consultarEstabelecimentos(properties) {
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
