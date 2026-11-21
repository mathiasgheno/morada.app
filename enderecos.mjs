import { setTimeout as sleep } from 'node:timers/promises';

export function formatarEndereco(properties) {
  if (!properties?.street) throw new Error('Nenhum endereço encontrado perto deste ponto.');
  return [[properties.street, properties.housenumber].filter(Boolean).join(', '), properties.district || properties.locality, properties.city || 'São Paulo', properties.state, properties.postcode].filter(Boolean).join(' · ').slice(0, 400);
}

export function criarConsultaEnderecos({ fetcher = fetch, endpoint = process.env.MORADA_GEOCODER_URL || 'https://photon.komoot.io/reverse', interval = 1000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  return async function consultarEndereco(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -24.2 || lat > -23.1 || lng < -47.2 || lng > -46) throw new Error('Ponto fora da região de São Paulo.');
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const job = queue.catch(() => {}).then(async () => {
      await sleep(Math.max(0, nextRequestAt - Date.now()));
      nextRequestAt = Date.now() + interval;
      const url = new URL(endpoint);
      url.search = new URLSearchParams({ lat: lat.toFixed(6), lon: lng.toFixed(6), limit: '1', radius: '0.1' }).toString();
      const response = await fetcher(url, { headers: { 'User-Agent': 'Morada/0.1 (local housing project planner)', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) {
        if (response.status === 429) nextRequestAt = Date.now() + Math.max(60000, Number(response.headers.get('retry-after')) * 1000 || 0);
        await response.body?.cancel();
        throw new Error(`Consulta de endereço indisponível (HTTP ${response.status}).`);
      }
      const data = await response.json();
      const address = formatarEndereco(data.features?.[0]?.properties);
      const result = { address, source: 'Photon / OpenStreetMap', approximate: true };
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, result);
      return result;
    });
    queue = job;
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  };
}
