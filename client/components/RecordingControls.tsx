import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
  recordingTime?: number;
}

export function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  recordingTime = 0,
}: RecordingControlsProps) {
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [bars, setBars] = useState<number[]>(Array(30).fill(0));

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setBars(Array(30).fill(0));
      return;
    }

    const animate = () => {
      if (!analyzerRef.current || !canvasRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);

      const barCount = 30;
      const newBars = Array(barCount)
        .fill(0)
        .map((_, i) => {
          const index = Math.floor((i / barCount) * dataArray.length);
          return dataArray[index] / 255;
        });

      setBars(newBars);

      // Draw canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgb(260, 90%, 56%)";

        const barWidth = canvas.width / barCount;
        newBars.forEach((bar, i) => {
          const height = bar * canvas.height;
          ctx.fillRect(
            i * barWidth,
            canvas.height - height,
            barWidth - 2,
            height,
          );
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    const setupAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyzerRef.current = analyser;
        animate();
      } catch (error) {
        console.error("Error setting up audio analysis:", error);
      }
    };

    setupAudio();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between">
      <div>
        <h2 className="font-semibold text-foreground mb-6">Record</h2>

        {/* Waveform visualization */}
        <div className="mb-6 p-4 bg-muted rounded-lg flex items-center justify-center min-h-24">
          {isRecording ? (
            <canvas
              ref={canvasRef}
              width={280}
              height={80}
              className="w-full"
            />
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Ready to record</p>
            </div>
          )}
        </div>

        {/* Recording time display */}
        {isRecording && (
          <div className="mb-6 text-center">
            <p className="text-lg font-semibold text-accent">
              {formatTime(recordingTime)}
            </p>
          </div>
        )}

        {/* Recording Controls */}
        <div className="space-y-3">
          {!isRecording ? (
            <Button
              onClick={onStartRecording}
              className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </Button>
          ) : (
            <Button
              onClick={onStopRecording}
              className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Square className="w-4 h-4" />
              Stop Recording
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
