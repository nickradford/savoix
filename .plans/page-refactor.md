# Page Refactoring Plan

## Overview

Break up monolithic page files (`Index.tsx`, `ProjectWorkspace.tsx`) into smaller, interoperable logical components.

## Progress - ALL COMPLETE

### Hooks Created

- [x] `client/hooks/useRecordingManager.ts` - Recording logic (start/stop/playback)
- [x] `client/hooks/useProjectDataFetcher.ts` - Single project data fetching
- [x] `client/hooks/useProjectsList.ts` - List of projects with CRUD operations
- [x] `client/hooks/useTakeManager.ts` - Take management (delete, restore, retry transcription)

### Components Created

- [x] `client/components/ui/ProjectCard.tsx` - Project card for grid display
- [x] `client/components/ui/ProjectForm.tsx` - Reusable project creation form
- [x] `client/components/ui/TakeCard.tsx` - Individual take display with controls
- [x] `client/components/ScriptEditorArea.tsx` - Script editing textarea with header
- [x] `client/components/SegmentList.tsx` - Segment navigation list

### Pages Refactored

- [x] `client/pages/Index.tsx` - Uses `useProjectsList` hook and `ProjectForm` component
- [x] `client/pages/ProjectWorkspace.tsx` - Uses `useTakeManager`, `ScriptEditorArea`, `SegmentItem`, `TakeCard`

### Architecture Summary

```
client/
├── hooks/
│   ├── useProjectDataFetcher.ts  # Single project data
│   ├── useProjectsList.ts        # Project list + CRUD
│   ├── useRecordingManager.ts    # Recording controls
│   └── useTakeManager.ts         # Take CRUD operations
├── components/
│   ├── ui/
│   │   ├── ProjectCard.tsx       # Grid item for projects
│   │   ├── ProjectForm.tsx       # Creation form
│   │   └── TakeCard.tsx          # Take display + controls
│   ├── ScriptEditorArea.tsx       # Script editing UI
│   └── SegmentList.tsx           # Segment navigation
└── pages/
    ├── Index.tsx                  # Dashboard (orchestrator)
    └── ProjectWorkspace.tsx       # Workspace (orchestrator)
```
