export const MAX_PROJECT_BACKUP_BYTES = 50_000_000;

export async function exportProject(id, { beforeExport } = {}) {
  if (beforeExport && !(await beforeExport())) throw new Error('Não foi possível salvar a anotação atual. Confira a mensagem na janela de anotações.');
  const response = await fetch(`/api/projetos/${encodeURIComponent(id)}/exportar`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const contents = await response.text();
  if (!response.ok) {
    let error;
    try { error = JSON.parse(contents).error; } catch {}
    throw new Error(error || `Não foi possível exportar o projeto (HTTP ${response.status}).`);
  }
  const filename = response.headers.get('content-disposition')?.match(/filename="([a-z0-9.-]+)"/)?.[1] || 'projeto.morada.json';
  if (window.__TAURI__) return Boolean(await window.__TAURI__.core.invoke('save_project_backup', { contents, filename }));
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
