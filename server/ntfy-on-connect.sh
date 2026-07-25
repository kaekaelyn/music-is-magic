#!/bin/sh
# D13 — Icecast on-connect hook for /live. Replace CHANGE_ME_TOPIC.
curl -s -m 10 \
  -H "Title: the eye opens" \
  -H "Tags: eye" \
  -d "live now" \
  "https://ntfy.sh/CHANGE_ME_TOPIC" >/dev/null 2>&1 &
exit 0
