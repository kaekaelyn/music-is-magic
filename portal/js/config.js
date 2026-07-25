// Runtime configuration. No build step, so production setup is two edits:
//
//   STREAM_BASE  the real server, e.g. 'https://stream.example.com'   (M2)
//   NTFY_TOPIC   the ntfy.sh topic from server/ntfy-on-connect.sh     (M6)
//
// Both are empty by default and both degrade to nothing: an empty STREAM_BASE
// runs the portal in mock mode against portal/mock/*.json, and an empty
// NTFY_TOPIC means the summons rune never appears (§5.7).
//
// Dev/test overrides (query params, never visitor-facing):
//   ?stream=https://host   point at a real server (persisted in localStorage)
//   ?stream=clear          forget the override
//   ?mock=live             mock mode only: the mock reports a live source
//   ?theme=cave            mock mode only: force a theme token
//   ?fast=1                mock mode only: short poll/drowse timings for
//                          automated tests (tools/smoke.mjs)

const STREAM_BASE = '';
const NTFY_TOPIC = '';

const qs = new URLSearchParams(location.search);
let streamBase = STREAM_BASE;
try {
  const q = qs.get('stream');
  if (q === 'clear') localStorage.removeItem('mim.streamBase');
  else if (q) localStorage.setItem('mim.streamBase', q);
  streamBase = localStorage.getItem('mim.streamBase') || STREAM_BASE;
} catch (_) {
  // Storage unavailable (rare, e.g. some private modes) — defaults are fine.
}

const mock = !streamBase;
const mockLive = mock && qs.get('mock') === 'live';
// Gated on mock so no URL can talk a real deployment into hammering the
// status endpoint or skipping the 90s grace window.
const fast = mock && qs.get('fast') === '1';

export const CONFIG = {
  mock,
  mockTheme: mock ? qs.get('theme') : null,
  statusUrl: mock
    ? (mockLive ? 'mock/status-live.json' : 'mock/status.json')
    : streamBase + '/status-json.xsl',
  streamUrl: mock ? null : streamBase + '/live',
  metadataUrl: mock ? null : streamBase + '/admin/metadata',
  summonUrl: NTFY_TOPIC ? `https://ntfy.sh/${NTFY_TOPIC}` : null, // §5.7
  pollMs: fast ? 600 : 5000,        // §5.1
  pollJitterMs: fast ? 100 : 1000,  // §5.1
  drowseMs: fast ? 3000 : 90000,    // §2.1 / D12
  stirMs: 2600,                     // §2.1 opening ceremony — never shortened
};
