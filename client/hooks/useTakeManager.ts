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
        const response = await fetch(`/api/takes/${takeId}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setSegments((prev) =>
            prev.map((seg) => ({
              ...seg,
              takes: seg.takes.map((t) =>
                t.id === takeId
                  ? { ...t, deletedAt: new Date().toISOString() }
                  : t,
              ),
            })),
          );
          toast({ title: "Success", description: "Take deleted" });
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
          toast({ title: "Success", description: "Take restored" });
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
            toast({ title: "Success", description: "Transcription completed" });
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

  return {
    deleteTake,
    restoreTake,
    retryTranscription,
    retryingTranscription,
    formatTime,
    getTakeDurationMs,
  };
}
