#!/bin/sh
# D13 — Icecast on-disconnect hook for /live. Replace CHANGE_ME_TOPIC.
curl -s -m 10 \
  -H "Title: the eye closes" \
  -H "Tags: crescent_moon" \
  -d "stream ended" \
  "https://ntfy.sh/CHANGE_ME_TOPIC" >/dev/null 2>&1 &
exit 0
