const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let projects = [];
let editing = null;
let duplicateFrom = null;
let previewMap, previewMarker;
async function request(path, body, method = 'POST') {
  const response = await fetch(path, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) } : { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function load() {
  try {
    projects = await request('/api/projetos');
    $('projectTotal').textContent = projects.length;
    $('launcherStatus').textContent = '';
    $('projectGrid').innerHTML = projects.map((project, index) => `<article class="project-card" data-id="${escapeHtml(project.id)}"><button class="project-card-main" data-action="open" aria-label="Abrir ${escapeHtml(project.name)}"><span class="project-card-topline"><span class="project-symbol" aria-hidden="true">⌂</span><span class="project-index">PROJETO ${String(index + 1).padStart(2, '0')}</span></span><h3>${escapeHtml(project.name)}</h3><p class="project-reference"><span aria-hidden="true">⌖</span>${escapeHtml(project.reference.name)}</p><span class="project-stats"><span><b>${project.propertyCount}</b> imóveis</span><span><b>${project.favoriteCount}</b> favoritos</span><span><b>${project.noteCount}</b> anotações</span></span></button><div class="project-card-footer"><button class="text-button" data-action="edit">Configurar</button><button class="text-button" data-action="duplicate">Duplicar</button><button class="text-button open-project" data-action="open">Abrir projeto ↗</button></div></article>`).join('') + '<button class="new-project-card" id="newProjectCard"><span class="plus" aria-hidden="true">＋</span>Criar uma nova busca<small>Outro ponto de partida. Novas possibilidades.</small></button>';
    $('newProjectCard').addEventListener('click', () => openForm());
  } catch (error) { $('launcherStatus').textContent = `Não foi possível conectar ao serviço local do Morada. O desktop precisa dele para funcionar. Tente abrir novamente. Detalhe: ${error.message}`; }
}
function point() { return [Number($('referenceLat').value), Number($('referenceLng').value)]; }
function syncMarker() {
  if (!previewMap) return;
  previewMarker.setLatLng(point());
  previewMap.panTo(point(), { animate: false });
}
function openForm(project, duplicate = false) {
  editing = project && !duplicate ? project.id : null;
  duplicateFrom = duplicate ? project.id : null;
  $('projectForm').reset();
  const reference = project?.reference || { name: 'Meu ponto de referência', address: 'Av. Paulista, 2300 · São Paulo', lat: -23.556866, lng: -46.661231 };
  $('projectNameInput').value = project ? `${project.name}${duplicate ? ' — cópia' : ''}`.slice(0, 120) : '';
  $('referenceName').value = reference.name;
  $('referenceAddress').value = reference.address;
  $('referenceLat').value = reference.lat;
  $('referenceLng').value = reference.lng;
  $('projectFormStatus').textContent = '';
  $('projectDialogTitle').textContent = editing ? 'Configurar projeto' : duplicate ? 'Duplicar projeto' : 'Novo projeto';
  $('saveProject').textContent = editing ? 'Salvar alterações' : duplicate ? 'Duplicar projeto' : 'Criar projeto';
  $('projectDialog').showModal();
  if (previewMap) { previewMap.invalidateSize(); syncMarker(); }
  $('projectNameInput').focus();
}
$('newProject').addEventListener('click', () => openForm());
for (const id of ['closeProjectDialog', 'cancelProjectDialog']) $(id).addEventListener('click', () => $('projectDialog').close());
$('referenceDetails').addEventListener('toggle', () => {
  if (!$('referenceDetails').open) return;
  if (!window.L || !window.protomapsL) { $('referenceMap').textContent = 'Mapa indisponível. Você pode informar as coordenadas abaixo.'; return; }
  if (!previewMap) {
    previewMap = L.map('referenceMap').setView(point(), 14);
    protomapsL.leafletLayer({ url: '/sao-paulo.pmtiles', flavor: matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'light', lang: 'pt', attribution: '&copy; OpenStreetMap contributors · Protomaps' }).addTo(previewMap);
    previewMarker = L.circleMarker(point(), { radius: 9, fillColor: '#e63c8d', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(previewMap);
    previewMap.on('click', event => { $('referenceLat').value = event.latlng.lat.toFixed(6); $('referenceLng').value = event.latlng.lng.toFixed(6); previewMarker.setLatLng(event.latlng); });
  }
  previewMap.invalidateSize();
  syncMarker();
});
for (const id of ['referenceLat', 'referenceLng']) $(id).addEventListener('change', syncMarker);
$('projectForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('saveProject').disabled = true;
  $('projectFormStatus').textContent = 'Salvando projeto…';
  try {
    await request(editing ? `/api/projetos/${editing}` : '/api/projetos', { name: $('projectNameInput').value, reference: { name: $('referenceName').value, address: $('referenceAddress').value, lat: point()[0], lng: point()[1] }, ...(duplicateFrom ? { duplicateFrom } : {}) }, editing ? 'PUT' : 'POST');
    $('projectDialog').close();
    await load();
  } catch (error) { $('projectFormStatus').textContent = error.message; }
  finally { $('saveProject').disabled = false; }
});
$('projectGrid').addEventListener('click', async event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const project = projects.find(project => project.id === action.closest('[data-id]').dataset.id);
  if (action.dataset.action === 'edit') return openForm(project);
  if (action.dataset.action === 'duplicate') return openForm(project, true);
  if (action.dataset.action === 'open') {
    try {
      if (window.__TAURI__) await window.__TAURI__.core.invoke('open_project', { id: project.id, name: project.name });
      else window.open(`/projetos/${project.id}/`, `morada-${project.id}`);
    } catch (error) { $('launcherStatus').textContent = `Não foi possível abrir o projeto: ${error}`; }
  }
});
window.addEventListener('focus', () => { if (!$('projectDialog').open) load(); });
load();
