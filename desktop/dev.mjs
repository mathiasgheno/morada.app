import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cargoBin = join(homedir(), '.cargo', 'bin');
const env = { ...process.env };
if (existsSync(cargoBin)) env.PATH = `${cargoBin}${delimiter}${env.PATH || ''}`;
const child = Bun.spawn(['bun', 'run', 'tauri', 'dev', '--config', 'src-tauri/tauri.dev.conf.json', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env,
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
