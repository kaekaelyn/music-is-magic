# Running the broadcast for real

How to put the eye on YouTube, with your microphone as the sound and your
phone as the mood control. Every component you need is listed with how to get
it. Nothing here costs money.

For testing before you go live, see [TESTING.md](TESTING.md).
For what the project is and why, see [PLAN.md](PLAN.md).

> **This does not touch the website.** `portal/index.html` and the Icecast
> setup are unchanged and keep working exactly as before. The broadcast is a
> second page, `portal/broadcast.html`, that shares the same eye and the same
> moods.

---

## What you are building

```
  your piano
      │
      ├── microphone ──► browser page (broadcast.html) ──► the eye reacts
      │                                    │
      │                                    ▼
      └── microphone ──► OBS Studio ──► video + audio ──► YouTube
                                    ▲
   your phone ──► ntfy.sh ──────────┘  (moods + wake/seal)
```

Your microphone gets used twice, by two different programs, for two different
jobs: the browser listens to it to *drive the visuals*, and OBS listens to it
to *send the sound to YouTube*. That is normal and they do not conflict. The
browser page never plays any sound, so there is no echo and no doubled audio.

---

## Part 0 — the five things you need

Work through these once. Later runs skip straight to [Part 5](#part-5--the-going-live-routine).

### 0. The project, on your computer

Everything below assumes the project's files are on your machine. Creating an
empty folder is not enough — the files have to be downloaded into it. If you
have not done this yet, do
[TESTING.md Stage 0](TESTING.md#stage-0--get-the-project-onto-your-computer)
first; it is four short steps and it covers what to do when each one goes
wrong.

The short version, if git is already installed — run this **without** making
the folder first:

```sh
# Windows
cd C:\
git clone --branch claude/youtube-desktop-eye-streaming-go1do0 https://github.com/kaekaelyn/music-is-magic.git musicismagic

# macOS / Linux
cd ~
git clone --branch claude/youtube-desktop-eye-streaming-go1do0 https://github.com/kaekaelyn/music-is-magic.git music-is-magic
```

Wherever this file says `cd path/to/music-is-magic`, Windows users type
`cd C:\musicismagic`.

### 1. A way to serve the eye files

The page must be served over `http://localhost` or `https://` — opening the
`.html` file directly with `file://` will **not** work, because browsers refuse
microphone access there.

Pick whichever you already have:

**Node** — the easier one on Windows. Install from
[nodejs.org](https://nodejs.org/) (get the **LTS** build), then reopen your
terminal:

```sh
cd path/to/music-is-magic        # Windows: cd C:\musicismagic
npx --yes serve portal --listen 8000
```

**Python** (built in on macOS and Linux; on Windows install from
[python.org/downloads](https://www.python.org/downloads/) and tick "Add
python.exe to PATH"):

```sh
cd path/to/music-is-magic
python3 -m http.server -d portal 8000
```

Either prints something like `Accepting connections at http://localhost:8000`.
The eye is now at **http://localhost:8000/broadcast.html**.

**Leave that terminal window open the whole time you are streaming** — closing
it stops the server and the eye goes blank. To stop it deliberately, click the
window and press `Ctrl+C`.

> Already deployed the site to Cloudflare Pages? Then you can use
> `https://yoursite/broadcast.html` instead and skip the local server. Both
> work. See the security note in step 2 if you do.

### 2. A relay topic (your phone's private channel)

The phone talks to the desktop through [ntfy.sh](https://ntfy.sh), a free
public message relay. No account, no signup, no install. You just need to
invent an unguessable channel name.

Generate one:

```sh
# macOS / Linux
echo "mim-$(head -c 12 /dev/urandom | base64 | tr -dc 'a-z0-9')"

# Windows PowerShell
"mim-" + -join ((48..57)+(97..122) | Get-Random -Count 16 | % {[char]$_})
```

You will get something like `mim-k7q2x9vb4mzr8`. **Write it down.** This is
the only secret in the whole setup.

> **Anyone who knows this string can change your visuals mid-stream.** That is
> the accepted trade for having no backend (it is the same trade §5.7 already
> makes for the summons topic). Keep it to yourself, and make it *different*
> from your summons topic.
>
> **Never put it in `config.js` if you deploy the site publicly** — that file
> is served to every visitor, so a topic written there is a published
> password. Use the `?topic=` URL below instead and keep the URLs as
> bookmarks.

Your two URLs are now:

| Device | URL |
|---|---|
| Desktop (the eye) | `http://localhost:8000/broadcast.html?topic=YOUR-TOPIC` |
| Phone (the control) | `http://localhost:8000/control.html?topic=YOUR-TOPIC` |

Bookmark the first one on your desktop. For the phone, see
[Part 2](#part-2--your-phone-drives-it).

### 3. OBS Studio

Free and open source. This is what actually sends video to YouTube.

- **Windows / macOS**: download from
  [obsproject.com/download](https://obsproject.com/download) and run the
  installer.
- **Linux (Debian/Ubuntu)**:
  ```sh
  sudo apt install obs-studio
  ```
  or `flatpak install flathub com.obsproject.Studio`.

First launch runs an auto-configuration wizard — choose **"Optimize for
streaming"** and let it finish. Then set the canvas explicitly:

**Settings → Video**: Base and Output resolution both `1920x1080`, FPS `30`.
(The eye moves slowly. 30 fps looks identical to 60 here and halves the CPU.)

### 4. YouTube live streaming, enabled

1. Go to [youtube.com/verify](https://www.youtube.com/verify) and verify your
   account by phone if you have not.
2. Go to [youtube.com/livestreaming](https://www.youtube.com/livestreaming) and
   enable live streaming.
3. **Wait 24 hours.** First-time activation has a mandatory delay. Do this the
   day before, not the day of.

There is no subscriber minimum for streaming from a desktop encoder.

---

## Part 1 — get the eye on screen

1. Start your file server (Part 0.1).
2. Open your desktop browser to
   `http://localhost:8000/broadcast.html?topic=YOUR-TOPIC`
   Use **Chrome, Edge, or Firefox**. Safari's WebGL and microphone handling
   are the least reliable of the four.
3. You will see a dark stone eye, sealed, and a small panel in the corner.
4. **Click anywhere on the frame.** The browser asks for microphone
   permission — allow it.
5. Play a few notes. The `audio` row in the panel should read **live** in
   green, and the thin bar underneath should move with the sound.

The corner panel is the operator HUD. It reads:

| Row | Meaning |
|---|---|
| `eye` | current state — sealed, stirring, open, communing, drowsing |
| `mood` | the theme currently showing |
| `audio` | `live` = the mic is driving the visuals. Anything else, see troubleshooting |
| `control` | `subscribed` = your phone can reach this page |
| `render` | `webgl` is good. `canvas2d` means this machine fell back — still works, looks simpler |

The HUD fades out on its own after six seconds of no mouse movement, and the
mouse cursor hides with it. Press `h` to toggle it. **It is not on the stream
if you use Browser Source** (Part 3, option A) — but it *is* if you use Window
Capture, which is why it fades.

Click **wake** in the HUD. The stone should part over about three seconds and
the field should appear inside the aperture, moving with your playing. Click
**seal** and it narrows shut over about twelve seconds.

If that works, the hard part is done.

---

## Part 2 — your phone drives it

The control page needs to be reachable from your phone. Two ways:

**Option A — same WiFi (no deploy needed).** Find your computer's local
address:

```sh
# macOS
ipconfig getifaddr en0
# Linux
hostname -I | awk '{print $1}'
# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.PrefixOrigin -eq "Dhcp"}).IPAddress
```

That gives something like `192.168.1.42`. On your phone, open:

```
http://192.168.1.42:8000/control.html?topic=YOUR-TOPIC
```

Add it to your home screen. Note this only works while the phone is on the
same WiFi as the computer.

**Option B — deploy the site (works anywhere, including cell data).** Push
`portal/` to Cloudflare Pages (free — no build command, output directory
`portal`) and use `https://yoursite/control.html?topic=YOUR-TOPIC`. This is
better if you ever want to control it from another room on cell data, and it
is the same deploy the website already needs.

Either way, on the phone you should see:

- a **wake** and **seal** pair at the top
- a grid of mood buttons — one per theme folder
- a status line that ends in `· control ok`

Tap **wake**. The eye on your desktop should begin its ceremony within about a
second. Tap **cave**. The desktop should morph to cave. That round trip
working is the whole feature.

> The mood buttons also still drive the *website* through Icecast if you have
> that set up. One tap goes to both. If you never set up the VPS, the Icecast
> half is simply skipped.

---

## Part 3 — get the eye into OBS

Open OBS. In the **Sources** panel, click **+**.

### Option A — Browser Source (try this first, it is tidier)

1. Add **Browser**, name it `eye`.
2. URL: `http://localhost:8000/broadcast.html?topic=YOUR-TOPIC`
3. Width `1920`, Height `1080`.
4. Tick **Control audio via OBS** — *no*, leave it unticked. The page makes no
   sound.
5. OK.

Now check the HUD inside OBS: right-click the source → **Interact**. If the
`audio` row says **live**, you are done — this is the cleanest setup, and the
HUD never appears on the stream because you are capturing the page, not the
window.

If the `audio` row says **synthetic — mic permission denied**, your OBS build
does not grant microphone access to browser sources. Use option B instead.

### Option B — Window Capture (always works)

1. Keep `broadcast.html` open in a real browser window, mic allowed
   (Part 1). Make it fullscreen (`F11`).
2. In OBS add **Window Capture** (Windows/Linux) or **macOS Screen Capture →
   Window** (macOS), and pick the browser window.
3. Untick **Capture Cursor**.
4. macOS will ask for Screen Recording permission — grant it in System
   Settings → Privacy & Security → Screen Recording, then restart OBS.

With this option the HUD *is* on the stream, so let it fade (six seconds of
not touching the mouse) or press `h` before you go live.

### Then, for either option — the sound

The browser page produces no audio, so YouTube needs the microphone from OBS
directly:

1. Sources → **+** → **Audio Input Capture**, name it `mic`.
2. Device: your microphone or audio interface.
3. In the **Audio Mixer** panel, click the gear next to `mic` → **Filters** and
   consider adding nothing at all to start. Compression and noise gates
   flatter speech and hurt piano.
4. Check the meter moves when you play, and that it peaks around **-12 to -6
   dB**, not at 0.

If you see a **Desktop Audio** channel in the mixer, mute it. It would only
add room noise or system sounds.

---

## Part 4 — connect OBS to YouTube

The recommended path. It gives you 1080p instead of the webcam flow's 720p and
has one less moving part.

1. In YouTube: **Create → Go Live → Stream** (left tab).
2. Set the title, set visibility to **Unlisted** for your first run.
3. Copy the **Stream key**.
4. In OBS: **Settings → Stream**. Service `YouTube - RTMPS`. Click **Use Stream
   Key** and paste it. Apply.
5. **Settings → Output**: Output Mode `Simple`, Video Bitrate `4500` Kbps,
   Encoder — pick the hardware one if offered (`NVENC`, `QuickSync`,
   `Apple VT`), otherwise `x264`. Audio Bitrate `160`.
6. Click **Start Streaming** in OBS.
7. Back in YouTube, the preview appears after 10–30 seconds. When it says the
   stream health is good, click **Go Live**.

### If you specifically want the webcam flow instead

You asked about feeding the eye in as a webcam, and that does work — a web page
cannot register itself as a camera device, but OBS can do it for you:

1. In OBS's **Controls** panel, click **Start Virtual Camera**.
   - On **Linux** this needs a kernel module first:
     ```sh
     sudo apt install v4l2loopback-dkms
     sudo modprobe v4l2loopback
     ```
   - On **macOS** and **Windows** it is built in, no extra install.
2. In YouTube: **Create → Go Live → Webcam**.
3. In the camera dropdown pick **OBS Virtual Camera**. In the microphone
   dropdown pick your real microphone.
4. Go live.

This caps at 720p and gives you fewer controls, which is why the stream-key
path above is the recommendation. Everything else is identical.

---

## Part 5 — the going-live routine

Once the setup above is done, every session is this:

1. Start the file server (`npx --yes serve portal --listen 8000` from the project
   folder) and leave its window open.
2. Open `broadcast.html?topic=...` on the desktop, click once to arm, check the
   HUD says `audio: live`.
3. Open `control.html?topic=...` on the phone, check it says `control ok`.
4. Open OBS. Check the mic meter moves and the eye preview looks right.
5. Start Streaming in OBS, then Go Live in YouTube.
6. **Tap wake on the phone** — the eye opens on stream. This is the moment the
   whole thing is built around, so let the stream be running before you do it.
7. Play. Change moods from the phone whenever the music changes.
8. **Tap seal** when you finish. Watch it drowse shut.
9. Stop Streaming in OBS. End the stream in YouTube.

Leave a beat between going live and tapping wake, and between sealing and
stopping the stream. The ceremony is the point; do not cut it off.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| HUD says `audio: synthetic — mic permission denied` | Browser or OBS refused the mic | Reload and allow the prompt. In OBS Browser Source, switch to Window Capture (Part 3 option B) |
| HUD says `audio: synthetic — mic unavailable` | No input device found, or you opened the page with `file://` | Serve it over `http://localhost` (Part 0.1) and check the device exists in your OS sound settings |
| HUD says `control: reconnecting` | ntfy.sh unreachable, or a typo in the topic | Check the topic matches on both devices *exactly*. Check the machine is online |
| Phone taps do nothing | The two URLs have different topics | They must match character for character. Re-check both bookmarks |
| Phone says `control down` | Same as above, or ntfy is having an outage | The HUD's wake/seal buttons on the desktop still work as a fallback |
| Eye never opens after tapping wake | Nothing is wrong for the first ~3 seconds | It needs two ticks then a 2.6s ceremony. Give it 5 seconds |
| HUD says `render: canvas2d` | This machine's WebGL is unavailable or blacklisted | It still works, the field is just simpler. Try enabling hardware acceleration in the browser |
| Visuals barely move while playing | Mic level too low | Raise input gain in your OS sound settings until the HUD bar sits around half |
| Visuals move but YouTube has no sound | You added the eye but not the Audio Input Capture | Part 3, "Then, for either option — the sound" |
| YouTube sound is doubled or echoing | You have both Audio Input Capture and Desktop Audio on | Mute Desktop Audio in the OBS mixer |
| HUD is visible on the stream | You are using Window Capture | Stop touching the mouse for six seconds, or press `h`, or add `&hud=0` to the URL |
| Everything works but the stream is choppy | Bitrate or encoder | Drop to 30fps if you have not, and try a hardware encoder in Settings → Output |

---

## What it costs

| Item | Cost |
|---|---|
| OBS Studio | $0 |
| ntfy.sh relay | $0 |
| YouTube | $0 |
| Serving the files locally | $0 |
| Cloudflare Pages, if you deploy (optional) | $0 |

**Total: $0/month.** The broadcast build needs no VPS and no Icecast — that
whole side of the project (M2, ~$5/mo) is only for the website version. If you
ever run both, they share one control page and one set of moods.

---

## One thing worth deciding on purpose

The website is deliberately ephemeral: no schedule, no archive, no accounts,
no comments. PLAN.md §1 calls it "a place, not a product."

YouTube is the opposite by default. It keeps a VOD of every stream, shows a
subscriber count, opens a comment section, and puts your set in a
recommendation algorithm. None of that is a technical problem and none of it
is reversible by a config flag.

You can turn most of it down — set streams to Unlisted, disable comments in
YouTube Studio, and delete the VOD after each session — but it is a choice you
have to keep making, not one you make once. Worth knowing before the first
stream rather than after the fifth.
