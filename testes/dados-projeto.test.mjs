import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../dados-projeto.mjs', import.meta.url).href;
function run(args = [], project = '') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import { arquivoDados } from ${JSON.stringify(moduleUrl)}; arquivoDados('imoveis.json');`, ...args], {
    encoding: 'utf8', env: { ...process.env, MORADA_PROJECT_ID: project },
  });
}
test('Scripts exigem projeto explícito e rejeitam destinos ausentes ou inválidos', () => {
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Selecione um projeto com --project ID/);
  const invalid = run([], '../fora');
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Identificador de projeto inválido/);
  const nonexistent = run([], 'teste-ausente-3ed45189-7db2-49ff-8297-e9a5b372fcaa');
  assert.notEqual(nonexistent.status, 0);
  assert.match(nonexistent.stderr, /Projeto não encontrado/);
});
