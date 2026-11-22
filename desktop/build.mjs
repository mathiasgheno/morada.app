import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
const cargoBin = join(homedir(), '.cargo', 'bin');
if (existsSync(cargoBin)) env.PATH = `${cargoBin}${delimiter}${env.PATH || ''}`;
const child = Bun.spawn([process.execPath, 'run', 'tauri', 'build', '--config', 'src-tauri/tauri.build.conf.json', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
