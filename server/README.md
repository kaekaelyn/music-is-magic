# Server setup (M2)

Templates for the VPS. **Placeholders only — real secrets never get
committed.** Every `CHANGE_ME_*` token below must be replaced during setup.

Target: Debian stable, 1 vCPU / 1 GB, ~$4–5/mo (Hetzner CX22 or RackNerd
equivalent). Rebuild from nothing should take under an hour with this doc.

## Placeholders

| Token | Meaning |
|---|---|
| `stream.example.com` | The streaming subdomain (DNS A record → VPS IP) |
| `https://example.com` | The portal origin (Cloudflare Pages custom domain) |
| `CHANGE_ME_SOURCE` | Icecast source password (what the phone uses) |
| `CHANGE_ME_ADMIN` | Icecast admin password (what control.html uses) |
| `CHANGE_ME_TOPIC` | ntfy.sh topic — a long random string, e.g. `openssl rand -hex 12` |

Generate strong distinct passwords: `openssl rand -base64 18` (twice).

## Steps

1. **Base hardening**

   ```sh
   apt update && apt upgrade -y
   apt install -y ufw unattended-upgrades icecast2 caddy curl
   ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
   dpkg-reconfigure -plow unattended-upgrades
   ```

   (If `caddy` isn't in the distro repo, use the official Caddy apt repo:
   https://caddyserver.com/docs/install#debian-ubuntu-raspbian)

2. **Icecast** — copy `icecast.xml.template` to `/etc/icecast2/icecast.xml`,
   replace placeholders. Icecast binds to localhost only; Caddy is the sole
   public listener. Install the ntfy hook scripts:

   ```sh
   install -m 755 ntfy-on-connect.sh ntfy-on-disconnect.sh /usr/local/bin/
   # edit both: set the real topic
   systemctl enable --now icecast2
   ```

3. **Caddy** — copy `Caddyfile.template` to `/etc/caddy/Caddyfile`, replace
   the two domains, `systemctl reload caddy`. Caddy fetches TLS certs
   automatically once DNS points here (use plain A records, not Cloudflare
   proxy/orange-cloud, so Caddy can complete the ACME challenge and audio
   isn't proxied through Cloudflare).

4. **Phone source (Cool Mic)** — server `stream.example.com`, port 443
   (TLS), mount `/live`, user `source`, password = source password.
   **Go/no-go (D6):** confirm Cool Mic can source MP3. If it only sources
   Ogg/Opus, install Liquidsoap and use `liquidsoap/live.liq.template`
   (see below); the phone then streams to Liquidsoap's harbor on port 8005
   (open it in ufw), and Liquidsoap feeds Icecast `/live` as MP3.

5. **Verify** from anywhere:
   - `curl -s https://stream.example.com/status-json.xsl` → JSON, no source yet.
   - Start Cool Mic → status JSON shows `/live`; an iPhone can play
     `https://stream.example.com/live`.
   - `curl -u admin:PASS "https://stream.example.com/admin/metadata?mount=/live&mode=updinfo&song=forest"`
     → `<response><return>1</return>...` and the status JSON's `title`
     becomes `forest`.
   - `curl https://stream.example.com/admin/stats` → **403** (admin surface
     stays sealed; only `/admin/metadata` passes).
   - Phone subscribed to the ntfy topic buzzes when the source connects.

6. **Point the portal at it** — set `STREAM_BASE` in `portal/js/config.js`
   to `https://stream.example.com` and redeploy Pages.

## Liquidsoap contingency (D6)

Only if Cool Mic can't source MP3:

```sh
apt install -y liquidsoap
mkdir -p /etc/liquidsoap
cp liquidsoap/live.liq.template /etc/liquidsoap/live.liq   # replace placeholders
cp liquidsoap/liquidsoap.service /etc/systemd/system/
systemctl enable --now liquidsoap
ufw allow 8005/tcp
```
