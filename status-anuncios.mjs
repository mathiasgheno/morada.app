import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { adquirirTrava } from './arquivo-lock.mjs';
import { arquivoDados } from './dados-projeto.mjs';

export const STATUS_INTERVAL_MS = 60_000;
const defaultFile = arquivoDados('imoveis.json');
const timestamp = value => typeof value === 'number' ? value : Date.parse(value) || 0;

export async function consultarStatusAnuncio(id, previous = null, fetcher = fetch) {
  if (!/^\d{7,12}$/.test(String(id))) throw new Error('ID de anúncio inválido');
  const lastAttemptAt = Date.now();
  try {
    const response = await fetcher(`https://www.quintoandar.com.br/imovel/${id}`, {
      signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html' },
    });
    let status;
    try {
      if ([404, 410].includes(response.status)) status = 'inactive';
      else if (response.ok && new URL(response.url).pathname.includes(`/imovel/${id}`)) status = 'active';
      else throw new Error(`Resposta não conclusiva: HTTP ${response.status}`);
    } finally { await response.body?.cancel(); }
    return { status, checkedAt: Date.now(), lastAttemptAt, method: 'http-page-access', error: null };
  } catch (error) {
    // Timeout, bloqueio ou erro de rede não tornam um anúncio indisponível.
    return { ...previous, status: previous?.status || 'unknown', checkedAt: previous?.checkedAt ?? null,
      lastAttemptAt, method: previous?.method || 'http-page-access', error: error.message };
  }
}

export async function atualizarStatusAnuncios({ file = defaultFile, force = false, fetcher = fetch, onResult = () => {} } = {}) {
  const properties = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(properties)) throw new Error('imoveis.json precisa conter uma lista');
  const queue = properties.filter(property => property.origem !== 'viva-real' && /^\d{7,12}$/.test(String(property.id)) &&
    (force || Date.now() - timestamp(property.statusAnuncio?.lastAttemptAt ?? property.statusAnuncio?.checkedAt) >= STATUS_INTERVAL_MS));
  const updates = new Map();
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let property = queue.shift(); property; property = queue.shift()) {
      const result = await consultarStatusAnuncio(property.id, property.statusAnuncio, fetcher);
      updates.set(String(property.id), result);
      onResult(property.id, result);
    }
  }));
  if (!updates.size) return properties;
  const lock = new URL(`${file.href}.lock`);
  const temporary = new URL(`${file.href}.status-${process.pid}.tmp`);
  const release = adquirirTrava(lock);
  try {
    // Releitura sob a trava: preserva inclusões e outros campos alterados durante a consulta.
    const latest = JSON.parse(await readFile(file, 'utf8'));
    for (const property of latest) {
      const update = updates.get(String(property.id));
      if (property.origem !== 'viva-real' && update && timestamp(update.lastAttemptAt) >= timestamp(property.statusAnuncio?.lastAttemptAt ?? property.statusAnuncio?.checkedAt)) property.statusAnuncio = update;
    }
    await writeFile(temporary, JSON.stringify(latest, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    return latest;
  } finally {
    await unlink(temporary).catch(() => {});
    release();
  }
}
