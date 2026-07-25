// Runtime configuration. No build step, so production setup is one edit:
// set STREAM_BASE to the real server (e.g. 'https://stream.example.com').
//
// While STREAM_BASE is empty the portal runs in mock mode against
// portal/mock/*.json. Dev/test overrides (query params, never visitor-facing):
//   ?stream=https://host   point at a real server (persisted in localStorage)
//   ?stream=clear          forget the override
//   ?mock=live             mock mode only: the mock reports a live source
//   ?theme=cave            mock mode only: force a theme token

const STREAM_BASE = '';

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

export const CONFIG = {
  mock,
  mockTheme: mock ? qs.get('theme') : null,
  statusUrl: mock
    ? (mockLive ? 'mock/status-live.json' : 'mock/status.json')
    : streamBase + '/status-json.xsl',
  streamUrl: mock ? null : streamBase + '/live',
  metadataUrl: mock ? null : streamBase + '/admin/metadata',
  pollMs: 5000,       // §5.1
  pollJitterMs: 1000, // §5.1
  drowseMs: 90000,    // §2.1 / D12
  stirMs: 2600,       // §2.1 opening ceremony
};
