import { atualizarStatusAnuncios } from './status-anuncios.mjs';

let listings = {};
let pending: Promise<unknown> | null = null;
export function estadoAnuncios() {
  return { listings, checking: pending !== null };
}

export async function verificarAnuncios() {
  if (pending) return pending;
  pending = (async () => {
    const properties = await atualizarStatusAnuncios();
    listings = Object.fromEntries(properties.map(property => [String(property.id), property.statusAnuncio || { status: 'unknown', checkedAt: null }]));
    return listings;
  })();
  try { return await pending; } finally { pending = null; }
}
