import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  Trash2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Heart,
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
  onSelect?: (isSelected: boolean) => void;
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
  onSelect,
  formatTime,
  getTakeDurationMs,
  transcriptAlignment,
  expectedScript,
  onPlayStateChange,
}: TakeCardProps) {
  const isDeleted = !!take.deletedAt;
  const hasTranscription = !!take.transcription;
  const hasError = take.transcriptionError && !hasTranscription;
  const isSelected = !!take.isSelected;

  return (
    <div
      className={cn(
        "bg-card border rounded-lg overflow-hidden transition-all duration-300",
        isDeleted && "opacity-60",
        !isDeleted && !isSelected && "hover:border-primary/20 border-border",
        isSelected &&
          "border-rose-400 shadow-[0_0_0_1px_rgba(251,113,133,0.3),0_4px_20px_-4px_rgba(251,113,133,0.25)]",
        isFocused && !isSelected && "ring-1 ring-primary border-primary/30",
      )}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tabular-nums">
              Take {take.takeNumber ?? totalTakes - takeIndex}
            </span>
            {isSelected && (
              <Badge
                variant="secondary"
                className="text-xs font-normal bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700 dark:from-rose-900/40 dark:to-pink-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-700/50 shadow-sm"
              >
                <Heart className="w-3 h-3 mr-0.5 fill-current" />
                Selected
              </Badge>
            )}
            {hasTranscription && !isSelected && (
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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {/* Heart Select */}
            {onSelect && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSelect(!isSelected)}
                disabled={isDeleted}
                className={cn(
                  "h-8 w-8 transition-all duration-200",
                  isDeleted && "opacity-40 cursor-not-allowed",
                  !isDeleted && isSelected
                    ? "text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    : !isDeleted &&
                        "text-muted-foreground hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20",
                )}
              >
                <Heart
                  className={cn(
                    "size-4 transition-all duration-200",
                    isSelected && "fill-current scale-110",
                  )}
                />
              </Button>
            )}

            {/* Play/Pause Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onPlay}
              disabled={isDeleted}
              className="h-8 w-8"
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>

            {/* Delete/Restore */}
            {isDeleted ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRestore}
                className="h-8 w-8"
              >
                <RotateCcw className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>

          {/* Text Toggle - Right Aligned */}
          {!isDeleted && hasTranscription && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3 mr-1" />
                  Text
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
            <TranscriptViewerConfidence confidence={take.confidence} />
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
