// Serves portal/ with a status endpoint this process controls, so a test or a
// screenshot run can flip the stream live by assigning to a variable. Shared by
// smoke.mjs and shots.mjs.
//
// Nothing here is a test hook in the portal — the portal is served byte for
// byte, exactly as Cloudflare Pages would serve it. The only substitution is
// the one production edit an owner makes by hand (§5.7's NTFY_TOPIC), and it
// fails loudly rather than silently if the line it patches ever moves.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = join(ROOT, 'portal');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const NTFY_LINE = "const NTFY_TOPIC = '';";

export async function startPortal() {
  // live/theme drive the status endpoint; topic fills in §5.7's config edit.
  const state = { live: false, theme: 'night', topic: '' };

  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const send = (code, type, body) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };

    if (path === '/mock/status.json' || path === '/mock/status-live.json') {
      const body = state.live
        ? {
            icestats: {
              host: 'mock',
              server_id: 'mock',
              source: {
                listenurl: 'http://mock:8000/live',
                server_type: 'audio/mpeg',
                listeners: 1,
                title: state.theme,
              },
            },
          }
        : { icestats: { host: 'mock', server_id: 'mock' } };
      return send(200, TYPES['.json'], JSON.stringify(body));
    }

    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    if (rel.includes('..')) return send(403, TYPES['.txt'], 'no');

    try {
      let body = await readFile(join(PORTAL, rel));
      if (rel === 'js/config.js' && state.topic) {
        const src = body.toString();
        if (!src.includes(NTFY_LINE)) {
          return send(500, TYPES['.txt'], `mock-portal: could not find ${NTFY_LINE} in config.js`);
        }
        body = src.replace(NTFY_LINE, `const NTFY_TOPIC = '${state.topic}';`);
      }
      send(200, TYPES[extname(rel)] || 'application/octet-stream', body);
    } catch (_) {
      send(404, TYPES['.txt'], 'not found');
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    state,
    close: () => server.close(),
  };
}

// Prefer a chromium already on the machine. CI images and sandboxes often ship
// one whose build number doesn't match whatever npm resolved, and Playwright
// then insists on a download that may not be permitted.
export function findChromium() {
  if (process.env.MIM_CHROMIUM) return process.env.MIM_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base) {
    const link = join(base, 'chromium');
    if (existsSync(link) && statSync(link).isFile()) return link;
  }
  return undefined;
}

export async function launch(chromium) {
  const executablePath = findChromium();
  return chromium.launch(executablePath ? { executablePath } : {});
}

export { ROOT, PORTAL };
