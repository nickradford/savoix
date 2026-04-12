import { RequestHandler } from "express";
import { db } from "../db";
import { scriptSegments, segmentTakes } from "../schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { syncSegmentsWithScript } from "../services/segmentSync";

export const getScriptSegments: RequestHandler = async (req, res) => {
  try {
    const { projectId } = req.params;

    const segments = await db.query.scriptSegments.findMany({
      where: eq(scriptSegments.projectId, projectId),
      orderBy: (scriptSegments, { asc }) => [asc(scriptSegments.index)],
      with: {
        takes: {
          orderBy: (segmentTakes, { desc }) => [desc(segmentTakes.createdAt)],
        },
      },
    });

    res.json(segments);
  } catch (error) {
    console.error("Error fetching script segments:", error);
    res.status(500).json({ error: "Failed to fetch script segments" });
  }
};

export const updateScriptSegments: RequestHandler = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { script } = req.body;

    if (script === undefined) {
      return res.status(400).json({ error: "Script is required" });
    }

    // Sync segments while preserving IDs based on content hash
    await syncSegmentsWithScript(projectId, script);

    // Return updated segments
    const segments = await db.query.scriptSegments.findMany({
      where: eq(scriptSegments.projectId, projectId),
      orderBy: (scriptSegments, { asc }) => [asc(scriptSegments.index)],
      with: {
        takes: {
          orderBy: (segmentTakes, { desc }) => [desc(segmentTakes.createdAt)],
        },
      },
    });

    res.json(segments);
  } catch (error) {
    console.error("Error updating script segments:", error);
    res.status(500).json({ error: "Failed to update script segments" });
  }
};

export const getSegmentTakes: RequestHandler = async (req, res) => {
  try {
    const { segmentId } = req.params;

    const takes = await db.query.segmentTakes.findMany({
      where: eq(segmentTakes.segmentId, segmentId),
      orderBy: (segmentTakes, { desc }) => [desc(segmentTakes.createdAt)],
    });

    res.json(takes);
  } catch (error) {
    console.error("Error fetching segment takes:", error);
    res.status(500).json({ error: "Failed to fetch segment takes" });
  }
};

export const recordSegmentTake: RequestHandler = async (req, res) => {
  try {
    const { segmentId } = req.params;
    // Transcription result is set by the handleTranscription middleware
    const transcriptionResult = res.locals.transcriptionResult;
    const duration = req.body.duration || transcriptionResult?.duration || 0;

    if (!transcriptionResult) {
      return res
        .status(400)
        .json({ error: "Transcription result is required" });
    }

    // Get segment and project info
    const segment = await db.query.scriptSegments.findFirst({
      where: eq(scriptSegments.id, segmentId),
    });

    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    // Create take record
    const takeId = randomUUID();
    await db.insert(segmentTakes).values({
      id: takeId,
      segmentId,
      projectId: segment.projectId,
      recordingId: transcriptionResult.recordingId || randomUUID(),
      recordingPath: transcriptionResult.recordingPath || "",
      transcription: transcriptionResult.text,
      confidence: transcriptionResult.confidence,
      duration,
    });

    const take = await db.query.segmentTakes.findFirst({
      where: eq(segmentTakes.id, takeId),
    });

    res.status(201).json(take);
  } catch (error) {
    console.error("Error recording segment take:", error);
    res.status(500).json({ error: "Failed to record segment take" });
  }
};
