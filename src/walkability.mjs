import { normalizeProperty } from './data.mjs';
import { RADIUS_METERS, calculateWalkability, haversineMeters } from './geo.mjs';

export function localPois(raw) {
  const coordinates = normalizeProperty(raw).coordinates;
  const local = raw.nearbyEstablishments;
  // Caches antigos de 350 m cobrem o novo raio; apenas filtramos os excedentes.
  if (!coordinates || !local?.checkedAt || local.error || !Number.isFinite(local.radius) || local.radius < RADIUS_METERS || !Array.isArray(local.items) || local.coordinates?.lat !== coordinates.lat || local.coordinates?.lng !== coordinates.lng) return null;
  return local.items.filter(poi => Number.isFinite(poi.lat) && Number.isFinite(poi.lng) && haversineMeters(coordinates, poi) <= RADIUS_METERS);
}

export function calculatePropertyWalkability(raw) {
  const pois = localPois(raw);
  if (pois === null) return null;
  const coordinates = normalizeProperty(raw).coordinates;
  return { ...calculateWalkability(coordinates, pois), radius: RADIUS_METERS, coordinates,
    source: 'OpenStreetMap', sourceCheckedAt: raw.nearbyEstablishments.checkedAt };
}

export function propertyWalkability(raw) {
  const stored = raw.walkability;
  const coordinates = normalizeProperty(raw).coordinates;
  if (localPois(raw) !== null && stored?.radius === RADIUS_METERS && stored.sourceCheckedAt === raw.nearbyEstablishments.checkedAt &&
      stored.coordinates?.lat === coordinates.lat && stored.coordinates?.lng === coordinates.lng &&
      Number.isFinite(stored.score) && stored.categories && typeof stored.categories === 'object') return stored;
  return calculatePropertyWalkability(raw);
}
