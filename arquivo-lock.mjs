import { openSync, writeFileSync, closeSync, readFileSync, unlinkSync } from 'node:fs';

export function adquirirTrava(file) {
  const token = `${process.pid}:${Date.now()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(file, 'wx');
      try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token })); }
      finally { closeSync(descriptor); }
      const release = () => {
        try {
          if (JSON.parse(readFileSync(file, 'utf8')).token === token) unlinkSync(file);
        } catch {}
      };
      const interrupt = () => { release(); process.exit(130); };
      const terminate = () => { release(); process.exit(143); };
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', terminate);
      process.once('exit', release);
      return () => {
        release();
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
        process.removeListener('exit', release);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(file, 'utf8')); } catch {}
      if (!Number.isInteger(owner?.pid) || owner.pid <= 0) throw new Error('Trava antiga sem identificação. Confirme que não há atualização ativa antes de removê-la.');
      try { process.kill(owner.pid, 0); }
      catch (status) {
        if (status.code === 'ESRCH') { unlinkSync(file); continue; }
        throw error;
      }
      throw new Error(`Outra atualização está ativa (PID ${owner.pid}).`);
    }
  }
  throw new Error('Não foi possível adquirir a trava.');
}
