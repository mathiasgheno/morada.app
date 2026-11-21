// Executado antes dos estilos para evitar um flash do tema incorreto.
(() => {
  const key = 'morada.theme.v1';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['light', 'dark', 'system'].includes(value);
  let mode = 'system';
  let timer;
  try { const stored = localStorage.getItem(key); if (valid(stored)) mode = stored; } catch {}
  if (valid(window.__moradaThemeRequested)) mode = window.__moradaThemeRequested;
  function apply(animate) {
    const dark = mode === 'dark' || (mode === 'system' && system.matches);
    if (animate && document.documentElement.dataset.theme !== (dark ? 'dark' : 'light')) {
      document.documentElement.classList.add('theme-changing');
      clearTimeout(timer);
      timer = setTimeout(() => document.documentElement.classList.remove('theme-changing'), 240);
    }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    window.dispatchEvent(new CustomEvent('morada:theme-change', { detail: { mode, dark } }));
  }
  function syncNative() {
    window.__TAURI__?.core.invoke('set_theme_mode', { mode }).catch(() => {});
  }
  window.moradaTheme = {
    get mode() { return mode; },
    get dark() { return document.documentElement.dataset.theme === 'dark'; },
    setTheme(value) {
      if (!valid(value)) return;
      mode = value;
      try { localStorage.setItem(key, mode); } catch {}
      apply(true);
      syncNative();
    },
  };
  window.addEventListener('storage', event => {
    if (event.key === key) { mode = valid(event.newValue) ? event.newValue : 'system'; apply(true); }
  });
  system.addEventListener('change', () => { if (mode === 'system') apply(true); });
  document.addEventListener('DOMContentLoaded', syncNative, { once: true });
  apply(false);
})();
