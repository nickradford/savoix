import { db } from "../db";
import { scriptSegments } from "../schema";
import { eq } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";

/**
 * Generate a content hash for segment text
 * This allows segments to be matched by content, enabling:
 * - Takes to persist when segments are reordered
 * - Takes to persist when segments are moved via insertions/deletions
 */
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export interface SegmentUpdate {
  id: string;
  projectId: string;
  index: number;
  text: string;
  contentHash: string;
}

/**
 * Synchronizes script segments with a new script while preserving segment IDs
 * based on content hashing. This ensures takes are not lost when:
 * - Lines are inserted (segments shift down)
 * - Lines are deleted (segments shift up)
 * - Lines are reordered (segments move to new positions)
 * - Lines are edited (segment keeps ID but text updates)
 *
 * @param projectId - The project ID
 * @param script - The new script content
 * @returns Array of updated segments with their takes
 */
export async function syncSegmentsWithScript(
  projectId: string,
  script: string,
): Promise<void> {
  // Get existing segments
  const existingSegments = await db.query.scriptSegments.findMany({
    where: eq(scriptSegments.projectId, projectId),
  });

  // Parse new lines
  const lines = script
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  // Build a map of content hash to existing segment(s)
  // We use an array because the same content can appear multiple times
  const hashToSegments = new Map<string, typeof existingSegments>();
  for (const segment of existingSegments) {
    const list = hashToSegments.get(segment.contentHash) || [];
    list.push(segment);
    hashToSegments.set(segment.contentHash, list);
  }

  // Track which existing segments have been matched
  const matchedSegmentIds = new Set<string>();

  // Process each new line to determine which segments to create/update
  const segmentsToInsert: Array<{
    id: string;
    projectId: string;
    index: number;
    text: string;
    contentHash: string;
  }> = [];

  const segmentsToUpdate: Array<{
    id: string;
    index: number;
  }> = [];

  for (let newIdx = 0; newIdx < lines.length; newIdx++) {
    const line = lines[newIdx];
    const contentHash = hashContent(line);
    const availableSegments = hashToSegments.get(contentHash) || [];

    // Find an unmatched segment with this hash
    const matchingSegment = availableSegments.find(
      (seg) => !matchedSegmentIds.has(seg.id),
    );

    if (matchingSegment) {
      // Found a matching segment - reuse its ID
      matchedSegmentIds.add(matchingSegment.id);
      if (matchingSegment.index !== newIdx) {
        segmentsToUpdate.push({
          id: matchingSegment.id,
          index: newIdx,
        });
      }
    } else {
      // No matching segment - create new
      segmentsToInsert.push({
        id: randomUUID(),
        projectId,
        index: newIdx,
        text: line,
        contentHash,
      });
    }
  }

  // Delete segments that weren't matched (content was removed)
  for (const segment of existingSegments) {
    if (!matchedSegmentIds.has(segment.id)) {
      await db.delete(scriptSegments).where(eq(scriptSegments.id, segment.id));
    }
  }

  // Update indices for matched segments
  for (const update of segmentsToUpdate) {
    await db
      .update(scriptSegments)
      .set({ index: update.index })
      .where(eq(scriptSegments.id, update.id));
  }

  // Insert new segments
  if (segmentsToInsert.length > 0) {
    await db.insert(scriptSegments).values(segmentsToInsert);
  }
}
