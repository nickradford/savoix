import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Zap } from "lucide-react";

interface TranscriptionComparisonProps {
  originalScript: string;
  transcribedText: string;
  onChange: (text: string) => void;
  onTranscribe?: () => Promise<void>;
  isTranscribing?: boolean;
  accuracy?: number;
}

export function TranscriptionComparison({
  originalScript,
  transcribedText,
  onChange,
  onTranscribe,
  isTranscribing = false,
  accuracy,
}: TranscriptionComparisonProps) {
  const [compareMode, setCompareMode] = useState<"editor" | "comparison">(
    "editor"
  );

  const highlightDifferences = (original: string, transcribed: string) => {
    const originalWords = original.toLowerCase().split(/\s+/);
    const transcribedWords = transcribed.toLowerCase().split(/\s+/);

    const matches = originalWords.filter((word) =>
      transcribedWords.includes(word)
    );
    const accuracy =
      originalWords.length > 0
        ? ((matches.length / originalWords.length) * 100).toFixed(1)
        : "0";

    return accuracy;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcribedText);
  };

  return (
    <div className="flex flex-col bg-white border border-border rounded-lg overflow-hidden h-full">
      <div className="px-6 py-4 border-b border-border bg-gray-50">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-foreground">Transcription</h2>
          {accuracy !== undefined && (
            <div className="text-sm">
              <span className="text-accent font-semibold">
                {accuracy}% match
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCompareMode("editor")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              compareMode === "editor"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-gray-100"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setCompareMode("comparison")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              compareMode === "comparison"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-gray-100"
            }`}
          >
            Comparison
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {compareMode === "editor" ? (
          <div className="flex flex-col h-full">
            <textarea
              value={transcribedText}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Click 'Transcribe' to convert your audio recording to text using browser speech recognition..."
              className="flex-1 resize-none border-0 focus:outline-none focus:ring-0 text-sm leading-relaxed"
            />
            {transcribedText && (
              <div className="text-xs text-muted-foreground p-2 border-t border-border">
                {transcribedText.split(/\s+/).length} words
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Original Script
              </h3>
              <div className="text-sm leading-relaxed text-foreground p-3 bg-gray-50 rounded">
                {originalScript || "No script provided"}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Transcribed Text
              </h3>
              <div className="text-sm leading-relaxed text-foreground p-3 bg-blue-50 border border-blue-200 rounded">
                {transcribedText || "No transcription yet"}
              </div>
            </div>
            {originalScript && transcribedText && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                  Accuracy Analysis
                </h3>
                <div className="text-sm text-muted-foreground p-3 bg-gray-50 rounded">
                  <p>
                    Match Rate:{" "}
                    <span className="text-accent font-semibold">
                      {highlightDifferences(originalScript, transcribedText)}%
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-gray-50 p-4 flex gap-2">
        {onTranscribe && (
          <Button
            onClick={onTranscribe}
            size="sm"
            className="gap-2 flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={isTranscribing}
          >
            <Zap className="w-4 h-4" />
            {isTranscribing ? "Transcribing..." : "Transcribe"}
          </Button>
        )}
        <Button
          onClick={copyToClipboard}
          variant="outline"
          size="sm"
          className="gap-2 flex-1"
          disabled={!transcribedText}
        >
          <Copy className="w-4 h-4" />
          Copy
        </Button>
      </div>
    </div>
  );
}
