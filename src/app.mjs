import { extractProperties, sortProperties, dateText, brl, availabilityColor } from './data.mjs';
import { CATEGORIES, RADIUS_METERS, calculateWalkability, distanceText } from './geo.mjs';
import { initNotes } from './notes-ui.mjs';

const $ = id => document.getElementById(id);
const state = {
  properties: [], selected: null, query: '', sort: 'price-asc', photos: new Map(),
  pois: new Map(), scores: new Map(), metros: new Map(), poisPromises: new Map(),
  version: 0, metro: null, metroNetwork: null, activePois: [], metroVisible: true,
  visibleCategories: new Set(Object.keys(CATEGORIES)),
  amenities: new Set(),
  hiddenMetroLines: new Set(),
  listings: {},
  favorites: new Set(),
};
let map, propertyLayer, poiLayer, metroLayer, radiusLayer, metroRenderer;
const referencePoint = [-23.556866, -46.661231];
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let baseMapLayer;
function updateBaseMapTheme() {
  if (!map || !window.protomapsL) return;
  if (baseMapLayer) map.removeLayer(baseMapLayer);
  baseMapLayer = protomapsL.leafletLayer({ url: './sao-paulo.pmtiles', flavor: systemTheme.matches ? 'black' : 'light', lang: 'pt', maxDataZoom: 15,
    attribution: '&copy; OpenStreetMap contributors · Protomaps' }).addTo(map);
}
systemTheme.addEventListener('change', updateBaseMapTheme);
const propertyNotes = initNotes({ onChange: () => renderCards(), getProperty: id => state.properties.find(property => property.id === id) });
const propertyMarkers = new Map();
let hoveredPropertyId = null;
function highlightProperty(id) {
  const previous = propertyMarkers.get(hoveredPropertyId);
  previous?.getElement()?.querySelector('.pin')?.classList.remove('pin-hovered');
  previous?.setZIndexOffset(hoveredPropertyId === state.selected?.id ? 1000 : 0);
  hoveredPropertyId = id;
  const marker = propertyMarkers.get(id);
  marker?.getElement()?.querySelector('.pin')?.classList.add('pin-hovered');
  marker?.setZIndexOffset(1500);
}

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
  map = L.map('map', { zoomControl: true, preferCanvas: true, zoomAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }).setView([-23.56, -46.65], 11);
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe($('map'));
  if (window.protomapsL) {
    updateBaseMapTheme();
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
  const workIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a25 25 0 0 0 18 0M12 12v3"/></svg>';
  L.marker(referencePoint, {
    icon: L.divIcon({ className: 'reference-marker', html: workIcon, iconSize: [36, 36], iconAnchor: [18, 18] }),
    zIndexOffset: 2000,
    title: 'Trabalho · Av. Paulista, 2300 — 19º andar, conj. 192',
  }).addTo(map)
    .bindTooltip('Trabalho · Paulista, 2300', { permanent: true, direction: 'top', offset: [0, -20], className: 'reference-tooltip' })
    .bindPopup('<div class="popup-title">Trabalho · Av. Paulista, 2300</div><div class="popup-sub">19º andar · Conj. 192<br>Bela Vista · São Paulo - SP<br>CEP informado: 01310-200<br>Localização aproximada do edifício.</div>');
  const referenceControl = L.control({ position: 'topleft' });
  referenceControl.onAdd = () => {
    const button = L.DomUtil.create('button', 'reference-button');
    button.type = 'button';
    button.innerHTML = `${workIcon}<span>Trabalho · Paulista, 2300</span>`;
    button.title = 'Centralizar no local de trabalho';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    button.addEventListener('click', () => map.setView(referencePoint, 16));
    return button;
  };
  referenceControl.addTo(map);
  setStatus('Selecione um imóvel para explorar a região');
}
function pointIcon(property, selected = false) {
  const favorite = state.favorites.has(property.id);
  return L.divIcon({ html: `<div class="pin${selected ? ' selected' : ''}${favorite ? ' pin-favorite' : ''}" style="--availability-color:${availabilityColor(property)}">${favorite ? '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="m12 2 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-.9Z"/></svg>' : ''}</div>`, className: '', iconSize: selected ? [28, 28] : [23, 23], iconAnchor: selected ? [14, 14] : [11, 11] });
}
function renderPropertyMarkers(fitAll = false) {
  if (!map) return;
  propertyLayer.clearLayers();
  propertyMarkers.clear();
  const coords = [];
  for (const property of filtered()) {
    if (!property.coordinates) continue;
    coords.push([property.coordinates.lat, property.coordinates.lng]);
    const selected = state.selected?.id === property.id;
    const marker = L.marker([property.coordinates.lat, property.coordinates.lng], { icon: pointIcon(property, selected), zIndexOffset: selected ? 1000 : 0 });
    if (state.favorites.has(property.id)) marker.options.title = `Favorito · ${property.title}`;
    marker.bindPopup(`<div class="popup-title">${escapeHtml(property.title)}</div><div class="popup-sub">${property.total !== null ? 'Total: ' : ''}${escapeHtml(brl(property.total ?? property.price))} ${property.kind === 'Aluguel' ? '/mês' : ''}</div>`);
    marker.on('click', () => selectProperty(property.id, { focusCard: true }));
    marker.addTo(propertyLayer);
    propertyMarkers.set(property.id, marker);
  }
  if (hoveredPropertyId) highlightProperty(hoveredPropertyId);
  if (fitAll && coords.length) {
    const median = values => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
    const center = L.latLng(median(coords.map(point => point[0])), median(coords.map(point => point[1])));
    const concentrated = [...coords].sort((first, second) => center.distanceTo(first) - center.distanceTo(second))
      .slice(0, Math.max(1, Math.ceil(coords.length * 0.8)));
    const bounds = L.latLngBounds([...concentrated, referencePoint]);
    map.invalidateSize({ pan: false });
    map.fitBounds(bounds, { paddingTopLeft: [55, 55], paddingBottomRight: [55, 65], maxZoom: 15, animate: false });
  }
}
function filtered() {
  const search = state.query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = sortProperties(state.properties.filter(p => {
    if ($('favoritesOnly').checked && !state.favorites.has(p.id)) return false;
    if ($('activeListingsOnly').checked && state.listings[p.id]?.status !== 'active') return false;
    if (![...state.amenities].every(key => p[key])) return false;
    const text = [p.id, p.title, p.street, p.neighborhood, p.city, p.state].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.includes(search);
  }), state.sort, { lat: referencePoint[0], lng: referencePoint[1] });
  return state.sort.startsWith('price-global-') ? results : results.sort((first, second) => Number(state.favorites.has(second.id)) - Number(state.favorites.has(first.id)));
}
function photoArrow(direction) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="${direction === 'left' ? 'M15 5 8 12 15 19' : 'M9 5 16 12 9 19'}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function cardHtml(p) {
  const selected = p.id === state.selected?.id;
  const name = escapeHtml(p.title);
  const score = state.scores.get(p.id);
  const photoIndex = state.photos.get(p.id) || 0;
  const photo = p.images.length ? `<img src="${escapeHtml(p.images[photoIndex])}" alt="Foto ${photoIndex + 1} de ${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />${p.images.length > 1 ? `<button type="button" class="photo-prev" data-action="photo-prev" aria-label="Foto anterior">${photoArrow('left')}</button><button type="button" class="photo-next" data-action="photo-next" aria-label="Próxima foto">${photoArrow('right')}</button><small class="photo-count">${photoIndex + 1}/${p.images.length}</small>` : ''}` : '';
  return `<article class="property-card ${selected ? 'selected' : ''}" data-id="${escapeHtml(p.id)}" tabindex="-1" aria-label="${name}">
    <div class="card-main" data-action="select" tabindex="0" role="button" aria-label="Exibir ${name} no mapa">
      <div class="card-photo" ${p.images.length ? 'data-action="gallery" role="button" tabindex="0" aria-label="Abrir todas as fotos"' : ''}><span>⌂</span>${photo}${p.demo ? '<span class="card-demo">EXEMPLO</span>' : ''}</div>
      <div class="card-details">
        <div class="card-kicker"><span class="card-type">${escapeHtml(p.propertyType.toUpperCase())}</span><span class="card-id">${state.favorites.has(p.id) ? '<span class="favorite-star" role="img" aria-label="Imóvel favorito" title="Favorito">★</span> ' : ''}${listingDot(p.id)} #${escapeHtml(p.id)}</span></div>
        <h3 class="card-title">${name}</h3><p class="card-address">${escapeHtml([p.street, p.city].filter(Boolean).join(' · ') || 'Endereço não informado')}</p>
        <div class="card-price ${p.total === null && p.price === null ? 'card-price-muted' : ''}">${escapeHtml(brl(p.total ?? p.price))}${p.kind === 'Aluguel' ? '<small> /mês</small>' : ''}</div>
        <p class="card-costs">${p.total !== null ? 'Total mensal informado' : 'Total não informado'}${p.price !== null ? ` · Aluguel: ${escapeHtml(brl(p.price))}` : ''}${p.condo !== null ? ` · Condomínio: ${escapeHtml(brl(p.condo))}` : ''}</p>
      </div>
    </div>
    <div class="card-note-action"><button type="button" data-action="notes" class="note-button ${propertyNotes.has(p.id) ? 'has-note' : ''}" aria-label="${propertyNotes.has(p.id) ? 'Editar anotação' : 'Adicionar anotação'}" title="${propertyNotes.has(p.id) ? 'Editar sua anotação' : 'Adicionar anotação pessoal'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V5a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h7"/></svg>${propertyNotes.has(p.id) ? 'Anotado' : 'Anotar'}</button></div>
    <div class="card-meta">
      ${p.area !== null ? `<span>▤ ${escapeHtml(p.area)} m²</span>` : ''}
      ${p.bedrooms !== null ? `<span>◻ ${escapeHtml(p.bedrooms)} quarto(s)</span>` : ''}
      ${p.bathrooms !== null ? `<span>◈ ${escapeHtml(p.bathrooms)} banho(s)</span>` : ''}
      ${p.parking !== null ? `<span>Ⓟ ${escapeHtml(p.parking)} vaga(s)</span>` : ''}
      ${score ? `<span class="card-score">↟ ${score.score}/100 estimado</span>` : ''}
    </div>
    <div class="card-availability"><span>◷ Disponibilidade</span><strong>${escapeHtml(dateText(p))}</strong></div>
    <div class="card-actions"><button type="button" class="action-score" data-action="score" ${!p.coordinates ? 'disabled title="Coordenadas não disponíveis"' : ''}>Calcular índice ↗</button>${propertyVideo(p) ? '<button type="button" class="card-video" data-action="video">▶ Vídeo</button>' : ''}${safeLink(p.url) ? `<a class="listing-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" title="Abrir anúncio no ${p.origem === 'viva-real' ? 'Viva Real' : 'QuintoAndar'}" aria-label="Abrir anúncio no ${p.origem === 'viva-real' ? 'Viva Real' : 'QuintoAndar'}">Anúncio ↗</a>` : ''}</div>
  </article>`;
}
const imageCache = new Map();
const imageQueue = [];
let activeImages = 0;
function pumpImages() {
  while (activeImages < 4 && imageQueue.length) {
    const job = imageQueue.shift();
    activeImages++;
    const photo = new Image();
    photo.referrerPolicy = 'no-referrer';
    const finish = async success => {
      if (success) await photo.decode().catch(() => {});
      job.resolve(success ? photo : null);
      activeImages--;
      pumpImages();
    };
    photo.onload = () => finish(true);
    photo.onerror = () => finish(false);
    photo.src = job.url;
  }
}
function preloadImage(url, priority = false) {
  if (!imageCache.has(url)) imageCache.set(url, new Promise(resolve => {
    const job = { url, resolve };
    if (priority) imageQueue.unshift(job); else imageQueue.push(job);
  }));
  if (priority) {
    const index = imageQueue.findIndex(job => job.url === url);
    if (index > 0) imageQueue.unshift(...imageQueue.splice(index, 1));
  }
  pumpImages();
  return imageCache.get(url);
}
function preloadGallery(property) {
  property?.images.forEach(url => preloadImage(url));
}
const photoObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    preloadGallery(state.properties.find(property => property.id === entry.target.dataset.id));
    photoObserver.unobserve(entry.target);
  }
}, { root: $('propertyList') });
const photoDialog = $('photoDialog');
$('galleryPrevious').innerHTML = photoArrow('left');
$('galleryNext').innerHTML = photoArrow('right');
let galleryProperty = null;
let galleryIndex = 0;
let galleryVersion = 0;
async function showGalleryPhoto(index) {
  const property = galleryProperty;
  const version = ++galleryVersion;
  galleryIndex = (index + property.images.length) % property.images.length;
  const photo = await preloadImage(property.images[galleryIndex], true);
  if (version !== galleryVersion || !photoDialog.open) return;
  $('galleryCounter').textContent = `${galleryIndex + 1} / ${property.images.length}${photo ? '' : ' · Foto indisponível'}`;
  if (photo) {
    photo.alt = `Foto ${galleryIndex + 1} de ${property.title}`;
    $('galleryImage').replaceChildren(photo);
  }
}
function openGallery(property) {
  galleryProperty = property;
  $('photoTitle').textContent = property.title;
  $('galleryPrevious').disabled = $('galleryNext').disabled = property.images.length < 2;
  photoDialog.showModal();
  showGalleryPhoto(state.photos.get(property.id) || 0);
  preloadGallery(property);
}
$('galleryPrevious').addEventListener('click', () => showGalleryPhoto(galleryIndex - 1));
$('galleryNext').addEventListener('click', () => showGalleryPhoto(galleryIndex + 1));
$('closePhotos').addEventListener('click', () => photoDialog.close());
photoDialog.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    showGalleryPhoto(galleryIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
photoDialog.addEventListener('click', event => {
  const bounds = photoDialog.getBoundingClientRect();
  if (event.target === photoDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) photoDialog.close();
});
photoDialog.addEventListener('close', () => {
  galleryVersion++;
  $('galleryImage').replaceChildren();
  $('galleryCounter').textContent = '';
  $('propertyList').querySelector(`[data-id="${CSS.escape(galleryProperty.id)}"] .card-photo`)?.focus({ preventScroll: true });
});
function propertyVideo(property) {
  return property.raw.video?.items?.find(item => item.provider === 'VIMEO' && item.status === 'transcode_complete' && /^\d+(\/[a-zA-Z0-9]+)?$/.test(item.sourceId));
}
const videoDialog = $('videoDialog');
let videoPropertyId;
function openVideo(property) {
  const video = propertyVideo(property);
  if (!video) return;
  const [id, hash] = video.sourceId.split('/');
  const url = new URL(`https://player.vimeo.com/video/${id}`);
  if (hash) url.searchParams.set('h', hash);
  url.searchParams.set('dnt', '1');
  const iframe = document.createElement('iframe');
  iframe.src = url.href;
  iframe.title = `Vídeo de ${property.title}`;
  iframe.allow = 'fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  $('videoTitle').textContent = `Vídeo · ${property.title}`;
  $('videoExternal').href = `https://vimeo.com/${video.sourceId}`;
  $('videoPlayer').replaceChildren(iframe);
  videoPropertyId = property.id;
  videoDialog.showModal();
  $('videoTitle').focus({ preventScroll: true });
}
$('closeVideo').addEventListener('click', () => videoDialog.close());
videoDialog.addEventListener('cancel', event => {
  event.preventDefault();
  videoDialog.close();
});
document.addEventListener('keydown', event => {
  if (videoDialog.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    videoDialog.close();
  }
}, true);
videoDialog.addEventListener('click', event => {
  const bounds = videoDialog.getBoundingClientRect();
  if (event.target === videoDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) videoDialog.close();
});
videoDialog.addEventListener('close', () => {
  $('videoPlayer').replaceChildren();
  $('propertyList').querySelector(`[data-id="${CSS.escape(videoPropertyId)}"] [data-action="video"]`)?.focus({ preventScroll: true });
});
function listingDot(id) {
  const result = state.listings[id];
  const label = result?.status === 'active' ? 'Anúncio acessível' : result?.status === 'inactive' ? 'Anúncio indisponível (404/410)' : 'Disponibilidade do anúncio não confirmada';
  const title = `${label}${result?.checkedAt ? ` · Verificado em ${new Date(result.checkedAt).toLocaleString('pt-BR')}` : ''}${result?.method === 'browser-page-access' ? ' · Viva Real: última consulta na importação, sem atualização automática' : ''}`;
  return `<span class="listing-status ${result?.status || 'unknown'}" role="img" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}"></span>`;
}
let checkingListings = false;
let listingsTimer;
async function refreshListings() {
  if (checkingListings || document.hidden) return;
  checkingListings = true;
  try {
    const response = await fetch('/api/anuncios', { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Status dos anúncios: HTTP ${response.status}`);
    const result = await response.json();
    state.listings = result.listings;
    applyAmenityFilters();
    clearTimeout(listingsTimer);
    listingsTimer = setTimeout(refreshListings, result.checking ? 2000 : 60000);
  } catch {
    document.querySelectorAll('.listing-status').forEach(dot => {
      dot.title = 'Não foi possível consultar o servidor de status. Nova tentativa em 1 minuto.';
      dot.setAttribute('aria-label', dot.title);
    });
    clearTimeout(listingsTimer);
    listingsTimer = setTimeout(refreshListings, 60000);
  } finally { checkingListings = false; }
}
function renderCards() {
  $('clearSelection').disabled = !state.selected;
  $('refreshButton').disabled = !state.selected?.coordinates;
  const results = filtered();
  $('listingCount').textContent = `${results.length} ${results.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`;
  $('propertyList').innerHTML = results.length ? results.map(cardHtml).join('') : '<div class="empty-state"><strong>Nenhum imóvel encontrado</strong>Tente outra busca ou importe um JSON com imóveis.</div>';
  photoObserver.disconnect();
  $('propertyList').querySelectorAll('.property-card').forEach(card => photoObserver.observe(card));
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
  const counters = Object.fromEntries(Object.keys(CATEGORIES).flatMap(key => [[key, 0], [`${key}-24h`, 0]]));
  for (const poi of state.activePois) {
    counters[poi.category]++;
    if (poi.is24Hours === true) counters[`${poi.category}-24h`]++;
    if (!map || !(state.visibleCategories.has(poi.category) || (poi.is24Hours === true && state.visibleCategories.has(`${poi.category}-24h`)))) continue;
    const cat = CATEGORIES[poi.category];
    const icon = L.divIcon({ html: `<div class="poi-pin ${poi.category}">${cat.glyph}</div>`, className: '', iconSize: [29, 29], iconAnchor: [14, 14] });
    const marker = L.marker([poi.lat, poi.lng], { icon });
    const metres = state.selected?.coordinates ? distanceText(Math.round(Math.hypot(poi.lat - state.selected.coordinates.lat, poi.lng - state.selected.coordinates.lng) * 100000)) : '';
    marker.bindPopup(`<div class="popup-title">${escapeHtml(poi.name)}</div><div class="popup-sub">${escapeHtml(cat.label)}${poi.is24Hours === true ? ' · 24 horas' : ''} · OpenStreetMap</div><div class="popup-sub">${poi.openingHours ? `Horário cadastrado: ${escapeHtml(poi.openingHours)}` : 'Horário não informado'}</div>`);
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
    L.polyline(segment.latlngs, { className: 'metro-route', renderer: metroRenderer, pane: 'metroPane', color: segment.color, opacity: segment.planned ? .65 : .86, dashArray: segment.planned ? '8 7' : null, weight: 4.4, lineCap: 'round', interactive: true })
      .bindTooltip(escapeHtml(segment.label), { sticky: true }).addTo(metroLayer);
  }
  for (const station of metro.stations || []) {
    const visibleLines = station.lineIds.filter(id => !state.hiddenMetroLines.has(id));
    if (!visibleLines.length) continue;
    visibleLines.forEach((id, index) => {
      const line = metro.lines.find(line => line.lineId === id);
      L.circleMarker(station.latlng, {
        className: 'metro-route metro-station', renderer: metroRenderer, pane: 'metroPane',
        radius: 5 + (visibleLines.length - index - 1) * 3, weight: 2.5,
        color: line.color, fillColor: '#fff', fillOpacity: station.planned ? .8 : 1,
        dashArray: station.planned ? '2 2' : null,
      }).bindTooltip(`${escapeHtml(station.name)}${station.planned ? ' · Prevista / em obras' : ''}<br>Linhas ${visibleLines.map(escapeHtml).join(', ')}`)
        .addTo(metroLayer);
    });
  }
}
function getMetroCacheKey(property) {
  return `${Math.round(property.coordinates.lat * 100) / 100}:${Math.round(property.coordinates.lng * 100) / 100}`;
}
async function getPois(property) {
  const local = property.raw.nearbyEstablishments;
  if (!local?.checkedAt || local.error || local.radius !== RADIUS_METERS) throw new Error('Execute bun run update:estabelecimentos para atualizar os dados locais.');
  state.pois.set(property.id, local.items);
  return local.items;
}
function loadNeighborhood(property, token) {
  if (!property.coordinates) {
    setStatus('Coordenadas ausentes no JSON deste imóvel');
    return;
  }
  try {
    const local = property.raw.nearbyEstablishments;
    if (!local?.checkedAt || local.error || local.radius !== RADIUS_METERS || !Array.isArray(local.items)) throw new Error('Atualize o JSON com bun run update:estabelecimentos e recarregue a página.');
    const pois = local.items;
    if (token !== state.version) return;
    state.pois.set(property.id, pois);
    state.activePois = pois;
    renderPois();
    setStatus(`${pois.length} estabelecimentos em até ${RADIUS_METERS} m · Dados locais do JSON`);
  } catch (error) {
    if (token !== state.version) return;
    setStatus('Estabelecimentos locais ainda não disponíveis para este imóvel.');
    $('scoreDescription').textContent = error.message;
    return;
  }
}
function officialScoreUrl(p) {
  if (!p || !p.coordinates) return 'https://www.walkscore.com/score/';
  const address = [p.street, p.neighborhood, p.city, p.state, 'Brasil'].filter(Boolean).join(', ');
  return address && !p.demo ? `https://www.walkscore.com/score/${encodeURIComponent(address)}` : 'https://www.walkscore.com/score/';
}
function clearPropertySelection() {
  state.selected = null;
  state.version++;
  state.activePois = [];
  highlightProperty(null);
  radiusLayer?.clearLayers();
  map?.closePopup();
  $('selectedTitle').textContent = 'Descubra o bairro';
  $('selectedSubtitle').textContent = 'Selecione um imóvel para explorar o que existe ao redor.';
  $('officialLink').href = officialScoreUrl(null);
  scoreStatus(null);
  renderCards();
  renderPropertyMarkers();
  renderPois();
  setStatus('Selecione um imóvel para explorar a região');
}
$('clearSelection').addEventListener('click', clearPropertySelection);
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
  if (options.focusCard) scrollToSelectedCard();
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
function scrollToSelectedCard(focus = true) {
  const property = state.selected;
  if (property) {
    const card = $('propertyList').querySelector(`[data-id="${CSS.escape(property.id)}"]`);
    if (card) {
      const collapsed = document.querySelector('.app-content').classList.contains('sidebar-collapsed');
      if (focus && !collapsed) card.focus({ preventScroll: true });
      const list = $('propertyList');
      const cardBounds = card.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      const horizontal = window.innerWidth <= 860;
      list.scrollTo({
        top: horizontal ? list.scrollTop : list.scrollTop + cardBounds.top - listBounds.top - 12,
        left: horizontal ? list.scrollLeft + cardBounds.left - listBounds.left - 18 : list.scrollLeft,
        behavior: collapsed || !focus || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }
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
  try {
    const response = await fetch('./favoritos.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const favorites = await response.json();
    if (!Array.isArray(favorites)) throw new Error('Formato inválido');
    state.favorites = new Set(favorites.map(String));
  } catch (error) { console.warn('Não foi possível carregar os favoritos:', error.message); }
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
$('propertyList').addEventListener('pointerover', event => {
  const card = event.target.closest('.property-card');
  if (card && !card.contains(event.relatedTarget)) highlightProperty(card.dataset.id);
});
$('propertyList').addEventListener('pointerout', event => {
  const card = event.target.closest('.property-card');
  if (card && !card.contains(event.relatedTarget)) highlightProperty(null);
});
$('propertyList').addEventListener('focusin', event => {
  const card = event.target.closest('.property-card');
  if (card) highlightProperty(card.dataset.id);
});
$('propertyList').addEventListener('focusout', event => {
  const card = event.target.closest('.property-card');
  if (card && !card.contains(event.relatedTarget)) highlightProperty(null);
});
$('propertyList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('.property-card');
  if (!button || !card) return;
  const id = card.dataset.id;
  if (button.dataset.action === 'notes') { propertyNotes.open(id); return; }
  if (button.dataset.action === 'gallery') {
    openGallery(state.properties.find(property => property.id === id));
    return;
  }
  if (button.dataset.action === 'video') {
    openVideo(state.properties.find(property => property.id === id));
    return;
  }
  if (button.dataset.action.startsWith('photo-')) {
    const property = state.properties.find(p => p.id === id);
    const next = ((state.photos.get(id) || 0) + (button.dataset.action === 'photo-next' ? 1 : -1) + property.images.length) % property.images.length;
    state.photos.set(id, next);
    preloadImage(property.images[next], true).then(photo => {
      if (!photo || state.photos.get(id) !== next || !card.isConnected) return;
      const image = card.querySelector('.card-photo img');
      if (image) { image.src = property.images[next]; image.alt = `Foto ${next + 1} de ${property.title}`; }
      card.querySelector('.photo-count').textContent = `${next + 1}/${property.images.length}`;
    });
    preloadGallery(property);
    return;
  }
  if (button.dataset.action === 'score') {
    const property = state.properties.find(p => p.id === id);
    calculateScore(property);
  } else selectProperty(id);
});
$('propertyList').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.card-photo[data-action="gallery"]')) {
    event.preventDefault();
    openGallery(state.properties.find(property => property.id === event.target.closest('.property-card').dataset.id));
    return;
  }
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
$('favoritesOnly').addEventListener('change', applyAmenityFilters);
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
document.querySelectorAll('.filter-chip:not([data-category="metro"])').forEach(chip => chip.remove());
const metroChip = document.querySelector('.filter-chip[data-category="metro"]');
metroChip.insertAdjacentHTML('beforebegin', Object.entries(CATEGORIES).filter(([, category]) => category.showFilter !== false).map(([key, category]) =>
  `<div class="poi-category" role="group" aria-label="${category.label}"><button type="button" class="poi-segment" data-poi-filter="${key}" aria-pressed="true" aria-label="Mostrar todos: ${category.label}"><span class="chip-icon ${key}">${category.glyph}</span>${category.label}<span class="category-counter" data-count="${key}">–</span></button><button type="button" class="poi-segment poi-hours" data-poi-filter="${key}-24h" aria-pressed="false" aria-label="Mostrar apenas ${category.label} 24 horas"><span class="category-counter" data-count="${key}-24h">–</span>24h</button></div>`
).join(''));
document.querySelector('.filters').addEventListener('click', event => {
  const button = event.target.closest('[data-poi-filter]');
  if (!button) return;
  const key = button.dataset.poiFilter;
  const active = state.visibleCategories.has(key);
  const base = key.replace(/-24h$/, '');
  state.visibleCategories.delete(base);
  state.visibleCategories.delete(`${base}-24h`);
  if (!active) state.visibleCategories.add(key);
  button.closest('.poi-category').querySelectorAll('[data-poi-filter]').forEach(segment => {
    segment.setAttribute('aria-pressed', String(state.visibleCategories.has(segment.dataset.poiFilter)));
  });
  renderPois();
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
const sidebarToggle = $('toggleSidebar');
sidebarToggle.addEventListener('click', () => {
  const collapsed = document.querySelector('.app-content').classList.toggle('sidebar-collapsed');
  $('propertySidebar').inert = collapsed;
  $('propertySidebar').setAttribute('aria-hidden', String(collapsed));
  resizeHandle.inert = collapsed;
  sidebarToggle.textContent = collapsed ? '›' : '‹';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Exibir lista de imóveis' : 'Recolher lista de imóveis');
  highlightProperty(null);
  requestAnimationFrame(() => {
    map?.invalidateSize({ pan: false });
    if (!collapsed) scrollToSelectedCard(false);
  });
});
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
let mapExpansionBusy = false;
let mapPlaceholder;
async function toggleMapExpansion() {
  if (mapExpansionBusy) return;
  mapExpansionBusy = true;
  expandMapButton.disabled = true;
  const expanded = mapContainer.classList.contains('map-expanded');
  const before = mapContainer.getBoundingClientRect();
  const center = map?.getCenter();
  const zoom = map?.getZoom();
  const radius = getComputedStyle(mapContainer).borderRadius;
  if (!expanded) {
    mapPlaceholder = document.createElement('div');
    mapPlaceholder.style.height = `${before.height}px`;
    mapPlaceholder.setAttribute('aria-hidden', 'true');
    mapContainer.before(mapPlaceholder);
    mapContainer.classList.add('map-expanded');
  }
  const target = expanded ? mapPlaceholder.getBoundingClientRect() : mapContainer.getBoundingClientRect();
  document.body.classList.add('map-is-expanded');
  mapContainer.classList.add('map-expanding');
  const frame = (rect, borderRadius) => ({ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius });
  try {
    const animation = mapContainer.animate([frame(before, radius), frame(target, expanded ? '15px' : '0px')], {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420,
      easing: 'cubic-bezier(.22,1,.36,1)',
    });
    await animation.finished;
  } finally {
    if (expanded) {
      mapContainer.classList.remove('map-expanded');
      mapPlaceholder.remove();
    }
    mapContainer.classList.remove('map-expanding');
    updateMapExpansion();
    map?.invalidateSize({ pan: false });
    if (center) map.setView(center, zoom, { animate: false });
    expandMapButton.disabled = false;
    mapExpansionBusy = false;
  }
}
expandMapButton.addEventListener('click', toggleMapExpansion);
document.addEventListener('fullscreenchange', updateMapExpansion);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mapContainer.classList.contains('map-expanded')) {
    toggleMapExpansion();
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
