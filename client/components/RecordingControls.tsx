import { Mic, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/ui/live-waveform";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RecordingControlsProps {
  isRecording: boolean;
  isTranscribing: boolean;
  recordingTime: number;
  currentSegmentIndex: number;
  totalSegments: number;
  hasCurrentSegment: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  formatTime: (ms: number) => string;
}

export function RecordingControls({
  isRecording,
  isTranscribing,
  recordingTime,
  currentSegmentIndex,
  totalSegments,
  hasCurrentSegment,
  onStartRecording,
  onStopRecording,
  onPrevSegment,
  onNextSegment,
  formatTime,
}: RecordingControlsProps) {
  const isFirstSegment = currentSegmentIndex === 0;
  const isLastSegment = currentSegmentIndex === totalSegments - 1;

  return (
    <div className="border-t border-border/50 bg-card/50 px-6 py-5">
      <div className="max-w-xl mx-auto">
        {/* Waveform with fade-in and slide-up animation when active */}
        <div
          className={cn(
            "transition-all duration-500 ease-out",
            isRecording || isTranscribing
              ? "opacity-100 translate-y-0 mb-5"
              : "opacity-0 -translate-y-2 mb-0 pointer-events-none h-0 overflow-hidden",
          )}
        >
          <LiveWaveform
            active={isRecording}
            processing={isTranscribing}
            height={32}
            barWidth={2}
            barGap={1}
            mode="static"
            fadeEdges
            sensitivity={1.2}
          />
        </div>

        <div className="flex items-center justify-between">
          {/* Prev Button with Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onPrevSegment}
                disabled={isFirstSegment || isRecording}
                className="gap-1"
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-1.5">
                Previous segment
                <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-xs font-mono">
                  ←
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>

          <div className="flex flex-col items-center gap-2">
            {isRecording && (
              <div className="flex items-center gap-2 text-destructive">
                <div className="size-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-medium tabular-nums">
                  {formatTime(recordingTime)}
                </span>
              </div>
            )}
            {isTranscribing && (
              <span className="text-xs text-muted-foreground">
                Transcribing...
              </span>
            )}

            {/* Record/Stop Button with Tooltip */}
            {!isRecording ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onStartRecording}
                    disabled={isTranscribing || !hasCurrentSegment}
                    size="xl"
                    className={cn(
                      "gap-2 px-10",
                      isTranscribing && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Mic className="size-5" />
                    {isTranscribing ? "Transcribing..." : "Record"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    Start recording
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-xs font-mono">
                      Space
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onStopRecording}
                    variant="destructive"
                    size="xl"
                    className="gap-2 px-10 animate-recording-pulse"
                  >
                    <Square className="size-5" />
                    Stop
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    Stop recording
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-xs font-mono">
                      Space
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Next Button with Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNextSegment}
                disabled={isLastSegment || isRecording}
                className="gap-1"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-1.5">
                Next segment
                <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-xs font-mono">
                  →
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
