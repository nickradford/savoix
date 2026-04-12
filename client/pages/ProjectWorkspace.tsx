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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
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

const SAMPLE_RATE = 16000;

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

type TranscriptIssueKind =
  | "mismatch"
  | "insertion"
  | "contraction"
  | "skip-anchor";

type TranscriptWordDiagnostic = {
  issue?: TranscriptIssueKind;
  expected?: string;
  skippedExpectedBefore?: string[];
};

type TranscriptHeuristicAnalysis = {
  confidence: number;
  diagnostics: Map<number, TranscriptWordDiagnostic>;
  trailingSkippedWords: string[];
};

function parseTakeWords(words: string | undefined): TimestampedWord[] {
  if (!words) return [];

  try {
    const parsed = JSON.parse(words);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse take words:", error);
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
  return canonicalizeWord(left).replace(/'/g, "") === canonicalizeWord(right).replace(/'/g, "");
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

  if (irregularMap[canonical]) {
    return irregularMap[canonical];
  }

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

function matchesExpandedSequence(sourceWord: string, comparisonWords: string[]): boolean {
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

function upsertDiagnostic(
  diagnostics: Map<number, TranscriptWordDiagnostic>,
  actualWordIndex: number,
  update: Partial<TranscriptWordDiagnostic>,
) {
  const existing = diagnostics.get(actualWordIndex) ?? {};
  diagnostics.set(actualWordIndex, {
    ...existing,
    ...update,
    skippedExpectedBefore: update.skippedExpectedBefore
      ? [
          ...(existing.skippedExpectedBefore ?? []),
          ...update.skippedExpectedBefore,
        ]
      : existing.skippedExpectedBefore,
  });
}

function analyzeTranscriptAgainstSegment(
  expectedText: string,
  actualText: string | undefined,
): TranscriptHeuristicAnalysis | null {
  const expectedWords = splitTranscriptWords(expectedText);
  const actualWords = splitTranscriptWords(actualText);

  if (!expectedWords.length || !actualWords.length) return null;

  const diagnostics = new Map<number, TranscriptWordDiagnostic>();
  const trailingSkippedWords: string[] = [];

  let expectedIndex = 0;
  let actualIndex = 0;
  let mismatchCount = 0;
  let insertionCount = 0;
  let skippedCount = 0;
  let contractionCount = 0;

  while (expectedIndex < expectedWords.length && actualIndex < actualWords.length) {
    const expectedWord = expectedWords[expectedIndex];
    const actualWord = actualWords[actualIndex];

    if (wordsEquivalent(expectedWord, actualWord)) {
      expectedIndex++;
      actualIndex++;
      continue;
    }

    if (
      matchesExpandedSequence(actualWord, expectedWords.slice(expectedIndex, expectedIndex + 2))
    ) {
      upsertDiagnostic(diagnostics, actualIndex, {
        issue: "contraction",
        expected: `${expectedWords[expectedIndex]} ${expectedWords[expectedIndex + 1]}`,
      });
      contractionCount++;
      expectedIndex += 2;
      actualIndex++;
      continue;
    }

    if (
      matchesExpandedSequence(expectedWord, actualWords.slice(actualIndex, actualIndex + 2))
    ) {
      upsertDiagnostic(diagnostics, actualIndex, {
        issue: "contraction",
        expected: expectedWord,
      });
      upsertDiagnostic(diagnostics, actualIndex + 1, {
        issue: "contraction",
        expected: expectedWord,
      });
      contractionCount++;
      expectedIndex++;
      actualIndex += 2;
      continue;
    }

    if (
      expectedIndex + 1 < expectedWords.length &&
      wordsEquivalent(expectedWords[expectedIndex + 1], actualWord)
    ) {
      upsertDiagnostic(diagnostics, actualIndex, {
        issue: "skip-anchor",
        skippedExpectedBefore: [expectedWord],
      });
      skippedCount++;
      expectedIndex++;
      continue;
    }

    if (
      actualIndex + 1 < actualWords.length &&
      wordsEquivalent(expectedWord, actualWords[actualIndex + 1])
    ) {
      upsertDiagnostic(diagnostics, actualIndex, {
        issue: "insertion",
        expected: expectedWord,
      });
      insertionCount++;
      actualIndex++;
      continue;
    }

    upsertDiagnostic(diagnostics, actualIndex, {
      issue: "mismatch",
      expected: expectedWord,
    });
    mismatchCount++;
    expectedIndex++;
    actualIndex++;
  }

  while (expectedIndex < expectedWords.length) {
    trailingSkippedWords.push(expectedWords[expectedIndex]);
    skippedCount++;
    expectedIndex++;
  }

  while (actualIndex < actualWords.length) {
    upsertDiagnostic(diagnostics, actualIndex, {
      issue: "insertion",
    });
    insertionCount++;
    actualIndex++;
  }

  const denominator = Math.max(expectedWords.length, actualWords.length, 1);
  const weightedPenalty =
    mismatchCount + skippedCount + insertionCount * 0.75 + contractionCount * 0.25;
  const confidence = clamp(1 - weightedPenalty / denominator, 0, 1);

  return {
    confidence,
    diagnostics,
    trailingSkippedWords,
  };
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

      if (!text || start === null) {
        return null;
      }

      return {
        text,
        start,
        end: end ?? start + 0.01,
      };
    })
    .filter(
      (
        word,
      ): word is {
        text: string;
        start: number;
        end: number;
      } => word !== null,
    );

  if (!normalizedWords.length) return null;

  let cursor = 0;
  let previousEnd = 0;

  for (const word of normalizedWords) {
    const tokenStartIndex = transcription.indexOf(word.text, cursor);
    if (tokenStartIndex === -1) {
      return null;
    }

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
  take: Pick<SegmentTake, "words" | "transcription" | "audioDuration" | "duration">,
): CharacterAlignmentResponseModel | null {
  const timedAlignment = buildAlignmentFromTimedWords(
    take.transcription,
    parseTakeWords(take.words),
  );
  if (timedAlignment) return timedAlignment;

  return buildEstimatedAlignment(
    take.transcription,
    (take.audioDuration ?? 0) > 0 ? take.audioDuration ?? 0 : take.duration / 1000,
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

  // Keyboard-driven take focus
  const [focusedTakeIndex, setFocusedTakeIndex] = useState<number>(-1);

  // Recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch project and segments
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

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Reset focused take when switching segments
  useEffect(() => {
    setFocusedTakeIndex(-1);
  }, [currentSegmentIndex]);

  // Auto-play take when navigating with keyboard
  useEffect(() => {
    const takes = segments[currentSegmentIndex]?.takes;
    if (!takes || focusedTakeIndex < 0 || focusedTakeIndex >= takes.length) return;
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
          e.preventDefault();
          if (playingTakeId) {
            stopPlayback();
            break;
          }

          {
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
  }, [segments, currentSegmentIndex, isRecording, isTranscribing, isEditingScript]);

  const currentSegment = segments[currentSegmentIndex];

  const toggleTakeExpansion = (takeId: string) => {
    setExpandedTakes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(takeId)) {
        newSet.delete(takeId);
      } else {
        newSet.add(takeId);
      }
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

        // Update segments with new transcription
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
          toast({
            title: "Success",
            description: "Transcription completed",
          });
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

  const handleCancelEdit = () => {
    setEditedScript(project?.script || "");
    setIsEditingScript(false);
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
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const base64Audio = reader.result as string;

        // Send to server for transcription and save take
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

          // Update segments with new take
          setSegments((prev) =>
            prev.map((seg) =>
              seg.id === currentSegment.id
                ? { ...seg, takes: [take, ...seg.takes] }
                : seg,
            ),
          );

          // Auto-expand the new take if it has transcription or error
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
    if (take.deletedAt) {
      return;
    }

    const transcriptAudio = document.querySelector<HTMLAudioElement>(
      `[data-take-audio-id="${take.id}"]`,
    );

    if (transcriptAudio) {
      const isCurrentTakePlaying = playingTakeId === take.id && !transcriptAudio.paused;
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
        .then(() => {
          setPlayingTakeId(take.id);
        })
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

    // Construct URL to serve the audio file
    const audio = new Audio(`/api/recordings/${take.recordingId}`);
    audioRef.current = audio;

    audio.onended = () => {
      setPlayingTakeId(null);
    };

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
      .then(() => {
        setPlayingTakeId(take.id);
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Could not play audio file",
          variant: "destructive",
        });
      });
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
                ? {
                    ...t,
                    deletedAt: new Date().toISOString(),
                  }
                : t,
            ),
          })),
        );

        setExpandedTakes((prev) => {
          const next = new Set(prev);
          next.delete(takeId);
          return next;
        });
        setFocusedTakeIndex((currentIndex) => {
          const takes = segments[currentSegmentIndex]?.takes;
          if (!takes || currentIndex < 0 || currentIndex >= takes.length) {
            return currentIndex;
          }

          return takes[currentIndex]?.id === takeId ? -1 : currentIndex;
        });
        if (playingTakeId === takeId) {
          stopPlayback();
        }

        toast({
          title: "Success",
          description: "Take deleted",
        });
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

        toast({
          title: "Success",
          description: "Take restored",
        });
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

  const goToNextSegment = () => {
    if (currentSegmentIndex < segments.length - 1) {
      setCurrentSegmentIndex((prev) => prev + 1);
    }
  };

  const goToPrevSegment = () => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex((prev) => prev - 1);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate segment count from edited script
  const segmentCount = editedScript
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Project not found</p>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
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
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {project.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Segment {currentSegmentIndex + 1} of {segments.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditingScript ? (
              <Button
                variant="outline"
                onClick={() => setIsEditingScript(true)}
                className="gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit Script
              </Button>
            ) : null}

            <ThemeToggle />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
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
        <div className="w-80 border-r border-border bg-secondary flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between">
            <h2 className="font-semibold text-sm">Script Segments</h2>
            <span className="text-xs text-muted-foreground">
              {segments.length} total
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {segments.map((segment, index) => (
              <button
                key={segment.id}
                onClick={() => setCurrentSegmentIndex(index)}
                className={cn(
                  "w-full text-left p-3 rounded-lg text-sm transition-colors",
                  index === currentSegmentIndex
                    ? "bg-accent text-accent-foreground"
                    : "bg-card hover:bg-accent/50",
                  segment.takes.length > 0 && "border-l-4 border-green-500",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs opacity-60">
                    {index + 1}
                  </span>
                  <span className="truncate">{segment.text}</span>
                </div>
                {segment.takes.length > 0 && (
                  <div className="mt-1 text-xs opacity-60">
                    {segment.takes.length} take
                    {segment.takes.length > 1 ? "s" : ""}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Current Segment & Recording OR Script Editor */}
        <div className="flex-1 flex flex-col">
          {isEditingScript ? (
            /* Script Editor Mode */
            <div className="flex-1 flex flex-col p-6 bg-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Edit Script</h2>
                  <p className="text-sm text-muted-foreground">
                    Each line becomes a recording segment.{" "}
                    {segmentCount > 0 && (
                      <span className="text-accent">
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
                    className="gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingScript ? "Saving..." : "Save Script"}
                  </Button>
                  <Button
                    onClick={handleCancelEdit}
                    variant="outline"
                    className="gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                </div>
              </div>

              <textarea
                value={editedScript}
                onChange={(e) => setEditedScript(e.target.value)}
                placeholder="Paste your script here... Each line will become a separate recording segment."
                className="flex-1 w-full p-4 border border-border rounded-lg resize-none font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          ) : (
            /* Recording Mode */
            <>
              {/* Current Segment Display */}
              <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-b from-card to-secondary">
                {currentSegment ? (
                  <div className="max-w-3xl w-full text-center">
                    <p className="text-4xl font-medium text-foreground leading-relaxed">
                      {currentSegment.text}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-muted-foreground mb-4">
                      No segments in this project
                    </p>
                    <Button
                      onClick={() => setIsEditingScript(true)}
                      variant="outline"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Add Script
                    </Button>
                  </div>
                )}
              </div>

              {/* Recording Controls */}
              <div className="border-t border-border bg-card p-6">
                <div className="max-w-2xl mx-auto">
                  {/* Navigation */}
                  <div className="flex items-center justify-between mb-6">
                    <Button
                      variant="outline"
                      onClick={goToPrevSegment}
                      disabled={currentSegmentIndex === 0 || isRecording}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>

                    <div className="text-center">
                      {isRecording && (
                        <p className="text-lg font-semibold text-red-600">
                          {formatTime(recordingTime)}
                        </p>
                      )}
                      {isTranscribing && (
                        <p className="text-sm text-muted-foreground">
                          Transcribing...
                        </p>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      onClick={goToNextSegment}
                      disabled={
                        currentSegmentIndex === segments.length - 1 ||
                        isRecording
                      }
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Waveform */}
                  <LiveWaveform
                    active={isRecording}
                    processing={isTranscribing}
                    height={40}
                    barWidth={2}
                    barGap={1}
                    mode="static"
                    fadeEdges
                    sensitivity={1.2}
                    className="mb-4"
                  />

                  {/* Record Button */}
                  <div className="flex justify-center">
                    {!isRecording ? (
                      <Button
                        onClick={startRecording}
                        disabled={isTranscribing || !currentSegment}
                        className="gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-lg"
                      >
                        <Mic className="w-5 h-5" />
                        {isTranscribing ? "Transcribing..." : "Record Take"}
                      </Button>
                    ) : (
                      <Button
                        onClick={stopRecording}
                        className="gap-2 bg-neutral-700 hover:bg-neutral-800 text-white px-8 py-6 text-lg"
                      >
                        <Square className="w-5 h-5" />
                        Stop Recording
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Takes for Current Segment (only show in recording mode) */}
        {!isEditingScript && (
          <div className="w-96 border-l border-border bg-secondary flex flex-col">
            <div className="px-4 py-3 border-b border-border bg-card">
              <h2 className="font-semibold text-sm">
                Takes for Segment {currentSegmentIndex + 1}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {currentSegment?.takes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No takes recorded yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click Record Take to start.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentSegment?.takes.map((take, index) => {
                    const isExpanded = expandedTakes.has(take.id);
                    const isRetrying = retryingTranscription.has(take.id);
                    const isDeleted = !!take.deletedAt;
                    const hasTranscription = !!take.transcription;
                    const hasError =
                      take.transcriptionError && !hasTranscription;
                    const transcriptAlignment = getTakeAlignment(take);
                    const transcriptAnalysis = analyzeTranscriptAgainstSegment(
                      currentSegment.text,
                      take.transcription,
                    );
                    const displayConfidence =
                      transcriptAnalysis?.confidence ?? take.confidence;
                    const cardClassName = cn(
                      "bg-card rounded-lg border overflow-hidden",
                      isDeleted && "opacity-70",
                      focusedTakeIndex === index
                        ? "border-primary ring-1 ring-primary"
                        : "border-border",
                    );
                    const headerContent = (
                      <div className="p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              Take {take.takeNumber ?? currentSegment.takes.length - index}
                            </p>
                            {hasTranscription && (
                              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                                Transcribed
                              </span>
                            )}
                            {isDeleted && (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                Deleted
                              </span>
                            )}
                            {hasError && (
                              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                No transcription
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(getTakeDurationMs(take))} •{" "}
                            {new Date(take.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => playTake(take)}
                            className="h-8 w-8 p-0"
                            disabled={isDeleted}
                          >
                            {playingTakeId === take.id ? (
                              <Square className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          {isDeleted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreTake(take.id)}
                              className="h-8 w-8 p-0 text-foreground"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTake(take.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!isDeleted) {
                                toggleTakeExpansion(take.id);
                              }
                            }}
                            className="h-8 w-8 p-0"
                            disabled={isDeleted}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                    const expandedContent = isExpanded && !isDeleted && (
                      <div className="px-3 pb-3 border-t border-border pt-2">
                        {hasTranscription ? (
                          <div className="space-y-3">
                            {transcriptAlignment ? (
                              <div className="space-y-3 rounded-md border border-border bg-background p-3">
                                <TranscriptViewerScrubBar
                                  className="w-full"
                                  labelsClassName="text-[10px]"
                                />
                                <TranscriptViewerWords
                                  className="text-sm leading-6"
                                  renderWord={({ word, status }) => {
                                    const diagnostic = transcriptAnalysis?.diagnostics.get(
                                      word.wordIndex,
                                    );
                                    const titleParts: string[] = [];

                                    if (diagnostic?.expected) {
                                      titleParts.push(`Expected: ${diagnostic.expected}`);
                                    }

                                    if (diagnostic?.skippedExpectedBefore?.length) {
                                      titleParts.push(
                                        `Missing before this: ${diagnostic.skippedExpectedBefore.join(", ")}`,
                                      );
                                    }

                                    return (
                                      <TranscriptViewerWord
                                        word={word}
                                        status={status}
                                        className={cn(
                                          diagnostic?.issue === "mismatch" &&
                                            "bg-red-100 text-red-900 decoration-red-500/80 underline decoration-2 underline-offset-4",
                                          diagnostic?.issue === "insertion" &&
                                            "bg-amber-100 text-amber-900 decoration-amber-500/80 underline decoration-2 underline-offset-4",
                                          diagnostic?.issue === "contraction" &&
                                            "bg-yellow-100 text-yellow-900 decoration-yellow-500/80 underline decoration-2 underline-offset-4",
                                          diagnostic?.issue === "skip-anchor" &&
                                            "ring-1 ring-red-300",
                                        )}
                                        title={
                                          titleParts.length > 0
                                            ? titleParts.join(" • ")
                                            : undefined
                                        }
                                      />
                                    );
                                  }}
                                />
                                {transcriptAnalysis?.trailingSkippedWords.length ? (
                                  <p className="text-xs text-red-700">
                                    Missing at end:{" "}
                                    {transcriptAnalysis.trailingSkippedWords.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">
                                  Transcription:
                                </p>
                                <p className="text-sm italic text-foreground">
                                  &quot;{take.transcription}&quot;
                                </p>
                              </div>
                            )}
                            {displayConfidence !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                Confidence: {Math.round(displayConfidence * 100)}%
                              </p>
                            )}
                          </div>
                        ) : hasError ? (
                          <div>
                            <div className="flex items-center gap-2 text-amber-600 mb-2">
                              <AlertCircle className="w-4 h-4" />
                              <p className="text-sm">Transcription failed</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryTranscription(take)}
                              disabled={isRetrying}
                              className="gap-2"
                            >
                              <RefreshCw
                                className={cn(
                                  "w-4 h-4",
                                  isRetrying && "animate-spin",
                                )}
                              />
                              {isRetrying
                                ? "Retrying..."
                                : "Retry Transcription"}
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-muted-foreground mb-2">
                              No transcription available.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryTranscription(take)}
                              disabled={isRetrying}
                              className="gap-2"
                            >
                              <RefreshCw
                                className={cn(
                                  "w-4 h-4",
                                  isRetrying && "animate-spin",
                                )}
                              />
                              {isRetrying ? "Transcribing..." : "Transcribe Now"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );

                    if (transcriptAlignment) {
                      return (
                        <TranscriptViewerContainer
                          key={take.id}
                          audioSrc={`/api/recordings/${take.recordingId}`}
                          audioType="audio/wav"
                          alignment={transcriptAlignment}
                          onPlay={() => setPlayingTakeId(take.id)}
                          onPause={() =>
                            setPlayingTakeId((currentId) =>
                              currentId === take.id ? null : currentId,
                            )
                          }
                          onEnded={() =>
                            setPlayingTakeId((currentId) =>
                              currentId === take.id ? null : currentId,
                            )
                          }
                          className={cn("space-y-0 p-0", cardClassName)}
                        >
                          {headerContent}
                          {expandedContent}
                          <TranscriptViewerAudio
                            className="hidden"
                            data-take-audio-id={take.id}
                            onError={() => {
                              toast({
                                title: "Error",
                                description: "Could not play audio file",
                                variant: "destructive",
                              });
                              setPlayingTakeId((currentId) =>
                                currentId === take.id ? null : currentId,
                              );
                            }}
                          />
                        </TranscriptViewerContainer>
                      );
                    }

                    return (
                      <div
                        key={take.id}
                        className={cardClassName}
                      >
                        {headerContent}
                        {expandedContent}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
