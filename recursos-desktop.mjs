import { readFile, mkdir, stat, open, rename, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { adquirirTrava } from './arquivo-lock.mjs';
import { pathToFileURL } from 'node:url';

export function criarGerenciadorRecursos({ assetRoot, dataRoot, fetcher = fetch }) {
  let job, progress = { status: 'pending', received: 0, error: null };
  const mapPath = resolve(dataRoot, 'recursos/sao-paulo.pmtiles');
  const bundledPath = resolve(assetRoot, 'sao-paulo.pmtiles');
  let manifestPromise;
  function manifest() {
    return manifestPromise ||= readFile(resolve(assetRoot, 'recursos.json'), 'utf8')
      .then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  }
  async function status() {
    const config = await manifest();
    if (!config) {
      const ready = await stat(bundledPath).then(s => s.isFile()).catch(() => false);
      return { map: { ready, status: ready ? 'ready' : 'missing', downloadable: false, error: ready ? null : 'Mapa local ausente.' } };
    }
    const metadata = await readFile(mapPath + '.json', 'utf8').then(JSON.parse).catch(() => null);
    const size = await stat(mapPath).then(s => s.size).catch(() => 0);
    const ready = metadata?.sha256 === config.map.sha256 && size === config.map.bytes;
    return { map: { ...progress, ready, status: ready ? 'ready' : progress.status, total: config.map.bytes, downloadable: true,
      percent: ready ? 100 : Math.min(99, Math.floor(progress.received / config.map.bytes * 100)) } };
  }
  async function download() {
    if (job) return;
    const current = await status();
    if (job || current.map.ready) return;
    progress = { status: 'downloading', received: 0, error: null };
    // Definido antes do primeiro await de rede: chamadas concorrentes compartilham o trabalho.
    job = (async () => {
      const config = await manifest();
      if (!config) throw new Error('Download não configurado nesta execução.');
      const url = new URL(config.map.url);
      if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') throw new Error('Origem do mapa inválida.');
      await mkdir(resolve(dataRoot, 'recursos'), { recursive: true });
      const release = adquirirTrava(pathToFileURL(mapPath + '.lock'));
      const temporary = mapPath + `.${process.pid}.tmp`;
      let file;
      try {
        for (const name of await readdir(resolve(dataRoot, 'recursos'))) {
          if (/^sao-paulo\.pmtiles\.\d+\.tmp$/.test(name)) await rm(resolve(dataRoot, 'recursos', name), { force: true });
        }
        const response = await fetcher(url, { signal: AbortSignal.timeout(900_000) });
        if (!response.ok || !response.body) throw new Error(`Download do mapa: HTTP ${response.status}`);
        file = await open(temporary, 'wx');
        const hash = createHash('sha256');
        for await (const chunk of response.body) {
          progress.received += chunk.length;
          if (progress.received > config.map.bytes) throw new Error('Mapa maior que o tamanho esperado.');
          hash.update(chunk);
          let offset = 0;
          while (offset < chunk.length) offset += (await file.write(chunk, offset)).bytesWritten;
        }
        if (progress.received !== config.map.bytes || hash.digest('hex') !== config.map.sha256) throw new Error('Mapa incompleto ou com integridade inválida. Tente baixar novamente.');
        await file.sync(); await file.close(); file = null;
        await rename(temporary, mapPath);
        await writeMetadata(mapPath + '.json', { sha256: config.map.sha256 });
        progress.status = 'ready';
      } finally { await file?.close(); await rm(temporary, { force: true }); release(); }
    })().catch(error => { progress = { ...progress, status: 'error', error: error.message }; }).finally(() => { job = null; });
  }
  return { status, download, async mapFile() { return (await manifest()) ? mapPath : bundledPath; } };
}

async function writeMetadata(path, value) {
  const file = await open(path, 'w');
  try { await file.writeFile(JSON.stringify(value)); } finally { await file.close(); }
}
