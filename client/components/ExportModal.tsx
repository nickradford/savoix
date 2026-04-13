import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  AlertTriangle,
  Download,
  FileAudio,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/ui/waveform";

// Minimal interfaces needed for export
interface ExportTake {
  id: string;
  recordingId: string;
  takeNumber?: number;
  audioDuration?: number;
  duration: number;
  isSelected?: boolean;
  deletedAt?: string | null;
}

interface ExportSegment {
  id: string;
  projectId: string;
  index: number;
  text: string;
  takes: ExportTake[];
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  segments: ExportSegment[];
  onExport: (format: "wav" | "mp3" | "ogg" | "flac") => Promise<void | boolean>;
  isExporting: boolean;
}

const SILENCE_DURATION_MS = 1000; // 1 second silence between takes

export function ExportModal({
  isOpen,
  onClose,
  projectName,
  segments,
  onExport,
  isExporting,
}: ExportModalProps) {
  const [exportFormat, setExportFormat] = useState<
    "wav" | "mp3" | "ogg" | "flac"
  >("wav");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentTakePlaybackTime, setCurrentTakePlaybackTime] = useState(0);
  const [audioData, setAudioData] = useState<number[]>(new Array(20).fill(0));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Build export segments with selected takes
  const exportSegments = useMemo(() => {
    return segments.map((segment) => ({
      segment,
      selectedTake:
        segment.takes.find((t) => t.isSelected && !t.deletedAt) || null,
    }));
  }, [segments]);

  // Find missing segments
  const missingSegments = useMemo(() => {
    return exportSegments
      .map((es, index) => ({ ...es, index }))
      .filter((es) => !es.selectedTake);
  }, [exportSegments]);

  // Find segments with selected takes for playback
  const playableSegments = useMemo(() => {
    return exportSegments.filter((es) => es.selectedTake);
  }, [exportSegments]);

  // Update waveform visualization
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Sample 20 points from the frequency data
    const samples = 20;
    const step = Math.floor(dataArray.length / samples);
    const newAudioData = [];

    for (let i = 0; i < samples; i++) {
      const value = dataArray[i * step] / 255; // Normalize to 0-1
      newAudioData.push(value);
    }

    setAudioData(newAudioData);
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setCurrentTakePlaybackTime(0);
    setAudioData(new Array(20).fill(0));
  }, []);

  const stopPlayback = useCallback(() => {
    stopCurrentAudio();
    setIsPlaying(false);
    setCurrentSegmentIndex(0);
  }, [stopCurrentAudio]);

  const playNextSegment = useCallback(
    async (startIndex: number) => {
      // Find next segment with a selected take
      let nextIndex = startIndex;
      while (nextIndex < playableSegments.length) {
        if (playableSegments[nextIndex]?.selectedTake) {
          break;
        }
        nextIndex++;
      }

      if (nextIndex >= playableSegments.length) {
        // Finished playing all segments
        stopPlayback();
        return;
      }

      setCurrentSegmentIndex(nextIndex);
      const segment = playableSegments[nextIndex];
      const take = segment.selectedTake!;

      // Create audio element
      const audio = new Audio(`/api/recordings/${take.recordingId}`);
      audioRef.current = audio;

      // Set up Web Audio API for visualization
      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;

        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        // Start visualization
        updateWaveform();
      } catch (err) {
        console.warn("Could not set up audio visualization:", err);
      }

      audio.onplay = () => {
        setIsPlaying(true);
      };

      audio.ontimeupdate = () => {
        setCurrentTakePlaybackTime(audio.currentTime);
      };

      audio.onended = () => {
        setCurrentTakePlaybackTime(0);
        // Wait for silence duration before playing next
        silenceTimeoutRef.current = setTimeout(() => {
          playNextSegment(nextIndex + 1);
        }, SILENCE_DURATION_MS);
      };

      audio.onerror = () => {
        console.error("Error playing audio");
        playNextSegment(nextIndex + 1);
      };

      audio.play().catch((err) => {
        console.error("Failed to play audio:", err);
        playNextSegment(nextIndex + 1);
      });
    },
    [playableSegments, stopPlayback, updateWaveform],
  );

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (playableSegments.length === 0) return;
      playNextSegment(0);
    }
  }, [isPlaying, playableSegments.length, playNextSegment, stopPlayback]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopPlayback();
    }
    return () => {
      stopPlayback();
    };
  }, [isOpen, stopPlayback]);

  // Scroll current segment into view when playing
  useEffect(() => {
    if (isPlaying && segmentRefs.current[currentSegmentIndex]) {
      segmentRefs.current[currentSegmentIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isPlaying, currentSegmentIndex]);

  // Keyboard shortcuts for export modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayback();
          break;
        case "p":
        case "P":
          e.preventDefault();
          togglePlayback();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (playableSegments.length > 0) {
            const newIndex = Math.max(0, currentSegmentIndex - 1);
            stopCurrentAudio();
            playNextSegment(newIndex);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (playableSegments.length > 0) {
            // If at index 0 and not yet playing, start from the first segment
            // Otherwise move to next segment
            const newIndex =
              currentSegmentIndex === 0 && !isPlaying
                ? 0
                : Math.min(
                    playableSegments.length - 1,
                    currentSegmentIndex + 1,
                  );
            stopCurrentAudio();
            playNextSegment(newIndex);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (playableSegments.length > 0) {
            // If at index 0 and not yet playing, start from the first segment
            // Otherwise move to next segment
            const newIndex =
              currentSegmentIndex === 0 && !isPlaying
                ? 0
                : Math.min(
                    playableSegments.length - 1,
                    currentSegmentIndex + 1,
                  );
            stopCurrentAudio();
            playNextSegment(newIndex);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    isPlaying,
    currentSegmentIndex,
    playableSegments.length,
    togglePlayback,
    stopCurrentAudio,
    playNextSegment,
    onClose,
  ]);

  const handleExport = async () => {
    await onExport(exportFormat);
  };

  const getSegmentStatus = (
    segment: { segment: ExportSegment; selectedTake: ExportTake | null },
    index: number,
  ) => {
    if (isPlaying && currentSegmentIndex === index) {
      return "playing";
    }
    if (!segment.selectedTake) {
      return "missing";
    }
    if (index < currentSegmentIndex) {
      return "played";
    }
    return "ready";
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="size-5" />
            Export Project: {projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Warning for missing segments */}
          {missingSegments.length > 0 && (
            <Alert
              variant="destructive"
              className="bg-amber-50 border-amber-200"
            >
              <AlertTriangle className="size-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <span className="font-medium">Warning:</span> Missing{" "}
                {missingSegments.length} segment
                {missingSegments.length > 1 ? "s" : ""}: segments{" "}
                {missingSegments.map((ms) => ms.index + 1).join(", ")}. You can
                still export, but these segments will be skipped.
              </AlertDescription>
            </Alert>
          )}

          {/* Playback Controls with Waveform */}
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
            <Button
              variant="outline"
              size="icon"
              onClick={togglePlayback}
              disabled={playableSegments.length === 0}
              className="shrink-0"
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {isPlaying
                  ? `Playing segment ${currentSegmentIndex + 1} of ${exportSegments.length}`
                  : "Preview Export"}
              </p>
              <p className="text-xs text-muted-foreground">
                {playableSegments.length === 0
                  ? "No selected takes to preview"
                  : `${playableSegments.length} segment${playableSegments.length > 1 ? "s" : ""} ready`}
              </p>
            </div>
            {/* Live Waveform */}
            {isPlaying && (
              <div className="w-32 h-9 flex items-center">
                <Waveform
                  data={audioData}
                  height={36}
                  barWidth={4}
                  barGap={2}
                  barRadius={4}
                  barColor="#f43f5e"
                  fadeEdges={true}
                  fadeWidth={8}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Segment List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Segments ({exportSegments.length})
            </h3>
            <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2">
              {exportSegments.map((exportSeg, index) => {
                const status = getSegmentStatus(exportSeg, index);
                const isCurrent = isPlaying && currentSegmentIndex === index;

                const handleSegmentClick = () => {
                  if (!exportSeg.selectedTake) return;

                  // Stop current audio and start from this segment immediately
                  stopCurrentAudio();
                  playNextSegment(index);
                };

                return (
                  <div
                    key={exportSeg.segment.id}
                    ref={(el) => {
                      segmentRefs.current[index] = el;
                    }}
                    onClick={handleSegmentClick}
                    className={cn(
                      "flex items-start gap-3 p-2 rounded-md text-sm transition-colors scroll-mt-12 scroll-mb-8",
                      exportSeg.selectedTake &&
                        "cursor-pointer hover:bg-secondary/50",
                      isCurrent && "bg-primary/10",
                      status === "missing" && "opacity-60",
                      status === "played" && "opacity-50",
                    )}
                  >
                    <Badge
                      variant={
                        status === "missing"
                          ? "destructive"
                          : status === "playing"
                            ? "default"
                            : "secondary"
                      }
                      className="shrink-0 mt-0.5"
                    >
                      {index + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="break-words">{exportSeg.segment.text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {exportSeg.selectedTake ? (
                          <>
                            Take #{exportSeg.selectedTake.takeNumber} •{" "}
                            {formatDuration(
                              exportSeg.selectedTake.audioDuration ||
                                exportSeg.selectedTake.duration / 1000,
                            )}
                          </>
                        ) : (
                          <span className="text-destructive">
                            No selected take
                          </span>
                        )}
                      </p>
                    </div>
                    {isCurrent && isPlaying && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <div className="size-2 bg-primary rounded-full animate-pulse" />
                        Playing
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export Format Selection */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Export Format
            </h3>
            <div className="flex gap-2">
              {(["wav", "mp3", "ogg", "flac"] as const).map((format) => (
                <Button
                  key={format}
                  variant={exportFormat === format ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExportFormat(format)}
                  className="flex-1"
                >
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Files will be exported as{" "}
              <code className="bg-secondary px-1 py-0.5 rounded">
                {kebabify(projectName)}/segment-1.{exportFormat}
              </code>
              , etc.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            {missingSegments.length > 0 ? (
              <span className="text-amber-600">
                {missingSegments.length} segment
                {missingSegments.length > 1 ? "s" : ""} will be skipped
              </span>
            ) : (
              <span>All segments ready</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || playableSegments.length === 0}
              className="gap-1.5"
            >
              {isExporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  Export{" "}
                  {playableSegments.length > 0
                    ? `${playableSegments.length} segment${playableSegments.length > 1 ? "s" : ""}`
                    : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function kebabify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
