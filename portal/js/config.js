// Runtime configuration. No build step, so production setup is three edits,
// and only the third is needed for the broadcast build (§5.9):
//
//   STREAM_BASE  the real server, e.g. 'https://stream.example.com'   (M2)
//   NTFY_TOPIC   the ntfy.sh topic from server/ntfy-on-connect.sh     (M6)
//   RELAY_TOPIC  a DIFFERENT random ntfy topic, for phone control     (M7)
//
// All three are empty by default and all three degrade to nothing: an empty
// STREAM_BASE runs the portal in mock mode against portal/mock/*.json, an
// empty NTFY_TOPIC means the summons rune never appears (§5.7), and an empty
// RELAY_TOPIC leaves the broadcast page on local-only control (§5.8).
//
// RELAY_TOPIC must never equal NTFY_TOPIC. The summons topic is handed to
// visitors; the relay topic is a control surface, and anyone holding it can
// drive your broadcast.
//
// !! If portal/ is deployed anywhere public, LEAVE RELAY_TOPIC EMPTY. This
// file is served verbatim to every visitor, so a topic written here is a
// published password. Pass it as ?topic=<name> on broadcast.html and
// control.html instead and keep those two URLs as bookmarks — the topic then
// exists only on your own devices. The constant is here for a private or
// local-only deploy, and that is the only case it is safe in.
//
// Dev/test overrides (query params, never visitor-facing):
//   ?stream=https://host   point at a real server (persisted in localStorage)
//   ?stream=clear          forget the override
//   ?mock=live             mock mode only: the mock reports a live source
//   ?theme=cave            mock mode only: force a theme token
//   ?fast=1                mock mode only: short poll/drowse timings for
//                          automated tests (tools/smoke.mjs)
//   ?relay=local|ntfy|none broadcast/control only: pick the control channel
//   ?topic=<name>          broadcast/control only: relay topic for this load
//   ?nomic=1               broadcast only: skip capture, run on synthetic
//                          features (lets the page be tested with no mic)

const STREAM_BASE = '';
const NTFY_TOPIC = '';
const RELAY_TOPIC = '';

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

// The relay (§5.8) is only ever read by broadcast.html and control.html, both
// owner-facing, so these overrides are not gated on mock mode the way the
// visitor-facing ones are. index.html never touches them.
// Persisted, the same way ?stream= is, and for a sharper reason: a query
// string is not durable. `serve` rewrites /broadcast.html to /broadcast with
// a redirect that discards the query, so a carefully typed ?topic= can be
// gone before the page even runs — and the page then looks configured-wrong
// rather than stripped. Bookmarks, home-screen shortcuts and OBS browser
// sources lose it in their own ways too. Set it once per device; ?topic=clear
// forgets it.
let relayTopic = RELAY_TOPIC;
try {
  const q = qs.get('topic');
  if (q === 'clear') localStorage.removeItem('mim.relayTopic');
  else if (q) localStorage.setItem('mim.relayTopic', q);
  relayTopic = localStorage.getItem('mim.relayTopic') || RELAY_TOPIC;
} catch (_) {
  relayTopic = qs.get('topic') || RELAY_TOPIC; // no storage: this load only
}
const qsRelay = qs.get('relay');
// A topic wins over ?relay=local, rather than the other way round. The two
// together are a contradiction — local is BroadcastChannel, which cannot
// leave the machine, so a topic beside it can only be ignored — and letting
// the mode flag win stranded a broadcast page on a channel its phone could
// not reach, while both ends reported themselves healthy. A ?topic= is a
// deliberate act; a stale ?relay=local in a bookmark is not. ?relay=none
// still switches the channel off, because that one is unambiguous.
const relayMode = relayTopic && qsRelay !== 'none' ? 'ntfy' : qsRelay || 'none';

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

  // --- broadcast build (§5.8, §5.9) ---------------------------------------
  relayMode,
  relayTopic,
  // A 16:9 frame is sized off its height, so the website's 0.3 would strand
  // the eye in a field of black. Tuned against tools/shots.mjs at 1920×1080.
  broadcastRadius: 0.42,
  // The relay is event-driven, but the eye's hygiene rules (§2.1) are written
  // against a poll. A local ticker feeds the machine so the 2-poll open rule
  // and the drowse path stay exactly the website's code, unmodified.
  broadcastTickMs: fast ? 150 : 1000,
  // Shorter than the website's 90s. D12's grace window exists to absorb cell
  // dropouts between the phone and the VPS; on the broadcast machine there is
  // no network in that path, so the only thing drowse still buys is the
  // ceremony of falling asleep. 90s of it would be dead air on a live channel.
  broadcastDrowseMs: fast ? 1500 : 12000,
  // A broadcast page reloaded mid-set should come back live; one opened the
  // next morning should not be woken by yesterday's last message.
  catchUpMaxAgeMs: 120000,
  skipMic: qs.get('nomic') === '1',
};
