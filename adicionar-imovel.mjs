import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { consultarVideo, videoFailure } from './videos.mjs';
import { consultarEstabelecimentos } from './estabelecimentos.mjs';
import { adquirirTrava } from './arquivo-lock.mjs';
import { consultarStatusAnuncio } from './status-anuncios.mjs';

const id = process.argv[2];
const file = new URL('./imoveis.json', import.meta.url);
const lock = new URL('./imoveis.json.lock', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let locked = false;
let release;
try {
  if (!/^\d{7,12}$/.test(id || '')) throw new Error('Informe o ID completo: bun run add:imovel 893877048');
  release = adquirirTrava(lock);
  locked = true;
  let properties;
  try { properties = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') properties = [];
    else throw error;
  }
  if (!Array.isArray(properties)) throw new Error('imoveis.json precisa conter uma lista.');
  if (properties.some(property => String(property.id) === id)) {
    console.log(`Imóvel ${id} já existe; nenhuma alteração.`);
  } else {
    const response = await fetch(`https://www.quintoandar.com.br/property/v2/${id}?variant=0&showPartnerId=true&condoPageValidation=false`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`QuintoAndar respondeu HTTP ${response.status}.`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Resposta inválida do QuintoAndar; lista preservada.');
    const returnedId = data.id ?? data.propertyId ?? data.code;
    if (returnedId != null && String(returnedId) !== id) throw new Error(`Resposta para outro imóvel (${returnedId}); lista preservada.`);
    if (returnedId == null && !(Number.isFinite(data.lat) && Number.isFinite(data.lng) && (data.address || data.neighborhood) && ('rentValue' in data || 'salePrice' in data))) {
      throw new Error('Resposta sem dados reconhecíveis de imóvel; lista preservada.');
    }
    const property = { ...data, id: Number(id), origem: 'quinto-andar' };
    property.statusAnuncio = await consultarStatusAnuncio(id);
    try { [property.nearbyEstablishments] = await consultarEstabelecimentos([property]); }
    catch (error) {
      property.nearbyEstablishments = { radius: 350, items: [], checkedAt: null, error: error.message };
      console.warn(`Estabelecimentos não confirmados: ${error.message}`);
    }
    try { property.video = await consultarVideo(id); }
    catch (error) {
      property.video = videoFailure(null, error);
      console.warn(`Imóvel será adicionado, mas o vídeo não foi confirmado: ${error.message}`);
    }
    await writeFile(temporary, JSON.stringify([...properties, property], null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
    console.log(`Imóvel ${id} adicionado. Recarregue a página.`);
  }
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Outra inclusão está em andamento ou existe arquivo temporário pendente.' : error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    await unlink(temporary).catch(() => {});
    release();
  }
}
