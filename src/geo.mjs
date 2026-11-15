// Consultas pontuais e limitadas ao OpenStreetMap via Overpass. Sem servidor e sem chave.
const OVERPASS_SERVERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
export const CATEGORIES = {
  hospital: { label: 'Hospitais', weight: 0, glyph: '✚', showFilter: false },
  bakery: { label: 'Padarias', weight: 0, glyph: '♨' },
  gym: { label: 'Academias', weight: 0.20, glyph: '◕' },
  pharmacy: { label: 'Farmácias', weight: 0.20, glyph: '✚' },
  market: { label: 'Mercados', weight: 0.35, glyph: '▣' },
  park: { label: 'Parques', weight: 0.25, glyph: '♣' },
};
export const RADIUS_METERS = 350;

export function haversineMeters(a, b) {
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function poiQuery({ lat, lng }) {
  const loc = `(around:${RADIUS_METERS},${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:35];(
    nwr${loc}["leisure"="fitness_centre"];
    nwr${loc}["sport"="fitness"];
    nwr${loc}["amenity"="pharmacy"];
    nwr${loc}["amenity"="hospital"];
    nwr${loc}["healthcare"="hospital"];
    nwr${loc}["shop"="bakery"];
    nwr${loc}["shop"="chemist"];
    nwr${loc}["shop"~"^(supermarket|convenience|grocery)$"];
    nwr${loc}["leisure"="park"];
  );out center;`;
}

export function metroQuery({ lat, lng }) {
  // Região de ~12 km em torno do imóvel. As relações podem estender-se além do recorte.
  const south = (lat - .055).toFixed(5), north = (lat + .055).toFixed(5);
  const west = (lng - .065).toFixed(5), east = (lng + .065).toFixed(5);
  return `[out:json][timeout:40];relation["type"="route"]["route"~"^(subway|light_rail)$"](${south},${west},${north},${east});out geom;`;
}
export function metroFallbackQuery({ lat, lng }) {
  const south = (lat - .050).toFixed(5), north = (lat + .050).toFixed(5);
  const west = (lng - .060).toFixed(5), east = (lng + .060).toFixed(5);
  return `[out:json][timeout:35];way["railway"~"^(subway|light_rail)$"](${south},${west},${north},${east});out geom;`;
}

// Serializa chamadas para não sobrecarregar servidores comunitários do Overpass.
let chain = Promise.resolve();
export function runOverpass(query, canRun = () => true) {
  const operation = chain.catch(() => {}).then(async () => {
    if (!canRun()) return null;
    let lastError;
    for (const server of OVERPASS_SERVERS) {
      if (!canRun()) return null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 44000);
      try {
        const url = `${server}?data=${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Overpass respondeu HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error('Resposta inesperada do Overpass');
        return data.elements;
      } catch (error) {
        lastError = error;
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error('Serviço de mapas indisponível');
  });
  chain = operation.catch(() => {});
  return operation;
}

export function categorize(tags = {}) {
  if (tags.amenity === 'hospital' || tags.healthcare === 'hospital') return 'hospital';
  if (tags.shop === 'bakery') return 'bakery';
  if (tags.leisure === 'fitness_centre' || tags.sport === 'fitness') return 'gym';
  if (tags.amenity === 'pharmacy' || tags.shop === 'chemist') return 'pharmacy';
  if (['supermarket', 'convenience', 'grocery'].includes(tags.shop)) return 'market';
  if (tags.leisure === 'park') return 'park';
  return null;
}
export function parsePois(elements = []) {
  const ids = new Set();
  const pois = [];
  for (const item of elements) {
    const category = categorize(item.tags || {});
    const point = item.center || item;
    if (!category || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const key = `${item.type}/${item.id}`;
    if (ids.has(key)) continue;
    ids.add(key);
    pois.push({ id: key, category, name: item.tags?.name || CATEGORIES[category].label.slice(0, -1),
      lat: point.lat, lng: point.lon, tags: item.tags || {} });
  }
  return pois;
}

export function calculateWalkability(coordinates, pois) {
  if (!coordinates) return null;
  const categories = {};
  let score = 0;
  for (const [key, { weight }] of Object.entries(CATEGORIES)) {
    if (weight === 0) continue;
    const distances = pois.filter(p => p.category === key).map(p => haversineMeters(coordinates, p));
    const nearest = distances.length ? Math.min(...distances) : null;
    // Até 300m = 100 pontos para a categoria; a 1500m = 0.
    const grade = nearest === null ? 0 : Math.max(0, Math.min(100, 100 * (1500 - Math.max(300, nearest)) / 1200));
    score += grade * weight;
    categories[key] = { count: distances.length, nearest, grade: Math.round(grade) };
  }
  return { score: Math.round(score), categories };
}

const METRO_PALETTE = ['#e73447', '#1b70ba', '#17985f', '#d6a42b', '#8e5bb4', '#e97526', '#44a3a2'];
function metroColor(value, key = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (/^#[\da-f]{3}([\da-f]{3})?$/.test(raw)) return raw;
  if (/^[\da-f]{6}$/.test(raw)) return `#${raw}`;
  const english = { red: '#e53945', blue: '#2379ba', green: '#25a26e', yellow: '#d4aa20', orange: '#e27728', violet: '#9a60ae', purple: '#9160b6', silver: '#7e9096', gold: '#d7ad35', grey: '#8d9fa4', gray: '#8d9fa4' };
  if (english[raw]) return english[raw];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return METRO_PALETTE[hash % METRO_PALETTE.length];
}
export function parseMetro(elements = []) {
  const lines = new Map();
  const seenSegments = new Set();
  const segments = [];
  for (const item of elements) {
    const isRoute = item.type === 'relation';
    const tags = item.tags || {};
    const label = tags.ref || tags.name || (isRoute ? `Linha ${item.id}` : 'Trilhos de metrô');
    const color = isRoute ? metroColor(tags.colour || tags.color, label) : '#728e9b';
    const key = isRoute ? label : 'Trilhos mapeados';
    if (!lines.has(key)) lines.set(key, { label: key, color });
    const ways = isRoute ? (item.members || []).filter(member => member.type === 'way') : [item];
    for (const way of ways) {
      if (!Array.isArray(way.geometry) || way.geometry.length < 2) continue;
      const latlngs = way.geometry.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => [p.lat, p.lon]);
      if (latlngs.length < 2) continue;
      const fingerprint = `${key}:${way.ref || way.id}:${latlngs.length}:${latlngs[0][0]}`;
      if (seenSegments.has(fingerprint)) continue;
      seenSegments.add(fingerprint);
      segments.push({ latlngs, color, label: tags.name || key });
    }
  }
  return { lines: [...lines.values()], segments };
}
export const distanceText = meters => meters === null ? 'não encontrado' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
