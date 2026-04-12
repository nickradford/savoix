import { useState, useCallback, useEffect } from "react";
import { Segment, SegmentsResponse } from "@shared/api";

export function useSegments(projectId: string) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load segments from server
  const loadSegments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/segments/${projectId}`);
      const data: SegmentsResponse = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSegments(data.segments);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load segments";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load segments on mount
  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // Add a segment
  const addSegment = useCallback(
    async (segment: Omit<Segment, "projectId">) => {
      try {
        const response = await fetch(`/api/segments/${projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(segment),
        });
        const data: SegmentsResponse = await response.json();
        if (data.error) {
          setError(data.error);
          return false;
        }
        setSegments(data.segments);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to add segment";
        setError(errorMessage);
        return false;
      }
    },
    [projectId]
  );

  // Update a segment
  const updateSegment = useCallback(
    async (id: string, segment: Omit<Segment, "projectId">) => {
      try {
        const response = await fetch(`/api/segments/${projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...segment, id }),
        });
        const data: SegmentsResponse = await response.json();
        if (data.error) {
          setError(data.error);
          return false;
        }
        setSegments(data.segments);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update segment";
        setError(errorMessage);
        return false;
      }
    },
    [projectId]
  );

  // Delete a segment
  const deleteSegmentItem = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/segments/${projectId}/${id}`, {
          method: "DELETE",
        });
        const data: SegmentsResponse = await response.json();
        if (data.error) {
          setError(data.error);
          return false;
        }
        setSegments(data.segments);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete segment";
        setError(errorMessage);
        return false;
      }
    },
    [projectId]
  );

  return {
    segments,
    isLoading,
    error,
    addSegment,
    updateSegment,
    deleteSegment: deleteSegmentItem,
    loadSegments,
  };
}
