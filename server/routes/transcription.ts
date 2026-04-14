import { RequestHandler } from "express";
import { db } from "../db";
import { scriptSegments, segmentTakes } from "../schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import { calculateDiffConfidence } from "../../shared/confidence";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(__dirname, "../../recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

/**
 * Transcribes audio using Parakeet server
 * Returns transcription text and word timing data
 */
interface TranscriptionResult {
  text?: string;
  words?: string;
  segments?: string;
  audioDuration?: number;
  error?: string;
}

function resolveTakeDurationMs(
  fallbackDurationMs: number,
  audioDurationSeconds?: number,
): number {
  if (
    typeof audioDurationSeconds === "number" &&
    Number.isFinite(audioDurationSeconds) &&
    audioDurationSeconds > 0
  ) {
    return Math.round(audioDurationSeconds * 1000);
  }

  return fallbackDurationMs;
}

async function getNextTakeNumber(segmentId: string): Promise<number> {
  const existingTakes = await db.query.segmentTakes.findMany({
    where: eq(segmentTakes.segmentId, segmentId),
    columns: {
      takeNumber: true,
    },
  });

  const maxTakeNumber = existingTakes.reduce(
    (currentMax, take) => Math.max(currentMax, take.takeNumber ?? 0),
    0,
  );

  return maxTakeNumber + 1;
}

async function transcribeAudio(
  audioBuffer: Buffer,
  recordingId: string,
): Promise<TranscriptionResult> {
  const parakeetBaseUrl =
    process.env.PARAKEET_ENDPOINT || "http://localhost:8765";
  const endpointUrl = `${parakeetBaseUrl}/audio/transcriptions`;

  try {
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: `${recordingId}.wav`,
      contentType: "audio/wav",
    });
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities", "word");
    formData.append("timestamp_granularities", "segment");

    const body = formData.getBuffer();
    const headers = formData.getHeaders();

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: body as unknown as BodyInit,
    });

    if (response.ok) {
      const data = await response.json();
      return {
        text: data.text || "",
        words: data.words ? JSON.stringify(data.words) : undefined,
        segments: data.segments ? JSON.stringify(data.segments) : undefined,
        audioDuration: data.duration ?? undefined,
      };
    } else {
      const errorText = await response.text();
      return { error: `Parakeet error: ${errorText}` };
    }
  } catch (error) {
    return {
      error: `Transcription request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Records a take for a segment
 * Always saves the audio file and creates a take record
 * Attempts transcription but doesn't fail if it doesn't work
 */
export const recordSegmentTake: RequestHandler = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { audioBase64, audioUrl, duration = 0 } = req.body;

    // Validate input
    if (!audioBase64 && !audioUrl) {
      return res.status(400).json({ error: "Audio data is required" });
    }

    // Get segment info
    const segment = await db.query.scriptSegments.findFirst({
      where: eq(scriptSegments.id, segmentId),
    });

    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    // Generate unique filename for the recording
    const timestamp = Date.now();
    const recordingId = `recording_${timestamp}`;
    const audioFilePath = path.join(RECORDINGS_DIR, `${recordingId}.wav`);

    let audioBuffer: Buffer;

    // Handle audio input
    if (audioBase64) {
      const base64Data = audioBase64.replace(/^data:audio\/[^;]+;base64,/, "");
      audioBuffer = Buffer.from(base64Data, "base64");
    } else if (audioUrl) {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        return res
          .status(400)
          .json({ error: "Failed to fetch audio from URL" });
      }
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      return res.status(400).json({ error: "No audio data provided" });
    }

    // Save audio file
    fs.writeFileSync(audioFilePath, audioBuffer);
    console.log(`Audio saved to: ${audioFilePath}`);

    // Try to transcribe
    const transcriptionResult = await transcribeAudio(audioBuffer, recordingId);
    const resolvedDuration = resolveTakeDurationMs(
      duration,
      transcriptionResult.audioDuration,
    );
    const takeNumber = await getNextTakeNumber(segmentId);

    // Calculate diff confidence using heuristic comparing expected script to transcription
    const diffConfidence = calculateDiffConfidence(
      segment.text,
      transcriptionResult.text,
    );

    // Create take record (always saved regardless of transcription success)
    const takeId = randomUUID();
    await db.insert(segmentTakes).values({
      id: takeId,
      segmentId,
      projectId: segment.projectId,
      recordingId,
      recordingPath: audioFilePath,
      transcription: transcriptionResult.text,
      confidence: diffConfidence,
      words: transcriptionResult.words,
      segments: transcriptionResult.segments,
      audioDuration: transcriptionResult.audioDuration,
      takeNumber,
      duration: resolvedDuration,
    });

    // Return the created take
    const take = await db.query.segmentTakes.findFirst({
      where: eq(segmentTakes.id, takeId),
    });

    res.status(201).json({
      ...take,
      transcriptionError: transcriptionResult.error,
    });
  } catch (error) {
    console.error("Error recording segment take:", error);
    res.status(500).json({
      error: `Failed to record take: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

/**
 * @deprecated Legacy handler that expects transcription to happen first
 * Kept for backwards compatibility
 */
export const handleTranscription: RequestHandler = async (_req, res) => {
  // This is now handled by recordSegmentTake
  res.status(200).json({ text: "Use recordSegmentTake directly" });
};
