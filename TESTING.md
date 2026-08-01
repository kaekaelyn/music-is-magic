# Testing guide

How to check each piece works, in the order it becomes checkable. Every stage
is self-contained: run it, compare against "what you should see", and if it
does not match, the fix is listed right there.

Work top to bottom the first time. After that, jump to whichever stage covers
what you changed.

For running it live once these all pass, see [RUNNING.md](RUNNING.md).

---

## Where the project is right now

| Piece | State | Tested by |
|---|---|---|
| Website eye, themes, viz engine | done, unchanged | Stage 1, Stage 2 |
| Broadcast page (`broadcast.html`) | done | Stage 1, Stage 3 |
| Microphone drives the visuals | done | Stage 4 |
| Phone control relay (ntfy) | done | Stage 5, Stage 6 |
| Wake / seal ceremony from the phone | done | Stage 5, Stage 6 |
| OBS capture | needs your machine | Stage 7 |
| YouTube | needs your account | Stage 8 |
| Real art (textures, eye layers) | not started — M5 | `npm run shots` |

Stages 1–6 you can do entirely on your own computer with nothing installed but
Node. Stages 7–9 need OBS and a YouTube account.

---

## Stage 0 — get the project onto your computer

**Start here even if that seems obvious.** Every command in this file assumes
the project's files already exist on your machine. Making an empty folder is
not enough — the files have to be downloaded into it.

### 0.1 — install git, if you do not have it

Type `git --version`. If you get a version number, skip ahead.

- **Windows**: download and run the installer from
  [git-scm.com/download/win](https://git-scm.com/download/win). Accept every
  default. Then **close and reopen** your terminal.
- **macOS**: `xcode-select --install`, or `brew install git`.
- **Linux**: `sudo apt install git`.

### 0.2 — download the project

Pick the folder you want it to live in, then run **one** command. It creates
the project folder for you — do **not** make the folder yourself first, and do
not run this inside a folder you already made.

**Windows** (Command Prompt):

```
cd C:\
git clone --branch claude/youtube-desktop-eye-streaming-go1do0 https://github.com/kaekaelyn/music-is-magic.git musicismagic
```

**macOS / Linux:**

```sh
cd ~
git clone --branch claude/youtube-desktop-eye-streaming-go1do0 https://github.com/kaekaelyn/music-is-magic.git music-is-magic
```

The `--branch` part matters: it puts you on the broadcast version rather than
the website-only one. The repository is public, so **no sign-in is needed** —
if something asks you to log in, you have mistyped the URL.

**Check it worked.** Run `dir C:\musicismagic` (Windows) or
`ls ~/music-is-magic` (macOS/Linux). You should see:

```
PLAN.md   README.md   RUNNING.md   TESTING.md   portal   server   tools
```

If you see those seven things, you are done with the hard part.

| If | Then |
|---|---|
| `fatal: destination path already exists and is not an empty directory` | You made the folder first. Delete it and re-run the clone. On Windows you must `cd C:\` **before** `rmdir /s /q C:\musicismagic`, because Windows cannot delete the folder your terminal is currently sitting in. On macOS/Linux, `rm -rf ~/music-is-magic` |
| `The process cannot access the file because it is being used by another process` | Something is holding that folder. `cd C:\` first, close any other terminal or Explorer window showing it, then retry the `rmdir`. Still stuck? Skip the delete entirely — clone under a different name (`... music-is-magic.git mim` gives you `C:\mim`) and use that path everywhere instead |
| `fatal: not a git repository` | You are running git in a folder that has no project in it. Do 0.2 above |
| `'git' is not recognized` | Git is not installed, or you did not reopen the terminal after installing it. See 0.1 |
| It asks for a username and password | The repository is public and needs neither. Check the URL for a typo — it is `https://github.com/kaekaelyn/music-is-magic.git` |
| `Remote branch ... not found in upstream origin` | The `--branch` value is mistyped. It is `claude/youtube-desktop-eye-streaming-go1do0` |

> **From here on**, wherever this file says `cd music-is-magic`, Windows users
> should type `cd C:\musicismagic`.

### 0.3 — install Node.js

You need **Node.js 18 or newer**. Check:

```sh
node --version
```

Nothing, or a number below 18? Install the **LTS** build from
[nodejs.org](https://nodejs.org/), or:

```sh
# macOS
brew install node
# Debian / Ubuntu
sudo apt install nodejs npm
```

On Windows, **close and reopen your terminal** after installing, or `node`
will still look missing.

### 0.4 — install the test tooling

Once only. This installs into `tools/` and nowhere else — the portal itself
has no dependencies and never will:

```sh
cd music-is-magic/tools      # Windows: cd C:\musicismagic\tools
npm install
npx playwright install chromium
```

`npm install` should print something like `added 3 packages`. If it instead
says **`ENOENT: no such file or directory, open '...\tools\package.json'`**,
you are in a folder that is not the real `tools` folder — go back to 0.2.

`npx playwright install chromium` downloads a headless browser (~150 MB) used
only by the automated tests. If your machine already has a Chromium you would
rather use, point at it instead and skip the download:

```sh
export MIM_CHROMIUM=/path/to/chromium        # macOS / Linux
set MIM_CHROMIUM=C:\path\to\chrome.exe       # Windows
```

> **In a hurry?** You can skip 0.4 entirely and jump to
> [Stage 3](#stage-3--the-broadcast-eye-alone) to just *look* at the eye. Only
> Stage 1 needs Playwright.

---

## Stage 1 — the automated suite

**Run:**

```sh
cd music-is-magic/tools
npm test
```

**What you should see** — three sections, ending in:

```
assets ok — 8 theme(s), 1 warning(s)

34/34 checks passed      ← the website
33/33 checks passed      ← the broadcast
```

The one warning is expected and correct: it says the eye manifest declares no
image layers, so the procedural stone eye renders. That stays until you drop
real art in (M5).

**What the three parts prove:**

| Command | Proves |
|---|---|
| `npm run validate` | Every `theme.json` parses, every declared texture exists, the eye manifest is well-formed. Zero dependencies — runs even without Playwright |
| `npm run smoke` | The website: full ceremony sealed → stirring → open → communing, theme morph, drowse-and-resume, WebGL context loss recovery, reduced motion, control page. **This is your regression guard — if it drops below 34 the website broke** |
| `npm run smoke:broadcast` | The broadcast build: relay-driven ceremony, auto-commune with no visitor, junk-message rejection, control page → broadcast page end to end, 16:9 scaling, mic-denied fallback |

**If it fails:**

- `playwright is not installed` → you skipped `npm install` in Stage 0.
- A browser launch error → run `npx playwright install chromium`.
- One or two timeouts on a slow or loaded machine → run it again before
  believing it. The ceremony has real 2.6-second waits in it.
- Anything reproducible → the failing line names the check. That name is the
  behavior that broke.

**Run this before every commit.** It is fast and it fails loudly.

---

## Stage 2 — the website still works (eyes on it)

Automated tests prove behavior, not beauty. Look at it too.

**Run** one of these, whichever suits your machine:

```sh
# Anywhere Node is installed (including Windows) — no Python needed
cd music-is-magic                 # Windows: cd C:\musicismagic
npx --yes serve portal --listen 8000
```

```sh
# macOS / Linux, if you prefer Python
cd music-is-magic
python3 -m http.server -d portal 8000
```

It prints a box with two addresses — **Local:** (this machine) and
**Network:** (what your phone will use in Stage 6). Note the Network one down.

Two things that look wrong and are not:

- **Your prompt does not come back.** The window is busy being the server now.
  That is correct — leave it alone, and open a second terminal if you need one.
- **Windows may ask to allow Node.js through the firewall.** Tick **Private
  networks** and Allow. Stage 6 needs it; Stages 2–5 do not.

**Leave that window open** — closing it stops the server and the page goes
blank. To stop it deliberately, click the window and press `Ctrl+C`.

| If | Then |
|---|---|
| `Path must be a string. Received undefined` | The `--listen` argument did not parse. Nearly always a mistyped flag — if you shortened it to `-l`, check you used a lowercase **L** and not the digit **1**. Safest is to spell out `--listen` |
| `EADDRINUSE` / `address already in use` | Port 8000 is taken, usually by a server you already left running. Close that window, or pick another port (`--listen 8010`) and use it in the URLs too |
| `'npx' is not recognized` | Node is not installed, or the terminal predates the install. See 0.3 and reopen the terminal |

Open **http://localhost:8000/** — sealed stone eye, a slow ember in the seam,
nothing clickable.

Open **http://localhost:8000/?mock=live** — the stone parts over ~3 seconds.
Click it. The field blooms and moves.

Try **`?mock=live&theme=cave`**, then `ice`, `rain`, `sunshine`, `forest`,
`mountain`, `ocean`. Each should look like a different *place*, not the same
fog in a new color.

**If the site looks broken:** you have changed something shared. Compare
against the original website, which is a separate branch and always one
command away:

```sh
git checkout claude/discussion-next-steps-cshpet   # the original website
# ...look at it...
git checkout claude/youtube-desktop-eye-streaming-go1do0   # come back
```

Those two commands are a light switch — flip it as often as you like. Neither
one deletes anything. (If git refuses because you have edited files, run
`git stash` first to park your edits, and `git stash pop` to get them back.)

---

## Stage 3 — the broadcast eye, alone

No microphone, no phone, no OBS. Just: does the page render and does the
ceremony run?

**Run:** with the server from Stage 2 still going, open

```
http://localhost:8000/broadcast.html?nomic=1&relay=local
```

**What you should see:**

- A sealed stone eye, noticeably **larger** than on the website — it is sized
  for a 16:9 frame.
- A corner HUD reading `eye: sealed`, `audio: synthetic (?nomic=1)`,
  `control: local`, `render: webgl`.
- No "click to arm" gate — `?nomic=1` skips it.

**Click `wake` in the HUD.** Within about a second the stone begins to part,
takes ~2.6 seconds, and the field appears — moving gently on synthetic
features. The HUD should reach `eye: communing` **without stopping at `open`**
(there is no visitor to click, so the page communes for itself).

**Click `seal`.** The aperture narrows over ~12 seconds, then `eye: sealed`.

**Stop moving the mouse for six seconds.** The HUD fades out and the cursor
disappears. Move the mouse — it comes back. Press `h` — it toggles.

**Also check the clean frame:** open
`broadcast.html?nomic=1&relay=local&hud=0` — no HUD at all, ever.

| If | Then |
|---|---|
| `render: canvas2d` | WebGL is off on this machine. It still works, the field is just simpler. Enable hardware acceleration in your browser settings |
| The eye is the same size as the website's | The `radius` option is not reaching `createEye` — Stage 1's "broadcast eye is scaled up" check should have caught this |
| Nothing happens on `wake` | Open the browser console (F12). Any error there is a real bug |

---

## Stage 4 — the microphone drives the visuals

**Run:** drop the `?nomic=1`:

```
http://localhost:8000/broadcast.html?relay=local
```

**What you should see:**

1. A full-frame **"click to arm"** panel. Click it.
2. A browser microphone prompt. Allow it.
3. HUD `audio:` turns green and reads **live**.
4. A device dropdown appears in the HUD if you have more than one input.

**Now test it properly — play, don't talk.** Speech and music stress different
things.

- Play something quiet and sustained. The thin bar under the HUD rows should
  sit low but move.
- Play something loud. The bar should approach but not pin at the right edge.
- Click `wake`, then play. The field inside the aperture should visibly answer
  the music — brightening on attacks, shifting with register.

**Check the levels.** If the bar barely leaves zero when you play normally,
raise your input gain in your OS sound settings. The visuals read loudness, so
a quiet input makes a dull eye.

**Check the device picker** if you have an audio interface: select it, and the
bar should keep working. Unplug it mid-test — the HUD should say `device lost
— retrying` rather than silently falling back to the laptop mic.

| If | Then |
|---|---|
| `audio: synthetic — mic permission denied` | You dismissed the prompt. Reload. In Chrome, click the icon at the left of the address bar to reset the permission |
| `audio: synthetic — mic unavailable` | Either no input device, or you opened the file with `file://`. It **must** be `http://localhost` |
| The bar moves but the eye does not react | Make sure the eye is `communing`, not `open` — the field only follows audio once communing |

---

## Stage 5 — the relay, on one machine

Before involving your phone, prove the control channel works with two browser
tabs. This uses the `local` relay — no internet, no ntfy, no topic.

**Run:** two tabs, same browser:

```
Tab 1:  http://localhost:8000/broadcast.html?nomic=1&relay=local
Tab 2:  http://localhost:8000/control.html?relay=local
```

**In tab 2 you should see** a `wake`/`seal` pair above the mood grid. (On the
plain website control page, with no relay, that pair is absent entirely —
check that too by opening `control.html` with no `?relay=`.)

**Test the round trip:**

1. Tab 2 → tap **wake**. Switch to tab 1: the ceremony is running.
2. Tab 2 → tap **cave**. Tab 1 morphs to cave, and the `cave` button in tab 2
   gets an outline showing it is current.
3. Tab 2 → tap **seal**. Tab 1 drowses shut.

Put the two windows side by side to watch it happen live — this is the moment
that tells you the whole design works.

| If | Then |
|---|---|
| No wake/seal buttons in tab 2 | You left off `?relay=local` |
| Taps do nothing | Both tabs must be the same browser and the same origin (`localhost:8000` in both, not `127.0.0.1` in one) |

---

## Stage 6 — the relay, phone to desktop

Now the real transport. This is the first stage that needs the internet.

**Set up:** invent a topic (see RUNNING.md Part 0.2 for a generator) — for
testing, anything unguessable works, e.g. `mim-test-4kq9zx2`.

```
Desktop:  http://localhost:8000/broadcast.html?nomic=1&topic=mim-test-4kq9zx2
Phone:    http://<your-lan-ip>:8000/control.html?topic=mim-test-4kq9zx2
```

**You already have your LAN address**, if you started the server with
`npx serve` — it printed a **Network:** line next to the Local: one. That is
the phone's URL. Otherwise: `ipconfig getifaddr en0` (macOS),
`hostname -I | awk '{print $1}'` (Linux), `ipconfig` (Windows).

The phone must be on the **same WiFi**, not cell data.

> **Windows: the firewall will block this** unless you let it through. The
> first time the server starts, Windows pops up "Allow Node.js to communicate
> on these networks" — tick **Private networks** and Allow. If you dismissed
> that box, the phone page will simply never load: search Start for "Windows
> Defender Firewall" → "Allow an app through firewall" → find Node.js → tick
> **Private**.

**What you should see:**

- Desktop HUD `control:` reads **subscribed** in green.
- Phone status line ends in **· control ok**.
- Tapping wake on the phone opens the eye on the desktop within a second or
  two.
- Tapping a mood on the phone morphs the desktop.

**Test the failure modes too — these matter live:**

1. **Turn the desktop's WiFi off for ten seconds, then back on.** The HUD
   should go `reconnecting` and then return to `subscribed` on its own. The eye
   should not change state.
2. **Reload the desktop page while the eye is open.** It should come back and
   re-open within a couple of seconds — recent messages are replayed.
3. **Reload it again tomorrow.** It should come back **sealed**, not open. Old
   messages must not resurrect a finished session.
4. **Mistype the topic on the phone** by one character. Nothing should happen
   on the desktop. That is the security model working.

| If | Then |
|---|---|
| `control: reconnecting` and it stays there | Topic mismatch, or no internet. Compare both URLs character by character |
| Works on the desktop's own HUD but not the phone | The phone is on cell data, not WiFi. Either join the WiFi or deploy the site (RUNNING.md Part 2 option B) |

---

## Stage 7 — OBS capture (recording, not streaming)

Prove the picture and sound are right *before* anyone can see them. Record to
a file instead of streaming.

**Set up** OBS as described in [RUNNING.md Part 3](RUNNING.md#part-3--get-the-eye-into-obs),
then instead of Start Streaming, click **Start Recording**.

**Record a two-minute test** that includes: the eye sealed, a wake, a minute of
playing with one mood change, and a seal.

**Then watch the file back and check:**

- [ ] The eye is centered and not cropped.
- [ ] The whole frame is 1920×1080 with no black bars beyond the intended dark
      background.
- [ ] The HUD is **not** visible (or fades within the first few seconds).
- [ ] No mouse cursor.
- [ ] Audio is present, clear, and not clipping.
- [ ] Audio and visuals are in sync — the field answers a note at the moment
      you hear it, not half a second later.
- [ ] The opening ceremony reads as deliberate, not glitchy.

That checklist is the whole broadcast. If the recording is good, the stream
will be good.

| If | Then |
|---|---|
| Video is fine, no audio | You added the eye source but not Audio Input Capture. RUNNING.md Part 3, "the sound" |
| Audio is doubled/echoing | Desktop Audio is also enabled in the OBS mixer. Mute it |
| The eye is tiny in the corner | The Browser Source is not 1920×1080, or needs right-click → Transform → Fit to screen |
| Choppy | Drop to 30 fps in Settings → Video, and use a hardware encoder |

---

## Stage 8 — a private YouTube test

**Do this once before any real stream.**

Follow [RUNNING.md Part 4](RUNNING.md#part-4--connect-obs-to-youtube), but set
the stream's visibility to **Unlisted**.

Stream for five minutes. Then:

- [ ] Open the stream on your **phone**, on cell data, not WiFi. That is the
      real viewing condition.
- [ ] Confirm YouTube reports stream health **Excellent** or **Good**.
- [ ] Confirm the audio sounds like your instrument, not like a phone call.
- [ ] Tap a mood from the control page and confirm it reaches the *YouTube*
      picture (expect 10–30 seconds of normal broadcast delay — that is
      YouTube's buffer, not a bug).
- [ ] End the stream and confirm the VOD looks right.

Then delete the test VOD if you do not want it kept.

---

## Stage 9 — for real

Use the checklist in [RUNNING.md Part 5](RUNNING.md#part-5--the-going-live-routine).

---

## Reference: every URL flag

| Flag | Page | What it does |
|---|---|---|
| `?topic=NAME` | broadcast, control | Relay topic for this load. Keeps the secret out of deployed source |
| `?relay=local` | broadcast, control | Use the same-machine relay — two tabs, no internet |
| `?relay=none` | broadcast, control | No control channel at all |
| `?nomic=1` | broadcast | Skip microphone capture, run on synthetic features. Also skips the arm gate |
| `?hud=0` | broadcast | Remove the operator HUD entirely |
| `?mock=live` | website | Pretend a source is connected |
| `?theme=cave` | website | Force a mood (mock mode only) |
| `?fast=1` | both | Short timings for automated tests (mock mode only) |
| `?stream=URL` | website | Point at a real Icecast server, persisted |
| `?stream=clear` | website | Forget that override |

## Reference: looking at every mood at once

```sh
cd music-is-magic/tools
npm run shots
```

Renders every eye state × every theme at phone size plus a contact sheet, into
`tools/shots/`. This is the loop for tuning art (M5) — procedural looks leave
nothing to inspect in the repo, so tuning without it is guessing.
