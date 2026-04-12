# transcript-recorder

`transcript-recorder` is a small app for recording script takes, transcribing them, and ruthlessly comparing what was said against what was supposed to be said.

It is part recorder, part transcript QA tool, part polite little machine for noticing when you said "I'm" and your script said "I am".

## What it does

- Breaks a script into line-by-line segments
- Records multiple takes for each segment
- Transcribes takes with Parakeet
- Plays back takes with synced transcript rendering
- Highlights likely misses, insertions, and contraction mismatches
- Keeps stable take numbers per segment, even when takes are soft-deleted

## Stack

- React 18 + React Router + TypeScript
- Vite
- Express
- SQLite + Drizzle
- Tailwind + Radix
- Vitest

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy env vars if needed:

```bash
cp .env.example .env
```

3. Start the Parakeet server:

```bash
uv tool install git+https://github.com/yashhere/parakeet-mlx-fastapi.git
parakeet-server --model mlx-community/parakeet-tdt-0.6b-v3 --port 8765
```

By default the app expects Parakeet at `http://localhost:8765`. If you want to point somewhere else, set `PARAKEET_ENDPOINT` in `.env`.

4. Start the app:

```bash
pnpm dev
```

The app runs on [http://localhost:8080](http://localhost:8080).

## Useful commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm test
```

## Notes

- Recordings are stored locally in `recordings/`.
- App data lives in `data/app.db`.
- Take deletion is soft delete, so the app keeps numbering/history intact.

## Current vibe

If the transcript is clean, confidence goes up.

If the transcript gets creative, the UI gets judgmental.
