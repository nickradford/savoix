import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export interface SegmentTake {
  id: string;
  segmentId: string;
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

interface Segment {
  id: string;
  projectId: string;
  index: number;
  text: string;
  takes: SegmentTake[];
}

type SetSegments = React.Dispatch<React.SetStateAction<Segment[]>>;

export function useTakeManager(segments: Segment[], setSegments: SetSegments) {
  const { toast } = useToast();
  const [retryingTranscription, setRetryingTranscription] = useState<
    Set<string>
  >(new Set());

  const deleteTake = useCallback(
    async (takeId: string): Promise<boolean> => {
      try {
        // Find the take to check if it's selected
        let wasSelected = false;
        setSegments((prev) => {
          const take = prev
            .flatMap((seg) => seg.takes)
            .find((t) => t.id === takeId);
          if (take?.isSelected) {
            wasSelected = true;
          }
          return prev;
        });

        // If selected, deselect first
        if (wasSelected) {
          await fetch(`/api/takes/${takeId}/select`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isSelected: false }),
          });
        }

        const response = await fetch(`/api/takes/${takeId}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setSegments((prev) =>
            prev.map((seg) => ({
              ...seg,
              takes: seg.takes.map((t) =>
                t.id === takeId
                  ? {
                      ...t,
                      deletedAt: new Date().toISOString(),
                      isSelected: false,
                    }
                  : t,
              ),
            })),
          );
          return true;
        } else {
          toast({
            title: "Error",
            description: "Failed to delete take",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        console.error("Error deleting take:", error);
        toast({
          title: "Error",
          description: "Failed to delete take",
          variant: "destructive",
        });
        return false;
      }
    },
    [setSegments, toast],
  );

  const restoreTake = useCallback(
    async (takeId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/takes/${takeId}/restore`, {
          method: "POST",
        });
        if (response.ok) {
          const restoredTake = await response.json();
          setSegments((prev) =>
            prev.map((seg) => ({
              ...seg,
              takes: seg.takes.map((t) =>
                t.id === takeId
                  ? { ...t, ...restoredTake, deletedAt: null }
                  : t,
              ),
            })),
          );
          return true;
        } else {
          toast({
            title: "Error",
            description: "Failed to restore take",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        console.error("Error restoring take:", error);
        toast({
          title: "Error",
          description: "Failed to restore take",
          variant: "destructive",
        });
        return false;
      }
    },
    [setSegments, toast],
  );

  const retryTranscription = useCallback(
    async (take: SegmentTake): Promise<void> => {
      setRetryingTranscription((prev) => new Set(prev).add(take.id));
      try {
        const response = await fetch(`/api/takes/${take.id}/transcribe`, {
          method: "POST",
        });
        if (response.ok) {
          const updatedTake = await response.json();
          setSegments((prev) =>
            prev.map((seg) =>
              seg.id === take.segmentId
                ? {
                    ...seg,
                    takes: seg.takes.map((t) =>
                      t.id === take.id ? { ...t, ...updatedTake } : t,
                    ),
                  }
                : seg,
            ),
          );
          if (updatedTake.transcription) {
            // Success - no toast needed
          } else {
            toast({
              title: "Warning",
              description: "Transcription failed again",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Error",
            description: "Failed to retry transcription",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error retrying transcription:", error);
        toast({
          title: "Error",
          description: "Failed to retry transcription",
          variant: "destructive",
        });
      } finally {
        setRetryingTranscription((prev) => {
          const newSet = new Set(prev);
          newSet.delete(take.id);
          return newSet;
        });
      }
    },
    [setSegments, toast],
  );

  const formatTime = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const getTakeDurationMs = useCallback(
    (take: Pick<SegmentTake, "audioDuration" | "duration">): number => {
      if ((take.audioDuration ?? 0) > 0) {
        return Math.round((take.audioDuration ?? 0) * 1000);
      }
      return take.duration;
    },
    [],
  );

  const selectTake = useCallback(
    async (takeId: string, isSelected: boolean): Promise<boolean> => {
      try {
        const response = await fetch(`/api/takes/${takeId}/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isSelected }),
        });

        if (response.ok) {
          const updatedTake = await response.json();
          setSegments((prev) =>
            prev.map((seg) =>
              seg.id === updatedTake.segmentId
                ? {
                    ...seg,
                    takes: seg.takes.map((t) =>
                      t.id === takeId
                        ? { ...t, isSelected: updatedTake.isSelected }
                        : isSelected && t.segmentId === updatedTake.segmentId
                          ? { ...t, isSelected: false }
                          : t,
                    ),
                  }
                : seg,
            ),
          );
          return true;
        } else {
          toast({
            title: "Error",
            description: "Failed to update take selection",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        console.error("Error selecting take:", error);
        toast({
          title: "Error",
          description: "Failed to update take selection",
          variant: "destructive",
        });
        return false;
      }
    },
    [setSegments, toast],
  );

  return {
    deleteTake,
    restoreTake,
    selectTake,
    retryTranscription,
    retryingTranscription,
    formatTime,
    getTakeDurationMs,
  };
}
