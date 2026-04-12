import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db } from "./db";
import { segmentTakes } from "./schema";
import { and, eq, isNull } from "drizzle-orm";
import FormData from "form-data";
import { handleDemo } from "./routes/demo";
import { recordSegmentTake } from "./routes/transcription";
import {
  getProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from "./routes/projects";
import {
  getScriptSegments,
  getSegmentTakes,
  updateScriptSegments,
} from "./routes/script-segments";
import { getSegments, saveSegment, deleteSegment } from "./routes/segments";
import { downloadProjectJSON, downloadProjectCSV } from "./routes/export";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Recordings directory
const RECORDINGS_DIR = path.join(__dirname, "../recordings");

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

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Project API
  app.get("/api/projects", getProjects);
  app.post("/api/projects", createProject);
  app.get("/api/projects/:id", getProject);
  app.patch("/api/projects/:id", updateProject);
  app.delete("/api/projects/:id", deleteProject);

  // Script Segments API
  app.get("/api/projects/:projectId/segments", getScriptSegments);
  app.post("/api/projects/:projectId/segments", updateScriptSegments);

  // Segment Takes API
  app.get("/api/segments/:segmentId/takes", getSegmentTakes);
  app.post("/api/segments/:segmentId/takes", recordSegmentTake);

  // Retry transcription for an existing take
  app.post("/api/takes/:takeId/transcribe", async (req, res) => {
    try {
      const { takeId } = req.params;

      // Get the take
      const take = await db.query.segmentTakes.findFirst({
        where: and(eq(segmentTakes.id, takeId), isNull(segmentTakes.deletedAt)),
      });

      if (!take) {
        return res.status(404).json({ error: "Take not found" });
      }

      // Check if recording file exists
      if (!take.recordingPath || !fs.existsSync(take.recordingPath)) {
        return res.status(404).json({ error: "Recording file not found" });
      }

      // Read the audio file
      const audioBuffer = fs.readFileSync(take.recordingPath);

      // Try to transcribe
      let transcriptionError: string | undefined;

      const parakeetBaseUrl =
        process.env.PARAKEET_ENDPOINT || "http://localhost:8765";
      const endpointUrl = `${parakeetBaseUrl}/audio/transcriptions`;

      try {
        const formData = new FormData();
        formData.append("file", audioBuffer, {
          filename: `${take.recordingId}.wav`,
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
          await db
            .update(segmentTakes)
            .set({
              transcription: data.text || "",
              confidence: 0.85,
              words: data.words ? JSON.stringify(data.words) : undefined,
              segments: data.segments ? JSON.stringify(data.segments) : undefined,
              audioDuration: data.duration ?? undefined,
              duration: resolveTakeDurationMs(take.duration, data.duration),
            })
            .where(eq(segmentTakes.id, takeId));
          console.log(
            `Retry transcription successful: ${(data.text || "").substring(0, 50)}...`,
          );
        } else {
          const errorText = await response.text();
          console.log(`Endpoint ${endpointUrl} failed: ${errorText}`);
          transcriptionError = `Transcription failed: ${errorText}`;
        }
      } catch (error) {
        console.log(`Transcription endpoint ${endpointUrl} failed:`, error);
        transcriptionError = `Transcription request failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      if (!transcriptionError) {
        // already updated above
      } else {
        transcriptionError = transcriptionError || "Transcription failed";
      }

      // Return updated take
      const updatedTake = await db.query.segmentTakes.findFirst({
        where: eq(segmentTakes.id, takeId),
      });

      res.json({
        ...updatedTake,
        transcriptionError,
      });
    } catch (error) {
      console.error("Error retrying transcription:", error);
      res.status(500).json({
        error: `Failed to retry transcription: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  });

  // Delete take
  app.delete("/api/takes/:takeId", async (req, res) => {
    try {
      const { takeId } = req.params;

      // Get take to find recording path
      const take = await db.query.segmentTakes.findFirst({
        where: and(eq(segmentTakes.id, takeId), isNull(segmentTakes.deletedAt)),
      });

      if (!take) {
        return res.status(404).json({ error: "Take not found" });
      }

      // Soft delete the take and preserve numbering/history.
      await db
        .update(segmentTakes)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(segmentTakes.id, takeId));

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting take:", error);
      res.status(500).json({ error: "Failed to delete take" });
    }
  });

  app.post("/api/takes/:takeId/restore", async (req, res) => {
    try {
      const { takeId } = req.params;

      const take = await db.query.segmentTakes.findFirst({
        where: eq(segmentTakes.id, takeId),
      });

      if (!take) {
        return res.status(404).json({ error: "Take not found" });
      }

      await db
        .update(segmentTakes)
        .set({ deletedAt: null })
        .where(eq(segmentTakes.id, takeId));

      const restoredTake = await db.query.segmentTakes.findFirst({
        where: eq(segmentTakes.id, takeId),
      });

      res.json(restoredTake);
    } catch (error) {
      console.error("Error restoring take:", error);
      res.status(500).json({ error: "Failed to restore take" });
    }
  });

  // Serve audio recordings
  app.get("/api/recordings/:recordingId", (req, res) => {
    const { recordingId } = req.params;
    const filePath = path.join(RECORDINGS_DIR, `${recordingId}.wav`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Recording not found" });
    }

    res.setHeader("Content-Type", "audio/wav");
    fs.createReadStream(filePath).pipe(res);
  });

  // Legacy Segments API (for timeline labeling)
  app.get("/api/segments/:projectId", getSegments);
  app.post("/api/segments/:projectId", saveSegment);
  app.delete("/api/segments/:projectId/:segmentId", deleteSegment);

  // Export API
  app.post("/api/export/json", downloadProjectJSON);
  app.post("/api/export/csv", downloadProjectCSV);

  return app;
}
