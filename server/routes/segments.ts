import { RequestHandler } from "express";
import { SegmentsResponse, SaveSegmentRequest, Segment } from "@shared/api";

// In-memory storage (replace with database in production)
const segmentsStorage: Map<string, Segment[]> = new Map();

/**
 * Get all segments for a project
 */
export const getSegments: RequestHandler<
  { projectId: string },
  SegmentsResponse
> = (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res
        .status(400)
        .json({ segments: [], error: "projectId is required" });
    }

    const segments = segmentsStorage.get(projectId) || [];
    res.json({ segments });
  } catch (error) {
    console.error("Error getting segments:", error);
    res
      .status(500)
      .json({
        segments: [],
        error: `Failed to get segments: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
  }
};

/**
 * Save or update a segment
 */
export const saveSegment: RequestHandler<
  { projectId: string },
  SegmentsResponse,
  Omit<Segment, "projectId">
> = (req, res) => {
  try {
    const { projectId } = req.params;
    const segment: Omit<Segment, "projectId"> = req.body;

    if (!projectId) {
      return res
        .status(400)
        .json({ segments: [], error: "projectId is required" });
    }

    if (!segment.label || segment.startTime === undefined || segment.endTime === undefined) {
      return res.status(400).json({
        segments: [],
        error: "label, startTime, and endTime are required",
      });
    }

    let segments = segmentsStorage.get(projectId) || [];

    // Check if segment exists (update) or create new
    const existingIndex = segments.findIndex((s) => s.id === segment.id);
    const newSegment: Segment = {
      ...segment,
      projectId,
      id: segment.id || Date.now().toString(),
    };

    if (existingIndex >= 0) {
      segments[existingIndex] = newSegment;
    } else {
      segments.push(newSegment);
    }

    segmentsStorage.set(projectId, segments);
    res.json({ segments });
  } catch (error) {
    console.error("Error saving segment:", error);
    res
      .status(500)
      .json({
        segments: [],
        error: `Failed to save segment: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
  }
};

/**
 * Delete a segment
 */
export const deleteSegment: RequestHandler<
  { projectId: string; segmentId: string },
  SegmentsResponse
> = (req, res) => {
  try {
    const { projectId, segmentId } = req.params;

    if (!projectId || !segmentId) {
      return res.status(400).json({
        segments: [],
        error: "projectId and segmentId are required",
      });
    }

    let segments = segmentsStorage.get(projectId) || [];
    segments = segments.filter((s) => s.id !== segmentId);

    segmentsStorage.set(projectId, segments);
    res.json({ segments });
  } catch (error) {
    console.error("Error deleting segment:", error);
    res
      .status(500)
      .json({
        segments: [],
        error: `Failed to delete segment: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
  }
};
