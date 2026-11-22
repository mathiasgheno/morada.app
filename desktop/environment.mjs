import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function withCargoPath(base, cargoBin, platform = process.platform) {
  const env = { ...base };
  // Windows costuma fornecer `Path`, não `PATH`; copiar para um objeto perde a
  // busca sem distinção de maiúsculas que process.env oferece no Windows.
  const key = platform === 'win32' ? Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'Path' : 'PATH';
  env[key] = `${cargoBin}${platform === 'win32' ? ';' : ':'}${env[key] || ''}`;
  return env;
}

export function desktopEnvironment() {
  const cargoBin = join(homedir(), '.cargo', 'bin');
  return existsSync(cargoBin) ? withCargoPath(process.env, cargoBin) : { ...process.env };
}
