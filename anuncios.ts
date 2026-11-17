const cache = new Map<string, { status: string; checkedAt: number }>();
let pending: Promise<unknown> | null = null;
export function estadoAnuncios() {
  return { listings: Object.fromEntries(cache), checking: pending !== null };
}

export async function verificarAnuncios() {
  if (pending) return pending;
  pending = (async () => {
    const properties = await Bun.file(new URL('./imoveis.json', import.meta.url)).json();
    for (const property of properties) {
      if (property.origem === 'viva-real') cache.set(String(property.id), property.statusAnuncio || { status: 'unknown', checkedAt: 0 });
    }
    const ids = [...new Set(properties.filter((property: { origem?: string }) => property.origem !== 'viva-real').map((property: { id: string | number }) => String(property.id)))].filter(id => /^\d{7,12}$/.test(id)) as string[];
    const queue = ids.filter(id => Date.now() - (cache.get(id)?.checkedAt || 0) >= 60000);
    await Promise.all(Array.from({ length: Math.min(10, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        let status = 'unknown';
        try {
          const response = await fetch(`https://www.quintoandar.com.br/imovel/${id}`, {
            signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html' },
          });
          if ([404, 410].includes(response.status)) status = 'inactive';
          else if (response.ok && new URL(response.url).pathname.includes(`/imovel/${id}`)) status = 'active';
          await response.body?.cancel();
        } catch {}
        cache.set(id, { status, checkedAt: Date.now() });
      }
    }));
    return Object.fromEntries(ids.map(id => [id, cache.get(id)]));
  })();
  try { return await pending; } finally { pending = null; }
}
