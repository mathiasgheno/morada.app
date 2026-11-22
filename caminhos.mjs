import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// No desktop instalado, recursos são somente leitura e dados ficam no app-data.
export const assetRoot = process.env.MORADA_ASSET_DIR || import.meta.dirname;
export const dataRoot = process.env.MORADA_DATA_DIR || import.meta.dirname;
export const projectsDirectory = pathToFileURL(resolve(dataRoot, 'projetos') + '/');
export function assetFile(name) { return pathToFileURL(resolve(assetRoot, name)); }
