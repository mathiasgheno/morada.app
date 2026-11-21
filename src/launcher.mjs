const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let projects = [];
let editing = null;
let duplicateFrom = null;
let previewMap, previewMarker;
let addressTimer, addressController;
let addressVersion = 0;
let addressLoading = false;
let submitting = false;
function cancelAddressLookup() {
  clearTimeout(addressTimer);
  addressController?.abort();
  addressVersion++;
  addressLoading = false;
  $('saveProject').disabled = submitting;
  $('referenceAddressStatus').textContent = '';
}
function updateAddressFromPoint() {
  cancelAddressLookup();
  const [lat, lng] = point();
  $('referenceAddress').value = '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -24.2 || lat > -23.1 || lng < -47.2 || lng > -46) {
    $('referenceAddressStatus').textContent = 'Escolha um ponto na região de São Paulo.';
    return;
  }
  const version = addressVersion;
  addressLoading = true;
  $('saveProject').disabled = true;
  $('referenceAddressStatus').textContent = 'Buscando endereço…';
  addressTimer = setTimeout(async () => {
    addressController = new AbortController();
    try {
      const response = await fetch(`/api/endereco?lat=${lat}&lng=${lng}`, { signal: addressController.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (version !== addressVersion) return;
      $('referenceAddress').value = result.address;
      $('referenceAddressStatus').textContent = 'Endereço aproximado · Photon / OpenStreetMap. Ajuste se necessário.';
    } catch (error) {
      if (version !== addressVersion) return;
      $('referenceAddressStatus').textContent = `${error.message} Preencha o endereço manualmente.`;
    } finally {
      if (version === addressVersion) {
        addressLoading = false;
        $('saveProject').disabled = submitting;
      }
    }
  }, 450);
}
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
    $('projectGrid').innerHTML = projects.map(project => `<article class="project-card" data-id="${escapeHtml(project.id)}"><button class="project-card-main" data-action="open" aria-label="Abrir ${escapeHtml(project.name)}"><span class="project-heading"><span class="project-symbol" aria-hidden="true">⌂</span><h2>${escapeHtml(project.name)}</h2><span class="project-arrow" aria-hidden="true">›</span></span><p class="project-reference"><span aria-hidden="true">⌖</span>${escapeHtml(project.reference.name)}</p><span class="project-stats"><span><b>${project.propertyCount}</b> imóveis</span><span><b>${project.favoriteCount}</b> favoritos</span><span><b>${project.noteCount}</b> anotações</span></span></button><div class="project-card-footer"><button class="text-button" data-action="edit">Configurar</button><button class="text-button" data-action="duplicate">Duplicar</button><button class="text-button open-project" data-action="open">Abrir projeto ↗</button></div></article>`).join('');
  } catch (error) { $('launcherStatus').textContent = `Não foi possível conectar ao serviço local do Morada. O desktop precisa dele para funcionar. Tente abrir novamente. Detalhe: ${error.message}`; }
}
function point() { return [Number($('referenceLat').value), Number($('referenceLng').value)]; }
function syncMarker() {
  if (!previewMap) return;
  previewMarker.setLatLng(point());
  previewMap.panTo(point(), { animate: false });
}
function openForm(project, duplicate = false) {
  cancelAddressLookup();
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
function newProjectFromMenu() {
  window.__moradaNewProjectRequested = false;
  if (!$('projectDialog').open) openForm();
}
window.addEventListener('morada:new-project', newProjectFromMenu);
if (window.__moradaNewProjectRequested) newProjectFromMenu();
for (const id of ['closeProjectDialog', 'cancelProjectDialog']) $(id).addEventListener('click', () => $('projectDialog').close());
$('projectDialog').addEventListener('close', cancelAddressLookup);
$('referenceAddress').addEventListener('input', cancelAddressLookup);
$('referenceDetails').addEventListener('toggle', () => {
  if (!$('referenceDetails').open) return;
  if (!window.L || !window.protomapsL) { $('referenceMap').textContent = 'Mapa indisponível. Você pode informar as coordenadas abaixo.'; return; }
  if (!previewMap) {
    previewMap = L.map('referenceMap').setView(point(), 14);
    protomapsL.leafletLayer({ url: '/sao-paulo.pmtiles', flavor: matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'light', lang: 'pt', attribution: '&copy; OpenStreetMap contributors · Protomaps' }).addTo(previewMap);
    previewMarker = L.circleMarker(point(), { radius: 9, fillColor: '#e63c8d', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(previewMap);
    previewMap.on('click', event => { $('referenceLat').value = event.latlng.lat.toFixed(6); $('referenceLng').value = event.latlng.lng.toFixed(6); previewMarker.setLatLng(event.latlng); updateAddressFromPoint(); });
  }
  previewMap.invalidateSize();
  syncMarker();
});
for (const id of ['referenceLat', 'referenceLng']) $(id).addEventListener('change', () => { syncMarker(); updateAddressFromPoint(); });
$('projectForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (addressLoading) return;
  submitting = true;
  $('saveProject').disabled = true;
  $('projectFormStatus').textContent = 'Salvando projeto…';
  try {
    await request(editing ? `/api/projetos/${editing}` : '/api/projetos', { name: $('projectNameInput').value, reference: { name: $('referenceName').value, address: $('referenceAddress').value, lat: point()[0], lng: point()[1] }, ...(duplicateFrom ? { duplicateFrom } : {}) }, editing ? 'PUT' : 'POST');
    $('projectDialog').close();
    await load();
  } catch (error) { $('projectFormStatus').textContent = error.message; }
  finally { submitting = false; $('saveProject').disabled = addressLoading; }
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
