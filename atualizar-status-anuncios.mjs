import { atualizarStatusAnuncios } from './status-anuncios.mjs';

try {
  let checked = 0;
  let failures = 0;
  await atualizarStatusAnuncios({ force: true, onResult(id, result) {
    checked++;
    if (result.error) failures++;
    console.log(`${id}: ${result.status}${result.error ? ` · ${result.error} (último status preservado)` : ''}`);
  } });
  console.log(`${checked} anúncios QuintoAndar consultados; ${failures} consultas não conclusivas. JSON atualizado.`);
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
