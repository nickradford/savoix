import { useState } from "react";
import { TranscriptionResponse } from "@shared/api";

export function useTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribeAudio = async (
    audioBlob: Blob,
  ): Promise<TranscriptionResponse | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      // Convert blob to base64
      const reader = new FileReader();

      return new Promise((resolve) => {
        reader.onloadend = async () => {
          try {
            const base64Audio = reader.result as string;

            // Send to server for transcription
            const response = await fetch("/api/transcribe", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                audioBase64: base64Audio,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              const errorMessage =
                errorData.error ||
                `Server error: ${response.status} ${response.statusText}`;
              setError(errorMessage);
              setIsTranscribing(false);
              resolve(null);
              return;
            }

            const result: TranscriptionResponse = await response.json();

            if (result.error) {
              setError(result.error);
              setIsTranscribing(false);
              resolve(null);
              return;
            }

            setIsTranscribing(false);
            resolve(result);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            console.error("Transcription request error:", errorMessage);
            setError(errorMessage);
            setIsTranscribing(false);
            resolve(null);
          }
        };

        reader.onerror = () => {
          setError("Failed to read audio file");
          setIsTranscribing(false);
          resolve(null);
        };

        reader.readAsDataURL(audioBlob);
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Transcription error:", errorMessage);
      setError(errorMessage);
      setIsTranscribing(false);
      return null;
    }
  };

  return { transcribeAudio, isTranscribing, error };
}
