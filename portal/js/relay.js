// §5.8 — the control channel: the streamer's phone to the broadcast page.
//
// The website version uses Icecast as its bus. control.html writes the theme
// into the mount's metadata and the portal reads it back out of
// status-json.xsl, so the stream itself carries the moods. A YouTube broadcast
// has no Icecast in the loop, so that bus is gone and the phone needs another
// way to reach the desktop. This module is that way, behind one small
// interface, with the transport chosen by config:
//
//   'local'  BroadcastChannel + a localStorage mirror. Same machine only, zero
//            setup, works offline. This is the test transport and the way to
//            try the whole thing before committing to any infrastructure.
//   'ntfy'   ntfy.sh — publish by POST, subscribe by EventSource. Free, no
//            account, no backend, and already this project's push transport
//            (D13/§5.7). It beat a Cloudflare Worker + KV on one hard point:
//            KV is eventually consistent, advertised at up to 60s, and a mood
//            button that might take a minute is a broken mood button.
//   'none'   no channel; the broadcast page runs on its own defaults.
//
// Threat model is §5.7's, unchanged: the topic name is the only secret, and
// anyone holding it can publish as well as read. Worst case is a stranger
// recoloring your visuals mid-set. Use a long random topic, don't paste it
// anywhere public, and note that it must NOT be the same topic as the summons.
//
// Nothing here ever throws. A dead relay leaves the eye on its last known
// state, which is the same posture as §5.1's "a failed fetch changes nothing".

export const EYE_LIVE = 'live';
export const EYE_SEALED = 'sealed';

// Deliberately narrow: this string is concatenated into an asset path by
// themes.js, and it arrives from a public topic anyone can post to.
const THEME_RE = /^[a-z0-9_-]{1,32}$/;

// A message is only allowed to say the two things the eye understands. Junk
// posted to the topic — by a stranger, or by ntfy's own keepalives — is
// dropped rather than being allowed to half-apply.
export function sanitize(raw) {
  let obj = raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;

  const out = {};
  if (obj.eye === EYE_LIVE || obj.eye === EYE_SEALED) out.eye = obj.eye;
  if (typeof obj.theme === 'string') {
    const t = obj.theme.trim().toLowerCase();
    if (THEME_RE.test(t)) out.theme = t;
  }
  return out.eye || out.theme ? out : null;
}

// --- local: BroadcastChannel, for one machine ------------------------------

const LOCAL_KEY = 'mim.relay.state';
const LOCAL_CHANNEL = 'mim.relay';

function localAdapter() {
  let chan = null;
  let onState = null;
  let onStorage = null;

  function deliver(payload) {
    const clean = sanitize(payload);
    if (clean && onState) onState(clean);
  }

  return {
    start(handlers) {
      onState = handlers.onState;

      // Catch-up: a page opened second still learns the current mood.
      try {
        const last = localStorage.getItem(LOCAL_KEY);
        if (last) {
          const env = JSON.parse(last);
          if (handlers.onCatchUp) handlers.onCatchUp(sanitize(env.state), env.ts || 0);
        }
      } catch (_) { /* no storage, no catch-up — not fatal */ }

      try {
        chan = new BroadcastChannel(LOCAL_CHANNEL);
        chan.onmessage = (e) => deliver(e.data);
      } catch (_) {
        chan = null; // falls back to the storage event below
      }

      // Belt and braces: `storage` fires cross-tab even where
      // BroadcastChannel is unavailable, and costs nothing when it isn't.
      onStorage = (e) => {
        if (e.key !== LOCAL_KEY || !e.newValue) return;
        try { deliver(JSON.parse(e.newValue).state); } catch (_) {}
      };
      window.addEventListener('storage', onStorage);

      if (handlers.onStatus) handlers.onStatus({ ok: true, detail: 'local' });
    },

    publish(state) {
      const env = { state, ts: Date.now() };
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(env)); } catch (_) {}
      try { if (chan) chan.postMessage(state); } catch (_) {}
      return Promise.resolve(true);
    },

    stop() {
      try { if (chan) chan.close(); } catch (_) {}
      chan = null;
      if (onStorage) window.removeEventListener('storage', onStorage);
      onStorage = null;
    },
  };
}

// --- ntfy: phone to desktop, over the open internet ------------------------

function ntfyAdapter({ topic, base = 'https://ntfy.sh', catchUpWindow = '12h' }) {
  let source = null;
  let stopped = false;
  const url = `${base}/${encodeURIComponent(topic)}`;

  return {
    async start(handlers) {
      stopped = false;

      // Catch-up before subscribing, so a broadcast page reloaded mid-set
      // comes back knowing the mood instead of snapping to default. The
      // freshness rule that stops an old session resurrecting the eye lives
      // in the caller (see broadcast.js) — here we just report the age.
      try {
        const res = await fetch(`${url}/json?poll=1&since=${catchUpWindow}`, { cache: 'no-store' });
        if (res.ok) {
          const lines = (await res.text()).split('\n').filter(Boolean);
          for (let i = lines.length - 1; i >= 0; i--) {
            let env;
            try { env = JSON.parse(lines[i]); } catch (_) { continue; }
            if (env.event !== 'message') continue;
            const clean = sanitize(env.message);
            if (!clean) continue;
            if (handlers.onCatchUp) handlers.onCatchUp(clean, (env.time || 0) * 1000);
            break; // newest wins
          }
        }
      } catch (_) { /* offline at open: the stream below will retry forever */ }

      if (stopped) return;

      try {
        source = new EventSource(`${url}/sse`);
        source.onmessage = (e) => {
          let env;
          try { env = JSON.parse(e.data); } catch (_) { return; }
          // The /sse stream carries ntfy's own 'open' and 'keepalive' frames
          // in the same shape as real messages.
          if (env.event === 'open' && handlers.onStatus) {
            handlers.onStatus({ ok: true, detail: 'subscribed' });
            return;
          }
          if (env.event !== 'message') return;
          const clean = sanitize(env.message);
          if (clean && handlers.onState) handlers.onState(clean);
        };
        source.onerror = () => {
          // EventSource reconnects on its own; say so rather than looking dead.
          if (handlers.onStatus) handlers.onStatus({ ok: false, detail: 'reconnecting' });
        };
      } catch (error) {
        if (handlers.onStatus) handlers.onStatus({ ok: false, detail: 'unavailable' });
      }
    },

    async publish(state) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          // X-Priority, not Priority: the latter is a forbidden header name in
          // fetch and would be stripped. Min priority keeps a mood tap from
          // buzzing any phone that happens to subscribe to this topic.
          headers: { 'X-Priority': 'min', 'X-Title': 'mim-control' },
          body: JSON.stringify(state),
        });
        return res.ok;
      } catch (_) {
        return false;
      }
    },

    stop() {
      stopped = true;
      try { if (source) source.close(); } catch (_) {}
      source = null;
    },
  };
}

// --- the façade ------------------------------------------------------------

function noopAdapter() {
  return {
    start(handlers) {
      if (handlers.onStatus) handlers.onStatus({ ok: false, detail: 'no relay configured' });
    },
    publish() { return Promise.resolve(false); },
    stop() {},
  };
}

// handlers: { onState(state), onCatchUp(state, tsMs), onStatus({ok, detail}) }
// `publish` takes a partial — {theme} alone or {eye} alone is valid, and the
// receiver merges. That keeps a mood tap from implying anything about whether
// the eye should be open.
export function createRelay({ mode = 'none', topic = '', base, catchUpWindow } = {}) {
  let adapter;
  if (mode === 'local') adapter = localAdapter();
  else if (mode === 'ntfy' && topic) adapter = ntfyAdapter({ topic, base, catchUpWindow });
  else adapter = noopAdapter();

  const active = mode === 'local' || (mode === 'ntfy' && !!topic);

  return {
    mode: active ? mode : 'none',
    active,
    start(handlers = {}) { adapter.start(handlers); },
    publish(patch) {
      const clean = sanitize(patch);
      if (!clean) return Promise.resolve(false);
      return adapter.publish(clean);
    },
    stop() { adapter.stop(); },
  };
}
