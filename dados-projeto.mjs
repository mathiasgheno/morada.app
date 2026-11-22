import { existsSync, readFileSync } from 'node:fs';
import { validarIdProjeto } from './projetos.mjs';

// Todos os comandos de dados exigem um projeto explícito.
const flag = process.argv.indexOf('--project');
const projectId = flag >= 0 ? process.argv[flag + 1] : process.env.MORADA_PROJECT_ID;
if (flag >= 0) {
  if (!projectId) throw new Error('Informe o identificador depois de --project.');
  process.argv.splice(flag, 2);
}
export function arquivoDados(name) {
  if (!['imoveis.json', 'favoritos.json'].includes(name)) throw new Error('Arquivo de dados inválido');
  if (!projectId) throw new Error('Selecione um projeto com --project ID (ou MORADA_PROJECT_ID). Consulte os IDs no launcher ou em GET /api/projetos.');
  const directory = new URL(`./projetos/${validarIdProjeto(projectId)}/`, import.meta.url);
  const configFile = new URL('projeto.json', directory);
  if (!existsSync(configFile)) throw new Error(`Projeto não encontrado: ${projectId}`);
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  if (config.id !== projectId) throw new Error('Configuração de projeto inválida.');
  return new URL(name, directory);
}
