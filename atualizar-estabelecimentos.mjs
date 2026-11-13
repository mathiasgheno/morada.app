import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { consultarEstabelecimentos, dadosLocaisValidos, retryDelay } from './estabelecimentos.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { adquirirTrava } from './arquivo-lock.mjs';

const file = new URL('./imoveis.json', import.meta.url);
const lock = new URL('./imoveis.json.lock', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let locked = false;
let release;
try {
  release = adquirirTrava(lock);
  locked = true;
  const properties = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(properties)) throw new Error('Formato inválido');
  const force = process.argv.includes('--force');
  const queue = properties.filter(property => force || !dadosLocaisValidos(property));
  let remaining = queue.length;
  let failures = 0;
  const progress = () => console.log(`Pendentes: ${remaining}/${properties.length} (${properties.length ? (remaining / properties.length * 100).toFixed(1) : '0.0'}%) · ${queue.length - remaining}/${queue.length} concluídos nesta execução`);
  progress();
  for (const property of queue) {
    let attempt = 0;
    while (true) {
      try {
        console.log(`Consultando ${property.id}…`);
        const [result] = await consultarEstabelecimentos([property]);
        if (result.error) throw new Error(result.error);
        property.nearbyEstablishments = result;
        await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
        await rename(temporary, file);
        remaining--;
        progress();
        break;
      } catch (error) {
        if (error.status !== 429) {
          failures++;
          console.error(`${property.id}: ${error.message}; permanece pendente.`);
          break;
        }
        let delay = retryDelay(error.retryAfter, attempt++);
        console.log(`HTTP 429: fila pausada por ${Math.ceil(delay / 1000)}s. O mesmo imóvel será tentado novamente. Ctrl+C para interromper; dados já salvos serão preservados.`);
        while (delay > 0) {
          const interval = Math.min(delay, 30000);
          await sleep(interval);
          delay -= interval;
          if (delay > 0) console.log(`Aguardando liberação: ${Math.ceil(delay / 1000)}s restantes.`);
        }
      }
    }
    if (property !== queue.at(-1)) await sleep(5000);
  }
  progress();
  console.log(`Atualização encerrada: ${failures} falhas; use --force para consultar também os imóveis já carregados.`);
  if (failures) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (locked) { await unlink(temporary).catch(() => {}); release(); }
}
