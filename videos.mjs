export async function consultarVideo(id, fetcher = fetch) {
  const response = await fetcher(`https://www.quintoandar.com.br/api/kodak/v1/media/videos/house/${id}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Vídeo: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error('Resposta de vídeo inválida');
  const items = data.items.map(item => {
    const sourceId = String(item.sourceId || '');
    const url = item.videoSource === 'VIMEO' && /^\d+(\/[a-zA-Z0-9]+)?$/.test(sourceId) ? `https://vimeo.com/${sourceId}` : null;
    return { id: item.id, sourceId, provider: item.videoSource, status: item.status, url };
  });
  return { hasVideo: items.length > 0, items, checkedAt: new Date().toISOString(), error: null };
}

export function videoFailure(previous, error) {
  return { hasVideo: null, items: [], checkedAt: null, ...previous, error: error.message, attemptedAt: new Date().toISOString() };
}
