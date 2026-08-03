# music-is-magic

## Two builds, two branches — read before touching branches

There are two builds sharing one engine (see README.md), and they live on two
branches on purpose:

- **`claude/youtube-desktop-eye-streaming-go1do0`** — the broadcast: the
  website *plus* `portal/broadcast.html`, for streaming to YouTube from a
  desktop. **This is the active branch. Work lands here.**
- **`claude/discussion-next-steps-cshpet`** — the website alone.
  `portal/broadcast.html` does not exist on it. It is a frozen reference copy,
  kept so that TESTING.md's "compare against the original website" check works.

**Do not advance the website branch to match the broadcast branch.** Making
them identical silently destroys the reference point, and TESTING.md's
light-switch instructions keep claiming to work while doing nothing.

**Do not delete or rename either branch.** Both names are hardcoded in setup
instructions the user follows on a fresh machine — `RUNNING.md` (the clone
command) and `TESTING.md` (clone, troubleshooting table, and the comparison
step). Renaming means editing those files in the same commit.

There is no `main`, and one is not wanted.

## Landing work

Claude Code web sessions are each assigned their own `claude/*` working branch
by the harness. That branch is scratch space. Before the session ends, land the
work on the broadcast branch above so a plain `git pull` picks it up — don't
leave commits stranded on a session branch.

### Standing instruction: commit and push without being asked

The owner's words, 2026-08-03: *"do it automatically from now on? I trust you
over myself with git."* So don't ask. When a piece of work is finished and
`npm test` passes, commit it and push it — session branch **and** the broadcast
branch — as part of finishing, not as a separate thing to be granted permission
for. Leaving work uncommitted in a container that gets reclaimed is the failure
mode this exists to prevent.

Finished means tested, not merely written. A red suite is a reason to keep
working, not a reason to ask whether to push.

Three things this does NOT authorise, because they are unrecoverable and the
trust is about diligence rather than reach:

- **Never push `claude/discussion-next-steps-cshpet`.** Frozen reference; it
  has been destroyed by accident once. Nothing lands there, ever.
- **Never force-push a shared branch.** Fast-forward only. If a push is
  rejected as non-fast-forward, something else moved and that is worth
  understanding, not overwriting.
- **Never open a pull request, delete or rename a branch, or change the
  default branch unasked.** Those are outward-facing or irreversible; the
  standing permission covers commit and push.

## Layout

- `portal/` — both builds; `index.html` is the website, `broadcast.html` is the
  broadcast, and they share `js/`. A change under `js/` affects both — check
  both before calling it done.
- `server/` — Icecast / Liquidsoap / Caddy templates for the website's stream
- `tools/` — validation and headless checks (`npm test`)
- `tools/prototypes/` — exploratory, **loaded by neither build**. Read its
  README before touching anything in it.
- `PLAN.md` — the standing work list
- `HANDOFF.md` — start here in a fresh session: where the work stands, what is
  carried over, and the traps that have already cost time
- `MOODS.md` — per-mood reference notes and how to read the owner's references
- `RUNNING.md` / `TESTING.md` — how to run and how to check

No build step: the portal is static files, so changes need a hard reload
(`Ctrl+Shift+R`) to show up, and OBS Browser Sources need "Refresh cache of
current page".
