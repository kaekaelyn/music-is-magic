// §5.1 — polling Icecast's status-json.xsl (or the mock endpoint).

// Icecast quirk: icestats.source is an object with one mount, an array with
// several, and absent with none. Normalize defensively; never throw.
export function normalizeStatus(json) {
  const src = json && json.icestats ? json.icestats.source : null;
  if (!src) return { live: false, theme: 'default' };
  const sources = Array.isArray(src) ? src : [src];
  const mount = sources.find(
    (s) => s && typeof s.listenurl === 'string' && s.listenurl.endsWith('/live')
  );
  if (!mount) return { live: false, theme: 'default' };
  const raw = mount.title != null ? mount.title : mount.song;
  const theme = String(raw == null ? '' : raw).trim().toLowerCase() || 'default';
  return { live: true, theme };
}

// onResult receives {ok:true, live, theme} or {ok:false, error}.
// A failed fetch is reported but the caller must never change state on it.
export function createPoller(url, onResult, { pollMs = 5000, jitterMs = 1000 } = {}) {
  let timer = null;
  let stopped = true;
  let inFlight = false;

  async function poll() {
    if (stopped || inFlight) return;
    if (document.hidden) return; // paused; visibility handler resumes us
    inFlight = true;
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      if (!stopped) onResult({ ok: true, ...normalizeStatus(body) });
    } catch (error) {
      if (!stopped) onResult({ ok: false, error });
    } finally {
      inFlight = false;
      schedule();
    }
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    const delay = pollMs + (Math.random() * 2 - 1) * jitterMs;
    timer = setTimeout(poll, delay);
  }

  function onVisibility() {
    if (!document.hidden) {
      clearTimeout(timer);
      poll();
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      document.addEventListener('visibilitychange', onVisibility);
      poll();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
