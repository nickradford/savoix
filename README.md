# Savoix

A script recording and transcription application designed for precise dialogue review. Record audio takes, transcribe them automatically, and compare the spoken content against the original script to identify discrepancies.

## Features

- **Script Segmentation**: Automatically breaks scripts into line-by-line segments for organized recording
- **Multiple Takes**: Record and manage multiple takes per segment
- **Automated Transcription**: Integrates with Parakeet for speech-to-text conversion
- **Synchronized Playback**: Audio playback with synchronized transcript rendering
- **Discrepancy Detection**: Highlights omissions, insertions, and contraction mismatches
- **Stable Take Management**: Maintains consistent take numbering across segments, with soft-delete support

## Technology Stack

- **Frontend**: React 18, React Router, TypeScript, Vite
- **Backend**: Express.js
- **Database**: SQLite with Drizzle ORM
- **Styling**: Tailwind CSS, Radix UI
- **Testing**: Vitest

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (with pnpm)
- [FFMPEG](https://ffmpeg.org/) - Required for audio export functionality
- [Parakeet](https://github.com/yashhere/parakeet-mlx-fastapi) transcription server

### Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Start the Parakeet transcription server:

```bash
uv tool install git+https://github.com/yashhere/parakeet-mlx-fastapi.git
parakeet-server --model mlx-community/parakeet-tdt-0.6b-v3 --port 8765
```

The application expects Parakeet at `http://localhost:8765` by default. To use a different endpoint, set `PARAKEET_ENDPOINT` in your `.env` file.

4. Start the development server:

```bash
pnpm dev
```

The application will be available at [http://localhost:8080](http://localhost:8080).

## Available Scripts

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `pnpm dev`       | Start development server     |
| `pnpm build`     | Build for production         |
| `pnpm start`     | Start production server      |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test`      | Run test suite               |

## Data Storage

- **Recordings**: Audio files are stored locally in the `recordings/` directory
- **Database**: Application data is persisted in `data/app.db`
- **Take Deletion**: Uses soft-delete mechanism to preserve take numbering and history
