import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { adquirirTrava } from './arquivo-lock.mjs';

export const DEFAULT_REFERENCE = {
  name: 'Trabalho · Paulista, 2300',
  address: 'Av. Paulista, 2300 — 19º andar, conj. 192 · São Paulo - SP',
  lat: -23.556866, lng: -46.661231,
};
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

export function criarRepositorioProjetos({ directory = new URL('./projetos/', import.meta.url), legacyDirectory = new URL('./', import.meta.url) } = {}) {
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
  async function criar(input, { id = randomUUID(), legacy = false } = {}) {
    const source = input.duplicateFrom ? folder(input.duplicateFrom) : legacy ? legacyDirectory : null;
    if (input.duplicateFrom) await ler(input.duplicateFrom);
    const config = { id: validarIdProjeto(id), ...validarConfiguracao(input), createdAt: new Date().toISOString() };
    const target = folder(id);
    const staging = new URL(`.creating-${randomUUID()}/`, directory);
    await mkdir(directory, { recursive: true });
    await mkdir(staging);
    try {
      for (const name of ['imoveis.json', 'favoritos.json']) {
        let content = '[]\n';
        if (source) {
          try { content = await readFile(new URL(name, source), 'utf8'); }
          catch (error) { if (error.code !== 'ENOENT' || !legacy) throw error; }
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
    const marker = new URL('.initialized', directory);
    try { await readFile(marker); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const release = adquirirTrava(new URL('.initialize.lock', directory));
    try {
      try { await readFile(marker); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const id = 'bela-vista-caminhando-ate-o-trabalho';
      let exists = false;
      try { await ler(id); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!exists) await criar({ name: 'Bela Vista, caminhando até o trabalho', reference: DEFAULT_REFERENCE }, { id, legacy: true });
      await writeFile(marker, '1\n', { flag: 'wx' });
    } finally { release(); }
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
  return { inicializar, listar, criar, ler, arquivo, atualizar };
}
