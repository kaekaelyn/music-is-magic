# Music Is Magic

An audio-only livestream site. Dormant, it is a closed eye; live, the eye
opens and a nature-themed visualization breathes with improvised music.

There are two builds, sharing one engine:

- **the website** — `portal/index.html`, for visitors, fed by an Icecast stream.
- **the broadcast** — `portal/broadcast.html`, for streaming to YouTube from a
  desktop: the microphone drives the visuals, and a phone drives the moods.

Everything — vision, architecture, contracts, milestones — lives in
[PLAN.md](PLAN.md). Read that first.

**Never run this before?** Start at
[TESTING.md Stage 0](TESTING.md#stage-0--get-the-project-onto-your-computer) —
it begins at downloading the project and assumes nothing is installed.

To run the broadcast: [RUNNING.md](RUNNING.md).
To check any of it works: [TESTING.md](TESTING.md).

To see it locally: serve `portal/` with any static server (e.g.
`python3 -m http.server -d portal`) and open it — that's the sealed eye.
Add `?mock=live` to watch it wake.

To check it still works:

```sh
node tools/validate-assets.mjs        # asset contracts, zero dependencies
cd tools && npm install && npm test   # + headless run of both ceremonies
```
