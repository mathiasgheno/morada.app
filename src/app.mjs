import { extractProperties, sortProperties, dateText, brl, availabilityColor } from './data.mjs';
import { CATEGORIES, RADIUS_METERS, poiQuery, metroQuery, metroFallbackQuery, runOverpass, parsePois, parseMetro, calculateWalkability, distanceText } from './geo.mjs';

const $ = id => document.getElementById(id);
const state = {
  properties: [], selected: null, query: '', sort: 'price-asc', photos: new Map(),
  pois: new Map(), scores: new Map(), metros: new Map(), poisPromises: new Map(),
  version: 0, metro: null, metroNetwork: null, activePois: [], metroVisible: true,
  visibleCategories: new Set(Object.keys(CATEGORIES)),
  amenities: new Set(),
  hiddenMetroLines: new Set(),
  listings: {},
};
let map, propertyLayer, poiLayer, metroLayer, radiusLayer, metroRenderer;
const referencePoint = [-23.556866, -46.661231];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const safeLink = value => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
function showNotice(message, isError = false) {
  const el = $('dataNotice');
  el.hidden = !message;
  el.classList.toggle('error', isError);
  el.textContent = message;
}
function setStatus(text, loading = false) {
  $('mapStatus').innerHTML = `${loading ? '<span class="loading-spinner"></span>' : ''}${escapeHtml(text)}`;
}

function initMap() {
  if (!window.L) {
    $('map').innerHTML = '<div style="padding:26px;color:#9b4646">Não foi possível carregar o Leaflet. Verifique sua conexão à internet.</div>';
    setStatus('Mapa indisponível: Leaflet não carregado');
    return;
  }
  map = L.map('map', { zoomControl: true, preferCanvas: true, zoomAnimation: false }).setView([-23.56, -46.65], 11);
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));
  if (window.protomapsL) {
    protomapsL.leafletLayer({ url: './sao-paulo.pmtiles', flavor: 'light', lang: 'pt', maxDataZoom: 15,
      attribution: '&copy; OpenStreetMap contributors · Protomaps' }).addTo(map);
  } else {
    setStatus('Não foi possível carregar o renderizador do mapa local. Recarregue a página.');
  }
  map.createPane('metroPane');
  map.getPane('metroPane').style.zIndex = '410';
  metroRenderer = L.svg({ pane: 'metroPane', padding: 0.5 }).addTo(map);
  metroLayer = L.layerGroup().addTo(map);
  radiusLayer = L.layerGroup().addTo(map);
  poiLayer = L.layerGroup().addTo(map);
  propertyLayer = L.layerGroup().addTo(map);
  L.marker(referencePoint, {
    icon: L.divIcon({ className: 'reference-marker', html: '<span aria-hidden="true">★</span>', iconSize: [36, 36], iconAnchor: [18, 18] }),
    zIndexOffset: 2000,
    title: 'Av. Paulista, 2300 — 19º andar, conj. 192',
  }).addTo(map)
    .bindTooltip('Paulista, 2300', { permanent: true, direction: 'top', offset: [0, -20], className: 'reference-tooltip' })
    .bindPopup('<div class="popup-title">Av. Paulista, 2300</div><div class="popup-sub">19º andar · Conj. 192<br>Bela Vista · São Paulo - SP<br>CEP informado: 01310-200<br>Localização aproximada do edifício.</div>');
  const referenceControl = L.control({ position: 'topleft' });
  referenceControl.onAdd = () => {
    const button = L.DomUtil.create('button', 'reference-button');
    button.type = 'button';
    button.textContent = '★ Paulista, 2300';
    button.title = 'Centralizar no endereço destacado';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    button.addEventListener('click', () => map.setView(referencePoint, 16));
    return button;
  };
  referenceControl.addTo(map);
  setStatus('Selecione um imóvel para explorar a região');
}
function pointIcon(property, selected = false) {
  return L.divIcon({ html: `<div class="pin${selected ? ' selected' : ''}" style="--availability-color:${availabilityColor(property)}"></div>`, className: '', iconSize: selected ? [28, 28] : [23, 23], iconAnchor: selected ? [14, 14] : [11, 11] });
}
function renderPropertyMarkers(fitAll = false) {
  if (!map) return;
  propertyLayer.clearLayers();
  const coords = [referencePoint];
  for (const property of filtered()) {
    if (!property.coordinates) continue;
    coords.push([property.coordinates.lat, property.coordinates.lng]);
    const selected = state.selected?.id === property.id;
    const marker = L.marker([property.coordinates.lat, property.coordinates.lng], { icon: pointIcon(property, selected), zIndexOffset: selected ? 1000 : 0 });
    marker.bindPopup(`<div class="popup-title">${escapeHtml(property.title)}</div><div class="popup-sub">${property.total !== null ? 'Total: ' : ''}${escapeHtml(brl(property.total ?? property.price))} ${property.kind === 'Aluguel' ? '/mês' : ''}</div>`);
    marker.on('click', () => selectProperty(property.id, { focusCard: true }));
    marker.addTo(propertyLayer);
  }
  if (fitAll && coords.length) {
    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: coords.length === 1 ? 14 : 12, animate: false });
  }
}
function filtered() {
  const search = state.query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return sortProperties(state.properties.filter(p => {
    if ($('activeListingsOnly').checked && state.listings[p.id]?.status !== 'active') return false;
    if (![...state.amenities].every(key => p[key])) return false;
    const text = [p.id, p.title, p.street, p.neighborhood, p.city, p.state].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.includes(search);
  }), state.sort);
}
function cardHtml(p) {
  const selected = p.id === state.selected?.id;
  const name = escapeHtml(p.title);
  const score = state.scores.get(p.id);
  const photoIndex = state.photos.get(p.id) || 0;
  const photo = p.images.length ? `<img src="${escapeHtml(p.images[photoIndex])}" alt="Foto ${photoIndex + 1} de ${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />${p.images.length > 1 ? `<button type="button" class="photo-prev" data-action="photo-prev" aria-label="Foto anterior">‹</button><button type="button" class="photo-next" data-action="photo-next" aria-label="Próxima foto">›</button><small class="photo-count">${photoIndex + 1}/${p.images.length}</small>` : ''}` : '';
  return `<article class="property-card ${selected ? 'selected' : ''}" data-id="${escapeHtml(p.id)}" tabindex="-1" aria-label="${name}">
    <div class="card-main" data-action="select" tabindex="0" role="button" aria-label="Exibir ${name} no mapa">
      <div class="card-photo"><span>⌂</span>${photo}${p.demo ? '<span class="card-demo">EXEMPLO</span>' : ''}</div>
      <div class="card-details">
        <div class="card-kicker"><span class="card-type">${escapeHtml(p.propertyType.toUpperCase())}</span><span class="card-id">${listingDot(p.id)} #${escapeHtml(p.id)}</span></div>
        <h3 class="card-title">${name}</h3><p class="card-address">${escapeHtml([p.street, p.city].filter(Boolean).join(' · ') || 'Endereço não informado')}</p>
        <div class="card-price ${p.total === null && p.price === null ? 'card-price-muted' : ''}">${escapeHtml(brl(p.total ?? p.price))}${p.kind === 'Aluguel' ? '<small> /mês</small>' : ''}</div>
        <p class="card-costs">${p.total !== null ? 'Total mensal informado' : 'Total não informado'}${p.price !== null ? ` · Aluguel: ${escapeHtml(brl(p.price))}` : ''}${p.condo !== null ? ` · Condomínio: ${escapeHtml(brl(p.condo))}` : ''}</p>
      </div>
    </div>
    <div class="card-meta">
      ${p.area !== null ? `<span>▤ ${escapeHtml(p.area)} m²</span>` : ''}
      ${p.bedrooms !== null ? `<span>◻ ${escapeHtml(p.bedrooms)} quarto(s)</span>` : ''}
      ${p.bathrooms !== null ? `<span>◈ ${escapeHtml(p.bathrooms)} banho(s)</span>` : ''}
      ${p.parking !== null ? `<span>Ⓟ ${escapeHtml(p.parking)} vaga(s)</span>` : ''}
      ${score ? `<span class="card-score">↟ ${score.score}/100 estimado</span>` : ''}
    </div>
    <div class="card-availability"><span>◷ Disponibilidade</span><strong>${escapeHtml(dateText(p))}</strong></div>
    <div class="card-actions"><button type="button" data-action="select">Ver no mapa</button><button type="button" class="action-score" data-action="score" ${!p.coordinates ? 'disabled title="Coordenadas não disponíveis"' : ''}>Calcular índice ↗</button>${safeLink(p.url) ? `<a class="listing-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" title="Abrir anúncio no QuintoAndar" aria-label="Abrir anúncio no QuintoAndar">Anúncio ↗</a>` : ''}</div>
  </article>`;
}
function listingDot(id) {
  const result = state.listings[id];
  const label = result?.status === 'active' ? 'Anúncio acessível' : result?.status === 'inactive' ? 'Anúncio indisponível (404/410)' : 'Disponibilidade do anúncio não confirmada';
  const title = `${label}${result?.checkedAt ? ` · Verificado às ${new Date(result.checkedAt).toLocaleTimeString('pt-BR')}` : ''}`;
  return `<span class="listing-status ${result?.status || 'unknown'}" role="img" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}"></span>`;
}
let checkingListings = false;
let listingsTimer;
async function refreshListings() {
  if (checkingListings || document.hidden) return;
  checkingListings = true;
  try {
    const response = await fetch('/api/anuncios', { signal: AbortSignal.timeout(120000) });
    if (!response.ok) return;
    const result = await response.json();
    state.listings = result.listings;
    applyAmenityFilters();
    clearTimeout(listingsTimer);
    listingsTimer = setTimeout(refreshListings, result.checking ? 2000 : 60000);
  } catch {
    clearTimeout(listingsTimer);
    listingsTimer = setTimeout(refreshListings, 60000);
  } finally { checkingListings = false; }
}
function renderCards() {
  const results = filtered();
  $('listingCount').textContent = `${results.length} ${results.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`;
  $('propertyList').innerHTML = results.length ? results.map(cardHtml).join('') : '<div class="empty-state"><strong>Nenhum imóvel encontrado</strong>Tente outra busca ou importe um JSON com imóveis.</div>';
}
function scoreStatus(property) {
  const score = state.scores.get(property?.id);
  $('calculateButton').disabled = !property?.coordinates;
  if (!property) {
    $('scoreResult').innerHTML = '—<small>/ 100</small>';
    $('scoreDescription').textContent = 'Selecione um imóvel e clique em calcular para estimar sua caminhabilidade.';
  } else if (!property.coordinates) {
    $('scoreResult').innerHTML = '—<small>/ 100</small>';
    $('scoreDescription').textContent = 'Imóvel sem coordenadas: não é possível calcular o índice.';
  } else if (score) {
    $('scoreResult').innerHTML = `${score.score}<small>/ 100</small>`;
    const nearest = Object.entries(score.categories).map(([key, data]) => `${CATEGORIES[key].label.toLowerCase()}: ${distanceText(data.nearest)}`).join(' · ');
    $('scoreDescription').textContent = `Estimativa pelo OSM · ${nearest}`;
    $('calculateButton').textContent = 'Recalcular';
  } else {
    $('scoreResult').innerHTML = '—<small>/ 100</small>';
    $('scoreDescription').textContent = 'Proximidade de mercados, parques, farmácias e academias. Não é o Walk Score oficial.';
    $('calculateButton').textContent = 'Calcular índice';
  }
}
function renderPois() {
  if (poiLayer) poiLayer.clearLayers();
  const counters = { gym: 0, pharmacy: 0, market: 0, park: 0 };
  for (const poi of state.activePois) {
    counters[poi.category]++;
    if (!map || !state.visibleCategories.has(poi.category)) continue;
    const cat = CATEGORIES[poi.category];
    const icon = L.divIcon({ html: `<div class="poi-pin ${poi.category}">${cat.glyph}</div>`, className: '', iconSize: [29, 29], iconAnchor: [14, 14] });
    const marker = L.marker([poi.lat, poi.lng], { icon });
    const metres = state.selected?.coordinates ? distanceText(Math.round(Math.hypot(poi.lat - state.selected.coordinates.lat, poi.lng - state.selected.coordinates.lng) * 100000)) : '';
    marker.bindPopup(`<div class="popup-title">${escapeHtml(poi.name)}</div><div class="popup-sub">${escapeHtml(cat.label)} · OpenStreetMap</div>`);
    marker.addTo(poiLayer);
  }
  for (const [key, value] of Object.entries(counters)) {
    const node = document.querySelector(`[data-count="${key}"]`);
    if (node) node.textContent = state.selected && state.pois.has(state.selected.id) ? String(value) : '–';
  }
}
function renderMetro() {
  if (metroLayer) metroLayer.clearLayers();
  const metro = state.metro;
  const legend = $('metroLegend');
  legend.hidden = !state.metroVisible || !metro?.lines?.length;
  if (!metro) return;
  const lines = new Map();
  const expansions = new Set(metro.lines.filter(line => line.planned).map(line => line.lineId || line.label));
  for (const line of metro.lines) {
    const key = line.lineId || line.label;
    if (!lines.has(key)) lines.set(key, line);
  }
  $('metroLegendItems').innerHTML = [...lines].map(([key, line]) => {
    const hasExpansion = expansions.has(key);
    const hasOperation = metro.lines.some(candidate => (candidate.lineId || candidate.label) === key && !candidate.planned);
    const swatches = `${hasOperation ? `<span class="line-swatch" style="background:${escapeHtml(line.color)}" title="Trecho em operação"></span>` : ''}${hasExpansion ? `<span class="line-swatch line-swatch-dashed" style="--line-color:${escapeHtml(line.color)}" title="Expansão prevista / em obras"></span>` : ''}`;
    return `<label class="legend-line"><input type="checkbox" data-metro-line="${escapeHtml(key)}" ${state.hiddenMetroLines.has(key) ? '' : 'checked'}><span class="line-swatches">${swatches}</span><span>${escapeHtml(line.lineId ? `Linha ${line.lineId} – ${line.name}` : line.label)}</span></label>`;
  }).join('') + '<p class="metro-line-note">Contínuo: operação · Tracejado: expansão prevista / em obras</p>';
  if (!map || !state.metroVisible) return;
  for (const segment of metro.segments) {
    if (state.hiddenMetroLines.has(segment.lineId || segment.label)) continue;
    L.polyline(segment.latlngs, { renderer: metroRenderer, pane: 'metroPane', color: segment.color, opacity: segment.planned ? .65 : .86, dashArray: segment.planned ? '8 7' : null, weight: 4.4, lineCap: 'round', interactive: true })
      .bindTooltip(escapeHtml(segment.label), { sticky: true }).addTo(metroLayer);
  }
}
function getMetroCacheKey(property) {
  return `${Math.round(property.coordinates.lat * 100) / 100}:${Math.round(property.coordinates.lng * 100) / 100}`;
}
async function getPois(property) {
  if (state.pois.has(property.id)) return state.pois.get(property.id);
  if (state.poisPromises.has(property.id)) return state.poisPromises.get(property.id);
  const promise = (async () => {
    const elements = await runOverpass(poiQuery(property.coordinates), () => state.selected?.id === property.id);
    if (elements === null) return null;
    const pois = parsePois(elements);
    state.pois.set(property.id, pois);
    return pois;
  })();
  state.poisPromises.set(property.id, promise);
  try { return await promise; } finally { state.poisPromises.delete(property.id); }
}
async function getMetro(property) {
  return state.metroNetwork;
}
async function loadNeighborhood(property, token) {
  if (!property.coordinates) {
    setStatus('Coordenadas ausentes no JSON deste imóvel');
    return;
  }
  try {
    setStatus('Buscando estabelecimentos próximos…', true);
    const pois = await getPois(property);
    if (token !== state.version || pois === null) return;
    state.activePois = pois;
    renderPois();
    setStatus(`${pois.length} pontos de interesse próximos · Consultando linhas de metrô…`, true);
  } catch (error) {
    if (token !== state.version) return;
    setStatus('Não foi possível consultar os estabelecimentos. Use “Atualizar região”.');
    $('scoreDescription').textContent = `Serviço Overpass temporariamente indisponível: ${error.message}`;
  }
  if (token !== state.version) return;
  try {
    const metro = await getMetro(property);
    if (token !== state.version || metro === null) return;
    state.metro = metro;
    renderMetro();
    setStatus(`${state.activePois.length} estabelecimentos · ${metro.lines.length} linhas/rotas de metrô mapeadas`);
  } catch (error) {
    if (token !== state.version) return;
    setStatus(`${state.activePois.length} estabelecimentos · Metrô indisponível nesta consulta`);
  }
}
function officialScoreUrl(p) {
  if (!p || !p.coordinates) return 'https://www.walkscore.com/score/';
  const address = [p.street, p.neighborhood, p.city, p.state, 'Brasil'].filter(Boolean).join(', ');
  return address && !p.demo ? `https://www.walkscore.com/score/${encodeURIComponent(address)}` : 'https://www.walkscore.com/score/';
}
function selectProperty(id, options = {}) {
  const property = state.properties.find(p => p.id === id);
  if (!property) return;
  state.selected = property;
  const token = ++state.version;
  state.activePois = state.pois.get(id) || [];
  state.metro = state.metroNetwork || (property.coordinates ? state.metros.get(getMetroCacheKey(property)) || null : null);
  $('selectedTitle').textContent = property.neighborhood || property.title;
  $('selectedSubtitle').textContent = [property.street, property.city, property.state].filter(Boolean).join(' · ') || `Imóvel #${property.id}`;
  $('officialLink').href = officialScoreUrl(property);
  scoreStatus(property);
  renderCards();
  if (options.focusCard) {
    const card = $('propertyList').querySelector(`[data-id="${CSS.escape(property.id)}"]`);
    if (card) {
      card.focus({ preventScroll: true });
      const list = $('propertyList');
      const cardBounds = card.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      const horizontal = window.innerWidth <= 860;
      list.scrollTo({
        top: horizontal ? list.scrollTop : list.scrollTop + cardBounds.top - listBounds.top - 12,
        left: horizontal ? list.scrollLeft + cardBounds.left - listBounds.left - 18 : list.scrollLeft,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }
  renderPropertyMarkers();
  renderPois();
  renderMetro();
  if (map) {
    radiusLayer.clearLayers();
    if (property.coordinates) {
      map.panTo([property.coordinates.lat, property.coordinates.lng], {
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 0.6,
      });
      L.circle([property.coordinates.lat, property.coordinates.lng], { radius: RADIUS_METERS, color: '#208755', weight: 1.3, dashArray: '5 5', fillColor: '#6ebf83', fillOpacity: .035, interactive: false }).addTo(radiusLayer);
    }
  }
  loadNeighborhood(property, token);
}
async function calculateScore(property) {
  if (!property?.coordinates) return;
  if (state.selected?.id !== property.id) selectProperty(property.id);
  $('calculateButton').disabled = true;
  $('calculateButton').textContent = 'Calculando…';
  try {
    const pois = await getPois(property);
    if (pois === null) return;
    const score = calculateWalkability(property.coordinates, pois);
    state.scores.set(property.id, score);
    if (state.selected?.id === property.id) scoreStatus(property);
    renderCards();
  } catch (error) {
    if (state.selected?.id === property.id) {
      $('scoreDescription').textContent = `Falha ao calcular: ${error.message}. Tente novamente.`;
    }
  } finally {
    if (state.selected?.id === property.id) {
      $('calculateButton').disabled = false;
      $('calculateButton').textContent = state.scores.has(property.id) ? 'Recalcular' : 'Calcular índice';
    }
  }
}
function loadData(json, sourceLabel = 'arquivo') {
  const properties = extractProperties(json);
  state.properties = properties;
  refreshListings();
  state.pois.clear(); state.scores.clear(); state.metros.clear(); state.poisPromises.clear();
  state.selected = null;
  state.version++;
  const demo = properties.length > 0 && properties.every(p => p.demo);
  if (demo) showNotice('Exibindo imóveis fictícios de demonstração. Para usar seus imóveis, importe imoveis.json ou coloque o arquivo na pasta do projeto.');
  else showNotice(sourceLabel === 'arquivo importado' ? `${properties.length} imóveis carregados do JSON importado.` : '');
  renderCards();
  if (map) {
    propertyLayer.clearLayers();poiLayer.clearLayers();metroLayer.clearLayers();radiusLayer.clearLayers();
  }
  state.activePois = []; state.metro = state.metroNetwork;
  renderMetro();
  if (properties.length) {
    renderPropertyMarkers(true);
    scoreStatus(null);
    setStatus('Selecione um imóvel para consultar os estabelecimentos próximos');
  } else {
    $('selectedTitle').textContent = 'Nenhum imóvel carregado';
    $('selectedSubtitle').textContent = 'Importe um JSON para começar.';
    setStatus('Nenhum imóvel carregado');
    scoreStatus(null);
  }
}
async function start() {
  initMap();
  loadMetroNetwork();
  try {
    const response = await fetch('./imoveis.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadData(await response.json(), 'imoveis.json');
  } catch (_) {
    try {
      const response = await fetch('./imoveis.exemplo.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loadData(await response.json(), 'demonstração');
    } catch (_) {
      showNotice('Não foi possível abrir os arquivos locais automaticamente. Execute um servidor HTTP (veja README.md) ou importe seu JSON pelo botão acima.', true);
      loadData([], 'vazio');
    }
  }
}
async function loadMetroNetwork() {
  try {
    const response = await fetch('./metro.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.metroNetwork = await response.json();
    state.metro = state.metroNetwork;
    renderMetro();
  } catch (error) {
    setStatus('Não foi possível carregar as linhas de metrô locais. Recarregue a página.');
  }
}
$('propertyList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('.property-card');
  if (!button || !card) return;
  const id = card.dataset.id;
  if (button.dataset.action.startsWith('photo-')) {
    const property = state.properties.find(p => p.id === id);
    const next = ((state.photos.get(id) || 0) + (button.dataset.action === 'photo-next' ? 1 : -1) + property.images.length) % property.images.length;
    state.photos.set(id, next);
    card.outerHTML = cardHtml(property);
    document.querySelector(`[data-id="${CSS.escape(id)}"] [data-action="${button.dataset.action}"]`)?.focus();
    return;
  }
  if (button.dataset.action === 'score') {
    const property = state.properties.find(p => p.id === id);
    calculateScore(property);
  } else selectProperty(id);
});
$('propertyList').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.card-main')) {
    event.preventDefault(); selectProperty(event.target.closest('.property-card').dataset.id);
  }
});
function applyAmenityFilters() {
  state.amenities = new Set([...document.querySelectorAll('[data-amenity]:checked')].map(input => input.dataset.amenity));
  const results = filtered();
  if (state.selected && !results.some(property => property.id === state.selected.id)) {
    state.selected = null;
    state.version++;
    state.activePois = [];
    radiusLayer?.clearLayers();
    renderPois();
    scoreStatus(null);
    $('selectedTitle').textContent = 'Descubra o bairro';
    $('selectedSubtitle').textContent = 'Selecione um imóvel nos resultados filtrados.';
    setStatus(results.length ? 'Selecione um imóvel para explorar a região' : 'Nenhum imóvel corresponde aos filtros');
  }
  renderCards();
  renderPropertyMarkers();
}
document.querySelectorAll('[data-amenity]').forEach(input => input.addEventListener('change', applyAmenityFilters));
window.addEventListener('pageshow', applyAmenityFilters);
$('activeListingsOnly').addEventListener('change', applyAmenityFilters);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshListings(); });
$('sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderCards(); });
$('calculateButton').addEventListener('click', () => calculateScore(state.selected));
$('jsonInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { loadData(JSON.parse(await file.text()), 'arquivo importado'); }
  catch (error) { showNotice(`JSON inválido ou inesperado: ${error.message}`, true); }
  event.target.value = '';
});
$('refreshButton').addEventListener('click', () => {
  const p = state.selected;
  if (!p?.coordinates) return;
  state.pois.delete(p.id);
  state.scores.delete(p.id);
  state.metros.delete(getMetroCacheKey(p));
  selectProperty(p.id);
});
$('metroLegendItems').addEventListener('change', event => {
  const input = event.target.closest('[data-metro-line]');
  if (!input) return;
  const key = input.dataset.metroLine;
  if (input.checked) state.hiddenMetroLines.delete(key);
  else state.hiddenMetroLines.add(key);
  renderMetro();
  $('metroLegendItems').querySelector(`[data-metro-line="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
});
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('change', event => {
    const category = chip.dataset.category;
    if (category === 'metro') state.metroVisible = event.target.checked;
    else if (event.target.checked) state.visibleCategories.add(category);
    else state.visibleCategories.delete(category);
    chip.classList.toggle('active', event.target.checked);
    renderPois(); renderMetro();
  });
});
const resizeHandle = $('sidebarResize');
const expandMapButton = $('expandMap');
const mapContainer = document.querySelector('.map-container');
function updateMapExpansion() {
  const expanded = document.fullscreenElement === mapContainer || mapContainer.classList.contains('map-expanded');
  document.body.classList.toggle('map-is-expanded', expanded);
  expandMapButton.textContent = expanded ? '⛶ Recolher mapa' : '⛶ Expandir mapa';
  expandMapButton.setAttribute('aria-label', expanded ? 'Recolher mapa' : 'Expandir mapa');
  expandMapButton.setAttribute('aria-pressed', String(expanded));
  requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
}
expandMapButton.addEventListener('click', async () => {
  if (document.fullscreenElement === mapContainer) await document.exitFullscreen();
  else if (mapContainer.classList.contains('map-expanded')) mapContainer.classList.remove('map-expanded');
  else {
    try {
      if (!mapContainer.requestFullscreen) throw new Error('Fullscreen indisponível');
      await mapContainer.requestFullscreen();
    } catch {
      mapContainer.classList.add('map-expanded');
    }
  }
  updateMapExpansion();
});
document.addEventListener('fullscreenchange', updateMapExpansion);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mapContainer.classList.contains('map-expanded')) {
    mapContainer.classList.remove('map-expanded');
    updateMapExpansion();
    expandMapButton.focus();
  }
});
function resizeSidebar(width) {
  const maximum = Math.min(800, window.innerWidth - 370);
  const next = Math.max(300, Math.min(maximum, width));
  document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
  resizeHandle.setAttribute('aria-valuenow', String(Math.round(next)));
  resizeHandle.setAttribute('aria-valuemax', String(maximum));
}
resizeHandle.addEventListener('pointerdown', event => {
  resizeHandle.setPointerCapture(event.pointerId);
  document.body.classList.add('sidebar-resizing');
});
resizeHandle.addEventListener('pointermove', event => {
  if (resizeHandle.hasPointerCapture(event.pointerId)) resizeSidebar(event.clientX);
});
resizeHandle.addEventListener('lostpointercapture', () => document.body.classList.remove('sidebar-resizing'));
resizeHandle.addEventListener('pointerup', event => resizeHandle.releasePointerCapture(event.pointerId));
resizeHandle.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  resizeSidebar(Number(resizeHandle.getAttribute('aria-valuenow')) + (event.key === 'ArrowRight' ? 20 : -20));
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 860) resizeSidebar(Number(resizeHandle.getAttribute('aria-valuenow')));
});
refreshListings();
start();
