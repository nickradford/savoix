import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

interface AudioPlaybackProps {
  audioUrl?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayToggle: () => void;
  onTimeChange: (time: number) => void;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
}

export function AudioPlayback({
  audioUrl,
  isPlaying,
  currentTime,
  duration,
  onPlayToggle,
  onTimeChange,
  onTimeUpdate,
  onLoadedMetadata,
}: AudioPlaybackProps) {
  const audioElementRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch((e) => console.error("Error playing audio:", e));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (audioElementRef.current) {
      onTimeUpdate(audioElementRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioElementRef.current) {
      onLoadedMetadata(audioElementRef.current.duration);
    }
  };

  const handleEnded = () => {
    onPlayToggle();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    onTimeChange(newTime);
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = newTime;
    }
  };

  const handleReset = () => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = 0;
      onTimeChange(0);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-white border border-border rounded-lg p-6 flex-1 flex flex-col">
      <h2 className="font-semibold text-foreground mb-4">Playback</h2>

      {/* Audio element */}
      <audio
        ref={audioElementRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
      />

      <div className="flex-1 flex flex-col justify-between">
        {/* Timeline */}
        <div>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full mb-2 cursor-pointer"
            disabled={!audioUrl}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="space-y-2">
          <Button
            onClick={onPlayToggle}
            variant="outline"
            className="w-full gap-2"
            disabled={!audioUrl}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Play
              </>
            )}
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={!audioUrl}
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
