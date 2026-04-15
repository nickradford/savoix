/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Transcription request/response types
 */
export interface TranscriptionRequest {
  audioUrl?: string;
  audioBase64?: string;
}

export interface TranscriptionResponse {
  text: string;
  confidence?: number;
  duration?: number;
  error?: string;
  recordingId?: string;
  recordingPath?: string;
}

/**
 * Recording take for a script segment
 */
export interface SegmentTake {
  id: string;
  segmentId: string;
  projectId: string;
  recordingId: string;
  recordingPath: string;
  takeNumber?: number;
  transcription?: string;
  confidence?: number;
  words?: string;
  segments?: string;
  audioDuration?: number;
  duration: number;
  isSelected?: boolean;
  createdAt: string;
  deletedAt?: string | null;
  transcriptionError?: string;
}

/**
 * Script segment - each line of the script is a segment
 */
export interface ScriptSegment {
  id: string;
  projectId: string;
  index: number;
  text: string;
  takes: SegmentTake[];
}

/**
 * Legacy Segment types for audio labeling (keeping for backwards compatibility)
 */
export interface Segment {
  id: string;
  projectId: string;
  startTime: number;
  endTime: number;
  label: string;
  color?: string;
  recordingId?: string;
}

export interface SegmentsResponse {
  segments: Segment[];
  error?: string;
}

export interface SaveSegmentRequest {
  projectId: string;
  segment: Omit<Segment, "projectId">;
}

/**
 * Project with script segments
 */
export interface ProjectWithSegments {
  id: string;
  name: string;
  description: string;
  script: string;
  segments: ScriptSegment[];
  createdAt: string;
}
