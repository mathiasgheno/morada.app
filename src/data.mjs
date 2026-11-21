import { haversineMeters } from './geo.mjs';
// Normalizador tolerante a diferentes estruturas de JSON (inclusive objetos do QuintoAndar).
const hasValue = value => value !== undefined && value !== null && value !== '';

function atPath(object, path) {
  return path.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object);
}

function walkObjects(root, maxDepth = 5) {
  const queue = [{ value: root, depth: 0 }];
  const visited = new WeakSet();
  const objects = [];
  while (queue.length && objects.length < 120) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) continue;
    objects.push(value);
    if (depth >= maxDepth) continue;
    for (const [key, nested] of Object.entries(value)) {
      if (/photo|image|gallery|picture|nearby|amenities|tags|media|video|facilities|installations|seo|description/i.test(key)) continue;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) queue.push({ value: nested, depth: depth + 1 });
    }
  }
  return objects;
}

function pick(object, paths, accept = hasValue) {
  for (const path of paths) {
    const val = atPath(object, path);
    if (accept(val)) return val;
  }
  // Fallback para estruturas com campos aninhados desconhecidos.
  const simpleNames = paths.filter(p => !p.includes('.')).map(p => p.toLowerCase());
  for (const current of walkObjects(object)) {
    for (const [key, val] of Object.entries(current)) {
      if (simpleNames.includes(key.toLowerCase()) && accept(val)) return val;
    }
  }
  return undefined;
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let clean = value.trim().replace(/[^\d.,-]/g, '');
  if (!clean) return null;
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.lastIndexOf(',') > clean.lastIndexOf('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
  } else if (clean.includes(',')) {
    clean = /,\d{1,2}$/.test(clean) ? clean.replace(',', '.') : clean.replace(/,/g, '');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    clean = clean.replace(/\./g, '');
  }
  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

function isNumeric(value) { return toNumber(value) !== null; }
function plain(value) { return typeof value === 'string' || typeof value === 'number'; }
function text(value) { return hasValue(value) && plain(value) ? String(value).trim() : ''; }
function firstValidNumber(object, paths) {
  const value = pick(object, paths, isNumeric);
  return toNumber(value);
}
function todayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
export function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value < 1e11 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const str = value.trim();
  let year, month, day;
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) [, year, month, day] = match;
  else {
    match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) [, day, month, year] = match;
  }
  if (year) {
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.getFullYear() === Number(year) && d.getMonth() === Number(month) - 1 && d.getDate() === Number(day) ? d.getTime() : null;
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function imageUrls(entry) {
  const candidates = [entry.coverImage, entry.mainImage, entry.imageUrl, entry.thumbnail, entry.cover?.url, entry.cover?.src,
    entry.images?.[0], entry.photos?.[0], entry.pictures?.[0], entry.media?.photos?.[0], entry.property?.photos?.[0],
    entry.data?.photos?.[0], entry.data?.images?.[0], entry.property?.coverImage];
  candidates.push(...[entry.images, entry.photos, entry.pictures, entry.media?.photos, entry.property?.photos, entry.data?.photos, entry.data?.images].filter(Array.isArray).flat());
  const urls = [];
  for (let item of candidates) {
    if (item && typeof item === 'object') item = item.url || item.src || item.imageUrl || item.photoUrl || item.urlMedium || item.mediumUrl;
    if (typeof item === 'string' && item.startsWith('//')) item = `https:${item}`;
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) urls.push(item);
  }
  return [...new Set(urls)];
}
function getCoordinates(raw) {
  const lat = firstValidNumber(raw, ['latitude', 'lat', 'geo.lat', 'location.latitude', 'location.lat', 'address.latitude', 'address.lat', 'address.location.lat', 'address.location.latitude', 'coordinates.latitude', 'map.latitude']);
  const lng = firstValidNumber(raw, ['longitude', 'lng', 'lon', 'long', 'geo.lng', 'geo.lon', 'location.longitude', 'location.lng', 'location.lon', 'address.longitude', 'address.lng', 'address.location.lng', 'address.location.longitude', 'coordinates.longitude', 'map.longitude']);
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  const vectors = [atPath(raw, 'location.coordinates'), atPath(raw, 'geo.coordinates'), atPath(raw, 'coordinates'), atPath(raw, 'geometry.coordinates'), atPath(raw, 'address.coordinates')];
  for (const pair of vectors) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const a = toNumber(pair[0]), b = toNumber(pair[1]);
      if (a !== null && b !== null && Math.abs(a) <= 180 && Math.abs(b) <= 90) return { lat: b, lng: a }; // GeoJSON [lon, lat]
    }
  }
  return null;
}
function addressParts(raw) {
  const addr = pick(raw, ['address', 'property.address'], v => v && typeof v === 'object' && !Array.isArray(v));
  const street = text(pick(raw, ['street', 'streetName', 'logradouro', 'address.street', 'address.streetName', 'address.address', 'address.fullAddress', 'fullAddress', 'location.street'], plain));
  const neighborhood = text(pick(raw, ['neighborhood', 'neighbourhood', 'district', 'bairro', 'address.neighborhood', 'address.neighbourhood', 'address.district', 'location.neighborhood'], plain));
  const city = text(pick(raw, ['city', 'cityName', 'cidade', 'address.city', 'location.city'], plain));
  const state = text(pick(raw, ['state', 'stateCode', 'uf', 'address.state', 'location.state'], plain));
  const rawAddress = text(pick(raw, ['address'], plain));
  const number = text(addr?.number || addr?.streetNumber || pick(raw, ['streetNumber', 'addressNumber'], plain));
  return { street: street || rawAddress, neighborhood, city, state, number };
}

export function normalizeProperty(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(pick(raw, ['id', 'propertyId', 'listingId', 'displayId', 'idImovel', 'propertyCode', 'code', 'uuid'], plain)) || String(index + 1);
  const addr = addressParts(raw);
  const coordinates = getCoordinates(raw);
  const propertyType = text(pick(raw, ['propertyType', 'type', 'typeName', 'tipo', 'property.type', 'typeOfProperty'], plain)) || 'Imóvel';
  const rent = firstValidNumber(raw, ['rentPrice', 'rentalPrice', 'monthlyRent', 'rentValue', 'priceRent', 'rent', 'aluguel', 'prices.rent', 'prices.rentPrice', 'pricing.rent', 'pricing.rentPrice', 'pricingInfo.rent', 'pricingInfo.rentPrice', 'pricingInfo.price', 'costs.rent']);
  const sale = firstValidNumber(raw, ['salePrice', 'sellingPrice', 'saleValue', 'salesPrice', 'purchasePrice', 'prices.sale', 'prices.salePrice', 'pricing.salePrice']);
  const generic = firstValidNumber(raw, ['price', 'value', 'valor', 'pricing.price', 'pricingInfo.price', 'prices.price']);
  const price = rent ?? sale ?? generic;
  const kind = rent !== null ? 'Aluguel' : sale !== null ? 'Venda' : 'Preço';
  const condo = firstValidNumber(raw, ['condominiumValue', 'condoFee', 'condominiumFee', 'condoPrice', 'condominiumPrice', 'condo', 'condominio', 'prices.condoFee', 'prices.condominium', 'pricingInfo.condoFee']);
  const total = firstValidNumber(raw, ['totalCost', 'totalPrice', 'rentTotalPrice', 'monthlyCost', 'prices.totalCost', 'pricingInfo.totalPrice', 'pricingInfo.rentTotalPrice']);
  const area = firstValidNumber(raw, ['area', 'areaM2', 'size', 'totalArea', 'usableArea', 'squareMeters', 'm2', 'areaUtil']);
  const bedrooms = firstValidNumber(raw, ['bedrooms', 'beds', 'rooms', 'bedroomCount', 'quartos']);
  const bathrooms = firstValidNumber(raw, ['bathrooms', 'baths', 'bathroomCount', 'banheiros']);
  const parking = firstValidNumber(raw, ['parkingSlots', 'parkingSpots', 'parkingSpaces', 'parking', 'garageSpaces', 'vagas']);
  let availableAt = parseDate(pick(raw, ['availableFrom', 'availableAt', 'availabilityDate', 'availableDate', 'dateAvailable', 'moveInDate', 'movingDate', 'possibleMovingDate', 'vacantDate', 'dateAvailability', 'availability.date', 'availability.availableFrom', 'availability.moveInDate', 'availability.expectedDate'], plain));
  let dateEstimated = false;
  const movingDate = raw.listings?.find(listing => listing.businessContext === 'RENT')?.relistingDetailsDTO?.possibleMovingDate;
  if (availableAt === null && movingDate) availableAt = parseDate(movingDate);
  let immediately = false;
  const availabilityType = text(pick(raw, ['availabilityType', 'availabilityStatus', 'statusAvailability', 'availability.type'], plain)).toLowerCase();
  if (availableAt === null && /(immediate|imediat|ready|vacant|available|dispon[ií]vel)/.test(availabilityType)) {
    availableAt = todayLocal();
    immediately = true;
  }
  if (availableAt === null) {
    const days = firstValidNumber(raw, ['daysToVacate', 'daysUntilAvailable', 'availability.daysToVacate']);
    if (days !== null && days >= 0) {
      availableAt = todayLocal() + Math.ceil(days) * 86400000;
      dateEstimated = true;
    }
  }
  const title = text(pick(raw, ['title', 'name', 'headline', 'property.title', 'shortTitle'], plain)) || `${propertyType} ${addr.neighborhood ? `em ${addr.neighborhood}` : `#${id}`}`;
  const origem = raw.origem || 'quinto-andar';
  const url = text(pick(raw, ['url', 'listingUrl', 'link', 'propertyUrl', 'canonicalUrl'], v => typeof v === 'string' && /^https?:\/\//.test(v))) || (origem === 'viva-real' ? raw.shortUrl : id.match(/^\d{7,}$/) ? `https://www.quintoandar.com.br/imovel/${id}` : null);
  return { id, origem, title, propertyType, ...addr, coordinates, price, kind, condo, total, area, bedrooms, bathrooms, parking,
    acceptsPets: raw.acceptPets === true, furnished: raw.isFurnished === true,
    doorman24: raw.doormanType === 'horas24',
    partyRoom: [raw.installations, raw.amenities, raw.comfortCommodities, raw.practicalityCommodities].filter(Array.isArray).flat().some(item => item.key === 'SALAO_DE_FESTAS' && item.value === 'SIM'),
    availableAt, dateEstimated, immediately, images: imageUrls(raw), image: imageUrls(raw)[0] || null, url, demo: Boolean(raw.demo || /^DEMO-/.test(id)), raw };
}

export function extractProperties(json) {
  let entries;
  if (Array.isArray(json)) entries = json;
  else if (json && typeof json === 'object') {
    entries = ['imoveis', 'properties', 'listings', 'items', 'results', 'data', 'content'].map(key => json[key]).find(Array.isArray);
    if (!entries) {
      const nested = ['data', 'result', 'payload'].map(key => json[key]).find(v => v && typeof v === 'object' && !Array.isArray(v));
      if (nested) entries = ['imoveis', 'properties', 'listings', 'items', 'results'].map(key => nested[key]).find(Array.isArray);
    }
    if (!entries) {
      const pairs = Object.entries(json);
      if (pairs.length && pairs.every(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object')) {
        entries = pairs.map(([id, value]) => ({ id, ...value }));
      }
    }
    if (!entries) entries = [json];
  } else entries = [];
  return entries.map(normalizeProperty).filter(Boolean);
}

export function sortProperties(properties, sort = 'price-asc', reference = null, scores = null) {
  const descending = sort.endsWith('desc');
  const byDate = sort.startsWith('date');
  const value = property => {
    if (sort.startsWith('score')) {
      const score = scores ? scores.get(property.id)?.score : property.raw?.walkability?.score ?? property.walkability?.score;
      return Number.isFinite(score) ? score : null;
    }
    if (sort.startsWith('distance')) return property.coordinates && reference ? haversineMeters(reference, property.coordinates) : null;
    return byDate ? property.availableAt : property.total ?? property.price;
  };
  return [...properties].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av === null || av === undefined) return bv === null || bv === undefined ? a.id.localeCompare(b.id) : 1;
    if (bv === null || bv === undefined) return -1;
    if (av !== bv) return (av - bv) * (descending ? -1 : 1);
    return a.id.localeCompare(b.id);
  });
}
export function dateText(property) {
  if (property.availableAt === null) return 'Não informada';
  if (property.immediately || property.availableAt <= todayLocal()) return 'Disponível agora';
  const formatted = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(property.availableAt + 43200000));
  return `${property.dateEstimated ? 'Previsão: ' : ''}${formatted}`;
}
export const brl = value => value === null || value === undefined ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
export function availabilityColor(property, now = new Date()) {
  if (property.availableAt === null) return '#92999f';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(property.availableAt);
  const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - today) / 86400000);
  return days <= 0 ? '#219565' : days <= 1 ? '#287be0' : days <= 7 ? '#e5b526' : '#92999f';
}
