import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/roquerodrigo/transporte-sp/main/data/dist/network.geojson';
const input = process.argv[2];
let network;
if (input) network = JSON.parse(await readFile(input, 'utf8'));
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Download: HTTP ${response.status}`);
  network = await response.json();
}
const lines = new Map();
const segments = [];
for (const feature of network.features || []) {
  const properties = feature.properties || {};
  const includeExpansion = ['2', '4', '6', '15', '17'].includes(properties.number);
  if (properties.kind !== 'line' || !(properties.status === 'operational' || (includeExpansion && ['partial', 'planned'].includes(properties.status))) || !['subway', 'monorail', 'light_rail'].includes(properties.mode)) continue;
  const planned = properties.status === 'planned';
  const suffix = planned ? ' (prevista / em obras)' : properties.status === 'partial' ? ' (operação parcial)' : '';
  const label = `Linha ${properties.number} – ${properties.name}${suffix}`;
  const color = properties.colour;
  const geometry = feature.geometry;
  const paths = geometry.type === 'MultiLineString' ? geometry.coordinates : geometry.type === 'LineString' ? [geometry.coordinates] : [];
  for (const path of paths) {
    if (path.length < 2 || !path.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))) continue;
    segments.push({ lineId: properties.number, label, color, planned, latlngs: path.map(point => [point[1], point[0]]) });
    lines.set(label, { lineId: properties.number, name: properties.name, label, color, planned });
  }
}
if (!segments.length) throw new Error('Nenhuma geometria de metrô válida; arquivo anterior preservado.');
const lineIds = new Set([...lines.values()].map(line => line.lineId));
const stations = (network.features || []).filter(feature => feature.properties?.kind === 'station' && feature.geometry?.type === 'Point')
  .map(feature => ({ id: feature.properties.id, name: feature.properties.name, planned: feature.properties.status === 'planned',
    lineIds: (feature.properties.lines || []).map(id => id.replace(/^linha-/, '')).filter(id => lineIds.has(id)),
    latlng: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]] }))
  .filter(station => station.lineIds.length && station.latlng.every(Number.isFinite));
await writeFile(new URL('./metro.json', import.meta.url), JSON.stringify({ source, updatedAt: new Date().toISOString(), lines: [...lines.values()], segments, stations }));
console.log(`${stations.length} estações salvas.`);
console.log(`${lines.size} linhas e ${segments.length} segmentos salvos em metro.json`);
