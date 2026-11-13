import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { consultarVideo, videoFailure } from './videos.mjs';

const file = new URL('./imoveis.json', import.meta.url);
const lock = new URL('./imoveis.json.lock', import.meta.url);
const temporary = new URL('./imoveis.json.tmp', import.meta.url);
let locked = false;
try {
  await writeFile(lock, '', { flag: 'wx' });
  locked = true;
  const properties = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(properties)) throw new Error('imoveis.json precisa conter uma lista');
  const queue = [...properties];
  let failures = 0;
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let property = queue.shift(); property; property = queue.shift()) {
      try {
        property.video = await consultarVideo(property.id);
        console.log(`${property.id}: ${property.video.hasVideo ? 'com vídeo' : 'sem vídeo'}`);
      } catch (error) {
        failures++;
        property.video = videoFailure(property.video, error);
        console.error(`${property.id}: ${error.message}`);
      }
    }
  }));
  await writeFile(temporary, JSON.stringify(properties, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, file);
  console.log(`${properties.length} imóveis processados; ${failures} consultas não confirmadas.`);
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    await unlink(temporary).catch(() => {});
    await unlink(lock);
  }
}
