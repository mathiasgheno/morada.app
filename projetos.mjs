import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { adquirirTrava } from './arquivo-lock.mjs';
import { validateNotes } from './src/notes.mjs';
import { projectsDirectory } from './caminhos.mjs';

export const MAX_PROJECT_BACKUP_BYTES = 50_000_000;
function validarBackup(data) {
  if (!data || data.type !== 'morada-project' || data.version !== 1) throw new Error('Arquivo de projeto Morada inválido ou versão não suportada.');
  const project = data.project;
  if (!project || project.city !== 'São Paulo' || project.state !== 'SP') throw new Error('O projeto deve pertencer a São Paulo, SP.');
  validarIdProjeto(project.id);
  validarConfiguracao(project);
  if (typeof project.createdAt !== 'string' || !Number.isFinite(Date.parse(project.createdAt))) throw new Error('Data de criação do projeto inválida.');
  if (!Array.isArray(data.properties) || !Array.isArray(data.favorites)) throw new Error('Lista de imóveis ou favoritos inválida.');
  const validPropertyId = id => /^\d{1,12}$/.test(String(id)) || /^DEMO-\d+$/.test(String(id));
  const ids = new Set();
  for (const property of data.properties) {
    if (!property || typeof property !== 'object' || Array.isArray(property) || !validPropertyId(property.id) || ids.has(String(property.id))) throw new Error('Imóvel sem ID válido ou ID duplicado no projeto.');
    ids.add(String(property.id));
    if (property.note != null) validateNotes({ [String(property.id)]: property.note });
  }
  if (data.favorites.some(id => !validPropertyId(id))) throw new Error('ID de favorito inválido.');
  return data;
}

export function validarIdProjeto(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('Identificador de projeto inválido.');
  return id;
}
function validarConfiguracao(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw new Error('Informe um nome de até 120 caracteres.');
  const reference = input.reference;
  if (reference == null) return { name, reference: null, city: 'São Paulo', state: 'SP' };
  if (!reference || typeof reference.name !== 'string' || !reference.name.trim() || reference.name.length > 120 ||
      typeof reference.address !== 'string' || reference.address.length > 400 || !Number.isFinite(reference.lat) || !Number.isFinite(reference.lng) ||
      reference.lat < -24.2 || reference.lat > -23.1 || reference.lng < -47.2 || reference.lng > -46) throw new Error('Informe um ponto de referência válido na região de São Paulo.');
  return { name, reference: { name: reference.name.trim(), address: reference.address, lat: reference.lat, lng: reference.lng }, city: 'São Paulo', state: 'SP' };
}

export function criarRepositorioProjetos({ directory = projectsDirectory } = {}) {
  const folder = id => new URL(`${validarIdProjeto(id)}/`, directory);
  async function ler(id) {
    const config = JSON.parse(await readFile(new URL('projeto.json', folder(id)), 'utf8'));
    if (config.id !== id) throw new Error('Configuração de projeto inválida.');
    return config;
  }
  async function arquivo(id, name) {
    if (!['imoveis.json', 'favoritos.json', 'projeto.json'].includes(name)) throw new Error('Arquivo de projeto inválido.');
    await ler(id);
    return new URL(name, folder(id));
  }
  async function criar(input, { id = randomUUID(), snapshot = null } = {}) {
    const source = !snapshot && input.duplicateFrom ? folder(input.duplicateFrom) : null;
    if (!snapshot && input.duplicateFrom) await ler(input.duplicateFrom);
    const config = { ...(snapshot?.project || {}), id: validarIdProjeto(id), ...validarConfiguracao(input), createdAt: snapshot?.project.createdAt || new Date().toISOString(), ...(snapshot ? { importedAt: new Date().toISOString(), importedFrom: snapshot.project.id } : {}) };
    const target = folder(id);
    const staging = new URL(`.creating-${randomUUID()}/`, directory);
    await mkdir(directory, { recursive: true });
    await mkdir(staging);
    try {
      for (const name of ['imoveis.json', 'favoritos.json']) {
        let content = '[]\n';
        if (snapshot) content = JSON.stringify(name === 'imoveis.json' ? snapshot.properties : snapshot.favorites, null, 2) + '\n';
        if (source) {
          content = await readFile(new URL(name, source), 'utf8');
          if (!Array.isArray(JSON.parse(content))) throw new Error(`${name} precisa conter uma lista.`);
        }
        await writeFile(new URL(name, staging), content);
      }
      await writeFile(new URL('projeto.json', staging), JSON.stringify(config, null, 2) + '\n');
      await rename(staging, target);
    } finally { await rm(staging, { recursive: true, force: true }); }
    return config;
  }
  async function inicializar() {
    await mkdir(directory, { recursive: true });
  }
  async function listar() {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const config = await ler(entry.name);
      const properties = JSON.parse(await readFile(new URL('imoveis.json', folder(entry.name)), 'utf8'));
      const favorites = JSON.parse(await readFile(new URL('favoritos.json', folder(entry.name)), 'utf8'));
      result.push({ ...config, propertyCount: properties.length, favoriteCount: favorites.length, noteCount: properties.filter(property => property.note?.text?.trim()).length });
    }
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async function atualizar(id, input) {
    const file = new URL('projeto.json', folder(id));
    const release = adquirirTrava(new URL('projeto.json.lock', folder(id)));
    const temporary = new URL(`projeto.${process.pid}.tmp`, folder(id));
    try {
      const current = await ler(id);
      const config = { ...current, ...validarConfiguracao(input), updatedAt: new Date().toISOString() };
      await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, file);
      return config;
    } finally { await rm(temporary, { force: true }); release(); }
  }
  async function excluir(id, confirmationName) {
    const releases = [];
    try {
      for (const name of ['projeto.json', 'imoveis.json', 'favoritos.json']) releases.push(adquirirTrava(new URL(`${name}.lock`, folder(id))));
      const project = await ler(id);
      if (confirmationName !== project.name) throw new Error('O nome do projeto mudou. Atualize a lista e tente novamente.');
      const trash = new URL('.lixeira/', directory);
      await mkdir(trash, { recursive: true });
      const token = `${id}-${randomUUID()}`;
      const destination = new URL(`${token}/`, trash);
      await rename(folder(id), destination);
      // As travas também foram movidas; os dados não são apagados.
      for (const name of ['projeto.json', 'imoveis.json', 'favoritos.json']) await rm(new URL(`${name}.lock`, destination), { force: true });
      return { project, token };
    } finally { releases.reverse().forEach(release => release()); }
  }
  async function restaurar(token) {
    if (typeof token !== 'string' || !/^[a-z0-9][a-z0-9-]{1,120}$/.test(token)) throw new Error('Identificador de recuperação inválido.');
    const source = new URL(`.lixeira/${token}/`, directory);
    const project = JSON.parse(await readFile(new URL('projeto.json', source), 'utf8'));
    await rename(source, folder(project.id));
    return project;
  }
  async function exportar(id) {
    const releases = [];
    try {
      for (const name of ['projeto.json', 'imoveis.json', 'favoritos.json']) releases.push(adquirirTrava(new URL(`${name}.lock`, folder(id))));
      const project = await ler(id);
      const properties = JSON.parse(await readFile(new URL('imoveis.json', folder(id)), 'utf8'));
      const favorites = JSON.parse(await readFile(new URL('favoritos.json', folder(id)), 'utf8'));
      return validarBackup({ type: 'morada-project', version: 1, exportedAt: new Date().toISOString(), project, properties, favorites });
    } finally { releases.reverse().forEach(release => release()); }
  }
  async function importar(data) {
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_PROJECT_BACKUP_BYTES) throw new Error('Projeto maior que 50 MB.');
    const snapshot = validarBackup(data);
    return criar(snapshot.project, { snapshot });
  }
  return { inicializar, listar, criar, ler, arquivo, atualizar, excluir, restaurar, exportar, importar };
}
