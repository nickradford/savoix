import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Download,
  ArrowLeft,
  Mic,
  Square,
  ChevronLeft,
  ChevronRight,
  Play,
  Trash2,
  Edit3,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LiveWaveform } from "@/components/ui/live-waveform";
import {
  TranscriptViewerAudio,
  TranscriptViewerContainer,
  TranscriptViewerScrubBar,
  TranscriptViewerWord,
  TranscriptViewerWords,
  type CharacterAlignmentResponseModel,
} from "@/components/ui/transcript-viewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Types
interface ScriptSegment {
  id: string;
  projectId: string;
  index: number;
  text: string;
  takes: SegmentTake[];
}

interface SegmentTake {
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

interface Project {
  id: string;
  name: string;
  description: string;
  script: string;
  createdAt: string;
}

type TimestampedWord = {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  startTime?: number;
  endTime?: number;
  start_time?: number;
  end_time?: number;
};

// Constants
const SAMPLE_RATE = 16000;

// Helper functions
function parseTakeWords(words: string | undefined): TimestampedWord[] {
  if (!words) return [];
  try {
    const parsed = JSON.parse(words);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function splitTranscriptWords(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text.trim().split(/\s+/);
}

function canonicalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");
}

function wordsEquivalent(left: string, right: string): boolean {
  return (
    canonicalizeWord(left).replace(/'/g, "") ===
    canonicalizeWord(right).replace(/'/g, "")
  );
}

function expandWord(word: string): string[] {
  const canonical = canonicalizeWord(word);
  if (!canonical) return [];

  const irregularMap: Record<string, string[]> = {
    "can't": ["can", "not"],
    wont: ["will", "not"],
    "won't": ["will", "not"],
    "shan't": ["shall", "not"],
    "let's": ["let", "us"],
  };

  if (irregularMap[canonical]) return irregularMap[canonical];

  if (canonical.endsWith("n't") && canonical.length > 3) {
    return [canonical.slice(0, -3), "not"];
  }

  const contractionSuffixes: Array<[string, string]> = [
    ["'re", "are"],
    ["'ve", "have"],
    ["'ll", "will"],
    ["'d", "would"],
    ["'m", "am"],
    ["'s", "is"],
  ];

  for (const [suffix, expansion] of contractionSuffixes) {
    if (canonical.endsWith(suffix) && canonical.length > suffix.length) {
      return [canonical.slice(0, -suffix.length), expansion];
    }
  }

  return [canonical];
}

function matchesExpandedSequence(
  sourceWord: string,
  comparisonWords: string[],
): boolean {
  const expanded = expandWord(sourceWord);
  if (expanded.length <= 1 || expanded.length !== comparisonWords.length) {
    return false;
  }
  return expanded.every((part, index) =>
    wordsEquivalent(part, comparisonWords[index] ?? ""),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readTimestamp(
  value: TimestampedWord,
  keys: Array<keyof TimestampedWord>,
): number | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function appendAlignedText(
  target: CharacterAlignmentResponseModel,
  text: string,
  start: number,
  end: number,
) {
  if (!text) return;
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd =
    Number.isFinite(end) && end > safeStart ? end : safeStart + 0.01;
  const step = (safeEnd - safeStart) / text.length;

  for (let index = 0; index < text.length; index++) {
    target.characters.push(text[index]);
    target.characterStartTimesSeconds.push(safeStart + step * index);
    target.characterEndTimesSeconds.push(safeStart + step * (index + 1));
  }
}

function buildAlignmentFromTimedWords(
  transcription: string | undefined,
  words: TimestampedWord[],
): CharacterAlignmentResponseModel | null {
  if (!transcription?.trim()) return null;

  const alignment: CharacterAlignmentResponseModel = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };

  const normalizedWords = words
    .map((word) => {
      const text = word.word ?? word.text ?? "";
      const start = readTimestamp(word, ["start", "startTime", "start_time"]);
      const end = readTimestamp(word, ["end", "endTime", "end_time"]);
      if (!text || start === null) return null;
      return { text, start, end: end ?? start + 0.01 };
    })
    .filter(
      (word): word is { text: string; start: number; end: number } =>
        word !== null,
    );

  if (!normalizedWords.length) return null;

  let cursor = 0;
  let previousEnd = 0;

  for (const word of normalizedWords) {
    const tokenStartIndex = transcription.indexOf(word.text, cursor);
    if (tokenStartIndex === -1) return null;

    if (tokenStartIndex > cursor) {
      appendAlignedText(
        alignment,
        transcription.slice(cursor, tokenStartIndex),
        previousEnd,
        word.start,
      );
    }

    appendAlignedText(
      alignment,
      transcription.slice(tokenStartIndex, tokenStartIndex + word.text.length),
      word.start,
      word.end,
    );

    cursor = tokenStartIndex + word.text.length;
    previousEnd = word.end;
  }

  if (cursor < transcription.length) {
    appendAlignedText(
      alignment,
      transcription.slice(cursor),
      previousEnd,
      previousEnd + 0.01,
    );
  }

  return alignment.characters.length ? alignment : null;
}

function buildEstimatedAlignment(
  transcription: string | undefined,
  durationSeconds: number,
): CharacterAlignmentResponseModel | null {
  if (!transcription?.trim()) return null;
  const alignment: CharacterAlignmentResponseModel = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  appendAlignedText(
    alignment,
    transcription,
    0,
    Math.max(durationSeconds, transcription.length * 0.04, 0.01),
  );
  return alignment;
}

function getTakeAlignment(
  take: Pick<
    SegmentTake,
    "words" | "transcription" | "audioDuration" | "duration"
  >,
): CharacterAlignmentResponseModel | null {
  const timedAlignment = buildAlignmentFromTimedWords(
    take.transcription,
    parseTakeWords(take.words),
  );
  if (timedAlignment) return timedAlignment;
  return buildEstimatedAlignment(
    take.transcription,
    (take.audioDuration ?? 0) > 0
      ? (take.audioDuration ?? 0)
      : take.duration / 1000,
  );
}

function getTakeDurationMs(
  take: Pick<SegmentTake, "audioDuration" | "duration">,
): number {
  if ((take.audioDuration ?? 0) > 0) {
    return Math.round((take.audioDuration ?? 0) * 1000);
  }
  return take.duration;
}

function findNextNavigableTakeIndex(
  takes: SegmentTake[] | undefined,
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (!takes?.length) return -1;

  const startIndex =
    currentIndex < 0
      ? direction === 1
        ? 0
        : takes.length - 1
      : currentIndex + direction;

  for (
    let index = startIndex;
    index >= 0 && index < takes.length;
    index += direction
  ) {
    if (!takes[index].deletedAt) {
      return index;
    }
  }

  return currentIndex;
}

function float32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// Main component
export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Script editing state
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editedScript, setEditedScript] = useState("");
  const [isSavingScript, setIsSavingScript] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Audio playback state
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Take expansion state
  const [expandedTakes, setExpandedTakes] = useState<Set<string>>(new Set());
  const [retryingTranscription, setRetryingTranscription] = useState<
    Set<string>
  >(new Set());
  const [focusedTakeIndex, setFocusedTakeIndex] = useState<number>(-1);

  // Recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch project
  useEffect(() => {
    if (!id) return;
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${id}`);
        if (response.ok) {
          const data = await response.json();
          setProject(data);
          setSegments(data.segments || []);
          setEditedScript(data.script || "");
        } else {
          toast({
            title: "Error",
            description: "Failed to load project",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching project:", error);
        toast({
          title: "Error",
          description: "Failed to load project",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchProject();
  }, [id, toast]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setFocusedTakeIndex(-1);
  }, [currentSegmentIndex]);

  // Auto-play take when navigating with keyboard
  useEffect(() => {
    const takes = segments[currentSegmentIndex]?.takes;
    if (!takes || focusedTakeIndex < 0 || focusedTakeIndex >= takes.length)
      return;
    playTake(takes[focusedTakeIndex]);
  }, [focusedTakeIndex, currentSegmentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (isEditingScript) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setCurrentSegmentIndex((i) => Math.max(0, i - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setCurrentSegmentIndex((i) => Math.min(segments.length - 1, i + 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedTakeIndex((i) =>
            findNextNavigableTakeIndex(
              segments[currentSegmentIndex]?.takes,
              i,
              -1,
            ),
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedTakeIndex((i) =>
            findNextNavigableTakeIndex(
              segments[currentSegmentIndex]?.takes,
              i,
              1,
            ),
          );
          break;
        case " ":
          e.preventDefault();
          if (isRecording) {
            stopRecording();
          } else if (!isTranscribing) {
            startRecording();
          }
          break;
        case "p":
        case "P":
          e.preventDefault();
          if (playingTakeId) {
            stopPlayback();
          } else {
            const takes = segments[currentSegmentIndex]?.takes;
            const focusedTake =
              takes && focusedTakeIndex >= 0 && focusedTakeIndex < takes.length
                ? takes[focusedTakeIndex]
                : undefined;
            if (focusedTake && !focusedTake.deletedAt) {
              playTake(focusedTake);
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    segments,
    currentSegmentIndex,
    isRecording,
    isTranscribing,
    isEditingScript,
    focusedTakeIndex,
    playingTakeId,
  ]);

  const currentSegment = segments[currentSegmentIndex];

  const toggleTakeExpansion = (takeId: string) => {
    setExpandedTakes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(takeId)) newSet.delete(takeId);
      else newSet.add(takeId);
      return newSet;
    });
  };

  const retryTranscription = async (take: SegmentTake) => {
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
  };

  const handleSaveScript = async () => {
    if (!project) return;
    setIsSavingScript(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: editedScript }),
      });
      if (response.ok) {
        const updatedProject = await response.json();
        setProject(updatedProject);
        setSegments(updatedProject.segments || []);
        setIsEditingScript(false);
        toast({
          title: "Success",
          description: `Script updated with ${updatedProject.segments.length} segments`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save script",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving script:", error);
      toast({
        title: "Error",
        description: "Failed to save script",
        variant: "destructive",
      });
    } finally {
      setIsSavingScript(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      await audioCtx.audioWorklet.addModule("/pcm-recorder-processor.js");
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-recorder-processor");
      source.connect(worklet);
      audioCtxRef.current = audioCtx;
      workletNodeRef.current = worklet;
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 100);
      }, 100);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        title: "Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (!workletNodeRef.current || !audioCtxRef.current) return;
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const worklet = workletNodeRef.current;
    const audioCtx = audioCtxRef.current;
    worklet.port.onmessage = async (e) => {
      const samples = new Float32Array(e.data as ArrayBuffer);
      const wavBlob = float32ToWavBlob(samples, SAMPLE_RATE);
      await audioCtx.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      workletNodeRef.current = null;
      audioCtxRef.current = null;
      streamRef.current = null;
      await handleTranscription(wavBlob);
    };
    worklet.port.postMessage("flush");
  };

  const handleTranscription = async (audioBlob: Blob) => {
    if (!currentSegment) return;
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        const response = await fetch(
          `/api/segments/${currentSegment.id}/takes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: base64Audio,
              duration: recordingTime,
            }),
          },
        );
        if (response.ok) {
          const take = await response.json();
          setSegments((prev) =>
            prev.map((seg) =>
              seg.id === currentSegment.id
                ? { ...seg, takes: [take, ...seg.takes] }
                : seg,
            ),
          );
          if (take.transcription || take.transcriptionError) {
            setExpandedTakes((prev) => new Set(prev).add(take.id));
          }
          if (take.transcription) {
            toast({
              title: "Success",
              description: "Recording saved and transcribed",
            });
          } else {
            toast({
              title: "Recording Saved",
              description: "Audio saved but transcription failed",
            });
          }
        } else {
          const error = await response.json();
          toast({
            title: "Error",
            description: error.error || "Failed to save recording",
            variant: "destructive",
          });
        }
        setIsTranscribing(false);
      };
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        title: "Error",
        description: "Failed to transcribe audio",
        variant: "destructive",
      });
      setIsTranscribing(false);
    }
  };

  const stopPlayback = (excludedAudio?: HTMLAudioElement | null) => {
    if (audioRef.current && audioRef.current !== excludedAudio) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    document
      .querySelectorAll<HTMLAudioElement>('[data-slot="transcript-audio"]')
      .forEach((audioElement) => {
        if (audioElement !== excludedAudio) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
      });
    setPlayingTakeId(null);
  };

  const playTake = (take: SegmentTake) => {
    if (take.deletedAt) return;
    const transcriptAudio = document.querySelector<HTMLAudioElement>(
      `[data-take-audio-id="${take.id}"]`,
    );
    if (transcriptAudio) {
      const isCurrentTakePlaying =
        playingTakeId === take.id && !transcriptAudio.paused;
      if (isCurrentTakePlaying) {
        transcriptAudio.pause();
        setPlayingTakeId(null);
        return;
      }
      stopPlayback(transcriptAudio);
      setExpandedTakes(new Set([take.id]));
      transcriptAudio.currentTime = 0;
      transcriptAudio
        .play()
        .then(() => setPlayingTakeId(take.id))
        .catch(() => {
          toast({
            title: "Error",
            description: "Could not play audio file",
            variant: "destructive",
          });
          setPlayingTakeId(null);
        });
      return;
    }
    const isCurrentLegacyTakePlaying =
      playingTakeId === take.id && audioRef.current !== null;
    if (isCurrentLegacyTakePlaying) {
      stopPlayback();
      return;
    }
    stopPlayback();
    setExpandedTakes(new Set([take.id]));
    const audio = new Audio(`/api/recordings/${take.recordingId}`);
    audioRef.current = audio;
    audio.onended = () => setPlayingTakeId(null);
    audio.onerror = () => {
      toast({
        title: "Error",
        description: "Could not play audio file",
        variant: "destructive",
      });
      setPlayingTakeId(null);
    };
    audio
      .play()
      .then(() => setPlayingTakeId(take.id))
      .catch(() =>
        toast({
          title: "Error",
          description: "Could not play audio file",
          variant: "destructive",
        }),
      );
  };

  const deleteTake = async (takeId: string) => {
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
        setExpandedTakes((prev) => {
          const next = new Set(prev);
          next.delete(takeId);
          return next;
        });
        if (playingTakeId === takeId) stopPlayback();
        toast({ title: "Success", description: "Take deleted" });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete take",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting take:", error);
      toast({
        title: "Error",
        description: "Failed to delete take",
        variant: "destructive",
      });
    }
  };

  const restoreTake = async (takeId: string) => {
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
              t.id === takeId ? { ...t, ...restoredTake, deletedAt: null } : t,
            ),
          })),
        );
        toast({ title: "Success", description: "Take restored" });
      } else {
        toast({
          title: "Error",
          description: "Failed to restore take",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error restoring take:", error);
      toast({
        title: "Error",
        description: "Failed to restore take",
        variant: "destructive",
      });
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const segmentCount = editedScript
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Project not found</p>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="size-8"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-base font-medium text-foreground">
                {project.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                Segment {currentSegmentIndex + 1} of {segments.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditingScript && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingScript(true)}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Edit3 className="size-3.5" />
                Edit Script
              </Button>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3.5" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Export Project</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-muted-foreground">
                    Export functionality coming soon.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Script Segments List */}
        <div className="w-72 border-r border-border/50 bg-secondary/30 flex flex-col">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-medium">Segments</h2>
            <Badge variant="secondary" className="text-xs font-normal">
              {segments.length}
            </Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {segments.map((segment, index) => (
              <button
                key={segment.id}
                onClick={() => setCurrentSegmentIndex(index)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
                  index === currentSegmentIndex
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="font-mono text-xs opacity-50 mt-0.5 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate flex-1">{segment.text}</span>
                </div>
                {segment.takes.length > 0 && (
                  <div className="mt-1 ml-6 text-xs opacity-50">
                    {segment.takes.filter((t) => !t.deletedAt).length} take
                    {segment.takes.filter((t) => !t.deletedAt).length !== 1
                      ? "s"
                      : ""}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Current Segment & Recording OR Script Editor */}
        <div className="flex-1 flex flex-col bg-background">
          {isEditingScript ? (
            /* Script Editor Mode */
            <div className="flex-1 flex flex-col p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-medium">Edit Script</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Each line becomes a recording segment.{" "}
                    {segmentCount > 0 && (
                      <span className="text-primary">
                        {" "}
                        Will create {segmentCount} segment
                        {segmentCount !== 1 ? "s" : ""}.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveScript}
                    disabled={isSavingScript}
                    size="sm"
                  >
                    <Save className="size-3.5 mr-1.5" />
                    {isSavingScript ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={() => setIsEditingScript(false)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              <Textarea
                value={editedScript}
                onChange={(e) => setEditedScript(e.target.value)}
                placeholder="Paste your script here... Each line will become a separate recording segment."
                className="flex-1 font-mono text-sm leading-relaxed resize-none"
              />
            </div>
          ) : (
            /* Recording Mode */
            <>
              {/* Current Segment Display */}
              <div className="flex-1 flex items-center justify-center p-12">
                {currentSegment ? (
                  <div className="max-w-3xl w-full text-center">
                    <p className="text-3xl font-medium text-foreground leading-relaxed tracking-tight">
                      {currentSegment.text}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center size-12 rounded-full bg-secondary mb-4">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-4">
                      No segments in this project
                    </p>
                    <Button
                      onClick={() => setIsEditingScript(true)}
                      variant="outline"
                      size="sm"
                    >
                      <Edit3 className="size-3.5 mr-1.5" />
                      Add Script
                    </Button>
                  </div>
                )}
              </div>

              {/* Recording Controls */}
              <div className="border-t border-border/50 bg-card/50 px-6 py-5">
                <div className="max-w-xl mx-auto">
                  {/* Waveform */}
                  <LiveWaveform
                    active={isRecording}
                    processing={isTranscribing}
                    height={32}
                    barWidth={2}
                    barGap={1}
                    mode="static"
                    fadeEdges
                    sensitivity={1.2}
                    className="mb-5"
                  />

                  {/* Controls */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCurrentSegmentIndex((i) => Math.max(0, i - 1))
                      }
                      disabled={currentSegmentIndex === 0 || isRecording}
                      className="gap-1"
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>

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

                      {!isRecording ? (
                        <Button
                          onClick={startRecording}
                          disabled={isTranscribing || !currentSegment}
                          size="lg"
                          className={cn(
                            "gap-2 px-8",
                            isTranscribing && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <Mic className="size-4" />
                          {isTranscribing ? "Transcribing..." : "Record"}
                        </Button>
                      ) : (
                        <Button
                          onClick={stopRecording}
                          variant="destructive"
                          size="lg"
                          className="gap-2 px-8 animate-recording-pulse"
                        >
                          <Square className="size-4" />
                          Stop
                        </Button>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCurrentSegmentIndex((i) =>
                          Math.min(segments.length - 1, i + 1),
                        )
                      }
                      disabled={
                        currentSegmentIndex === segments.length - 1 ||
                        isRecording
                      }
                      className="gap-1"
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Takes for Current Segment */}
        {!isEditingScript && (
          <div className="w-80 border-l border-border/50 bg-secondary/30 flex flex-col">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-sm font-medium">Takes</h2>
              <Badge variant="secondary" className="text-xs font-normal">
                {currentSegment?.takes.filter((t) => !t.deletedAt).length || 0}
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!currentSegment?.takes.length ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center size-10 rounded-full bg-secondary mb-3">
                    <Mic className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No takes yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Press space to record
                  </p>
                </div>
              ) : (
                currentSegment.takes.map((take, index) => {
                  const isExpanded = expandedTakes.has(take.id);
                  const isDeleted = !!take.deletedAt;
                  const hasTranscription = !!take.transcription;
                  const hasError = take.transcriptionError && !hasTranscription;
                  const transcriptAlignment = getTakeAlignment(take);
                  const isRetrying = retryingTranscription.has(take.id);

                  const isFocused = focusedTakeIndex === index;

                  return (
                    <div
                      key={take.id}
                      className={cn(
                        "bg-card border rounded-lg overflow-hidden transition-all",
                        isDeleted ? "opacity-60" : "border-border",
                        !isDeleted && "hover:border-primary/20",
                        isFocused && "ring-1 ring-primary border-primary/30",
                      )}
                    >
                      {/* Take Header */}
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              Take{" "}
                              {take.takeNumber ??
                                currentSegment.takes.length - index}
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
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal"
                              >
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
                            onClick={() => playTake(take)}
                            disabled={isDeleted}
                            className="h-7 px-2 text-xs"
                          >
                            {playingTakeId === take.id ? (
                              <Square className="size-3 mr-1" />
                            ) : (
                              <Play className="size-3 mr-1" />
                            )}
                            {playingTakeId === take.id ? "Stop" : "Play"}
                          </Button>

                          {isDeleted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreTake(take.id)}
                              className="h-7 px-2 text-xs"
                            >
                              <RotateCcw className="size-3 mr-1" />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTake(take.id)}
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
                              onClick={() => toggleTakeExpansion(take.id)}
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

                      {/* Expanded Content */}
                      {isExpanded &&
                        !isDeleted &&
                        hasTranscription &&
                        transcriptAlignment && (
                          <div className="px-3 pb-3 border-t border-border/50 pt-2">
                            <TranscriptViewerContainer
                              audioSrc={`/api/recordings/${take.recordingId}`}
                              audioType="audio/wav"
                              alignment={transcriptAlignment}
                              onPlay={() => setPlayingTakeId(take.id)}
                              onPause={() =>
                                setPlayingTakeId((id) =>
                                  id === take.id ? null : id,
                                )
                              }
                              onEnded={() =>
                                setPlayingTakeId((id) =>
                                  id === take.id ? null : id,
                                )
                              }
                              className="space-y-0"
                            >
                              <div className="rounded-md border border-border/50 bg-secondary/50 p-2.5 mb-2">
                                <TranscriptViewerScrubBar
                                  className="w-full"
                                  labelsClassName="text-[10px]"
                                />
                                <TranscriptViewerWords className="text-xs leading-5 mt-2" />
                              </div>
                              <TranscriptViewerAudio
                                className="hidden"
                                data-take-audio-id={take.id}
                              />
                            </TranscriptViewerContainer>
                            {take.confidence !== undefined && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Confidence: {Math.round(take.confidence * 100)}%
                              </p>
                            )}
                          </div>
                        )}

                      {/* Error State */}
                      {hasError && !isDeleted && (
                        <div className="px-3 pb-3 border-t border-border/50 pt-2">
                          <div className="flex items-center gap-1.5 text-amber-600 mb-2">
                            <AlertCircle className="size-3.5" />
                            <span className="text-xs">
                              Transcription failed
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryTranscription(take)}
                            disabled={isRetrying}
                            className="h-7 text-xs"
                          >
                            <RefreshCw
                              className={cn(
                                "size-3 mr-1",
                                isRetrying && "animate-spin",
                              )}
                            />
                            {isRetrying ? "Retrying..." : "Retry"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
