import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Square,
  Trash2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SegmentTake } from "@/hooks/useTakeManager";
import {
  TranscriptViewerContainer,
  TranscriptViewerScrubBar,
  TranscriptViewerWords,
  TranscriptViewerAudio,
  TranscriptViewerConfidence,
} from "@/components/ui/transcript-viewer";
import type { CharacterAlignmentResponseModel } from "@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel";

interface TakeCardProps {
  take: SegmentTake;
  takeIndex: number;
  totalTakes: number;
  isExpanded: boolean;
  isFocused: boolean;
  isPlaying: boolean;
  isRetrying: boolean;
  autoPlay?: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onRetry: () => void;
  formatTime: (ms: number) => string;
  getTakeDurationMs: (
    take: Pick<SegmentTake, "audioDuration" | "duration">,
  ) => number;
  transcriptAlignment?: CharacterAlignmentResponseModel | null;
  expectedScript?: string | null;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export function TakeCard({
  take,
  takeIndex,
  totalTakes,
  isExpanded,
  isFocused,
  isPlaying,
  isRetrying,
  autoPlay = false,
  onToggleExpand,
  onPlay,
  onDelete,
  onRestore,
  onRetry,
  formatTime,
  getTakeDurationMs,
  transcriptAlignment,
  expectedScript,
  onPlayStateChange,
}: TakeCardProps) {
  const isDeleted = !!take.deletedAt;
  const hasTranscription = !!take.transcription;
  const hasError = take.transcriptionError && !hasTranscription;

  return (
    <div
      className={cn(
        "bg-card border rounded-lg overflow-hidden transition-all",
        isDeleted ? "opacity-60" : "border-border",
        !isDeleted && "hover:border-primary/20",
        isFocused && "ring-1 ring-primary border-primary/30",
      )}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Take {take.takeNumber ?? totalTakes - takeIndex}
            </span>
            {hasTranscription && (
              <Badge
                variant="secondary"
                className="text-xs font-normal bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0"
              >
                Done
              </Badge>
            )}
            {isDeleted && (
              <Badge variant="secondary" className="text-xs font-normal">
                Deleted
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(getTakeDurationMs(take))}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPlay}
            disabled={isDeleted}
            className="h-7 px-2 text-xs"
          >
            {isPlaying ? (
              <Square className="size-3 mr-1" />
            ) : (
              <Play className="size-3 mr-1" />
            )}
            {isPlaying ? "Stop" : "Play"}
          </Button>

          {isDeleted ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRestore}
              className="h-7 px-2 text-xs"
            >
              <RotateCcw className="size-3 mr-1" />
              Restore
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3 mr-1" />
              Delete
            </Button>
          )}

          {!isDeleted && hasTranscription && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="h-7 px-2 text-xs ml-auto"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="size-3 mr-1" />
                  Text
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {isExpanded && !isDeleted && hasTranscription && transcriptAlignment && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
          <TranscriptViewerContainer
            key={take.id}
            audioSrc={`/api/recordings/${take.recordingId}`}
            audioType="audio/wav"
            alignment={transcriptAlignment}
            expectedScript={expectedScript}
            autoPlay={autoPlay}
            onPlay={() => onPlayStateChange?.(true)}
            onPause={() => onPlayStateChange?.(false)}
            onEnded={() => onPlayStateChange?.(false)}
            className="space-y-2"
          >
            <TranscriptViewerScrubBar
              className="w-full"
              labelsClassName="text-[10px]"
            />
            <TranscriptViewerWords className="text-xs leading-5" />
            <TranscriptViewerAudio
              className="hidden"
              data-take-audio-id={take.id}
            />
            <TranscriptViewerConfidence fallbackConfidence={take.confidence} />
          </TranscriptViewerContainer>
        </div>
      )}

      {hasError && !isDeleted && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2">
          <div className="flex items-center gap-1.5 text-amber-600 mb-2">
            <AlertCircle className="size-3.5" />
            <span className="text-xs">Transcription failed</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-7 text-xs"
          >
            <RefreshCw
              className={cn("size-3 mr-1", isRetrying && "animate-spin")}
            />
            {isRetrying ? "Retrying..." : "Retry"}
          </Button>
        </div>
      )}
    </div>
  );
}
