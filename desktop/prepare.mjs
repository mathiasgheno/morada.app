import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('../desktop-dist/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
// Protótipo privado: copia os dados atuais, sem modificar os originais.
for (const name of ['index.html', 'launcher.html', 'launcher.css', 'assets', 'style.css', 'theme.css', 'src', 'imoveis.json', 'favoritos.json', 'metro.json', 'sao-paulo.pmtiles', 'estabelecimentos-locais.json']) {
  await cp(fileURLToPath(new URL(name, root)), fileURLToPath(new URL(name, destination)), { recursive: true });
}
