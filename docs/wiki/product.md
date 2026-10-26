# Product

_Last verified: 2026-10-26 (0.1.0)_

## The problem (real, from a working kindergarten teacher)

A גננת receives many songs in WhatsApp: voice notes recorded by colleagues and the
supervisor (מפקחת), mp3 files, YouTube links — spread over dozens of chats. They have no
names (`PTT-20251012-WA0014.opus`), can't be found again, stop playing when she leaves the
chat or the screen locks, aren't sorted by topic, and arrive in duplicate. YouTube plays ads
in front of the children.

## The promise

Any song plays within 5 seconds of her thinking of it — mid morning circle, with a child on
her lap. Measured as time from opening the app to playback (target < 5 s median).

## User

- Primary: the teacher. One phone (usually an iPhone) for work and home, a Bluetooth speaker
  in the kindergarten. Will not spend time "organizing a library".
- Secondary (v2): the assistant (סייעת), same library on her phone.

## Usage modes

| Mode | When | Needs |
|---|---|---|
| In class | morning circle, birthday, transitions | find and play one-handed, quickly |
| Preparing | evening, before a holiday | build a list for tomorrow (v2: playlists) |
| Receiving | a song arrives in WhatsApp | save now, sort later or never |
| Nap time | an hour of quiet | continuous play, screen off, fade (v2: sleep timer) |

## Behaviour (0.1.0)

- Share from WhatsApp → "שומרת…" toast → saved; processing runs in the background.
- Confident AI results (title and top category ≥ 0.85) go straight to the library; others wait
  in **לבדיקה** with the suggestion pre-selected.
- Categories: 32 defaults in 6 groups (`app/src/core/categories.ts`), a song can be in several.
- Home suggests by time of day (`hours`) and Hebrew-calendar season (`season`).
- Within a category: pinned first, then frecency (recent plays weigh more), see
  [search-and-ranking.md](search-and-ranking.md).
- YouTube links play only in the visible embedded player (labelled "יוטיוב").

## Success metrics (MVP)

| Metric | Target |
|---|---|
| Time from app open to playback | < 5 s median |
| Names and categories accepted without edits | ≥ 80% |
| Searches that end in a play within a minute | ≥ 70% |
| Teachers playing ≥ 3 days/week in week 4 | ≥ 70% of pilot |
| Songs imported in the first week | ≥ 20 per teacher |

## Out of scope for now

Library sharing between teachers (copyright: sharing commercial songs is distribution),
kids-facing mode, whole-chat ZIP import (v2), acoustic-fingerprint dedupe (v2).
