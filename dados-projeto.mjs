import { validarIdProjeto } from './projetos.mjs';

// Mantém os comandos antigos; --project direciona somente os arquivos de dados.
const flag = process.argv.indexOf('--project');
const projectId = flag >= 0 ? process.argv[flag + 1] : process.env.MORADA_PROJECT_ID;
if (flag >= 0) {
  if (!projectId) throw new Error('Informe o identificador depois de --project.');
  process.argv.splice(flag, 2);
}
const directory = projectId ? new URL(`./projetos/${validarIdProjeto(projectId)}/`, import.meta.url) : new URL('./', import.meta.url);
export function arquivoDados(name) {
  if (!['imoveis.json', 'favoritos.json'].includes(name)) throw new Error('Arquivo de dados inválido');
  return new URL(name, directory);
}
