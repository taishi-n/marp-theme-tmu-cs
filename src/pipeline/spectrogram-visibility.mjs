/** Install slide-aware wavegram rendering without depending on sequential playback. */
export function installSpectrogramVisibility({ document, window, initialize, pause }) {
  const players = Array.from(document.querySelectorAll('[data-wavegram-spectrogram-player]'));
  const active = new Set();
  const intersecting = new WeakSet();
  let scheduled = false;
  const requestFrame = window.requestAnimationFrame?.bind(window) || ((callback) => setTimeout(callback, 0));

  function activate(player) {
    if (active.has(player)) return;
    const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
    if (!wavegram) return;
    active.add(player);
    wavegram.setAttribute('rendering', 'active');
    initialize(player);
    wavegram.refresh?.();
  }

  function suspend(player) {
    if (!active.delete(player)) return;
    const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
    wavegram?.setAttribute('rendering', 'suspended');
    pause(player);
  }

  function isVisible(player) {
    if (document.hidden) return false;
    const slide = player.closest('.bespoke-marp-slide');
    const overview = document.body?.dataset?.bespokeView === 'overview';
    if (slide && !overview) return slide.classList.contains('bespoke-marp-active');
    if (intersectionObserver) return intersecting.has(player);
    // Plain HTML and older embedding hosts may not provide IntersectionObserver.
    const rect = player.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth);
  }

  function synchronize() {
    for (const player of players) {
      if (isVisible(player)) activate(player);
      else suspend(player);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      synchronize();
    });
  }

  const intersectionObserver = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      }
      schedule();
    }) : null;
  for (const player of players) intersectionObserver?.observe(player);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => players.forEach(suspend));
  return { activate, synchronize };
}
