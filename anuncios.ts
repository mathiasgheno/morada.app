import { atualizarStatusAnuncios } from './status-anuncios.mjs';

const results = new Map();
const pending = new Map();
export function estadoAnuncios(file) {
  return { listings: results.get(file.href) || {}, checking: pending.has(file.href) };
}

export async function verificarAnuncios(file) {
  if (pending.has(file.href)) return pending.get(file.href);
  const job = (async () => {
    const properties = await atualizarStatusAnuncios({ file });
    const listings = Object.fromEntries(properties.map(property => [String(property.id), property.statusAnuncio || { status: 'unknown', checkedAt: null }]));
    results.set(file.href, listings);
    return { listings, checking: false };
  })();
  pending.set(file.href, job);
  try { return await job; } finally { pending.delete(file.href); }
}
