import { fileURLToPath } from 'node:url';
import { desktopEnvironment } from './environment.mjs';

const env = desktopEnvironment();
const child = Bun.spawn([process.execPath, 'run', 'tauri', 'dev', '--config', 'src-tauri/tauri.dev.conf.json', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env,
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
