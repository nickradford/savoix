import { useState, useCallback } from "react";
import type { Segment } from "@/components/SegmentTimeline";
import { useToast } from "@/hooks/use-toast";

export interface FfmpegStatus {
  available: boolean;
  supportedFormats: ("wav" | "mp3" | "ogg" | "flac")[];
}

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const { toast } = useToast();

  const checkFfmpegStatus = useCallback(async (): Promise<FfmpegStatus> => {
    try {
      const response = await fetch("/api/export/ffmpeg-status");
      if (!response.ok) {
        throw new Error("Failed to check ffmpeg status");
      }
      const data = await response.json();
      setFfmpegStatus(data);
      return data;
    } catch (err) {
      console.error("Error checking ffmpeg status:", err);
      const fallback: FfmpegStatus = {
        available: false,
        supportedFormats: ["wav"],
      };
      setFfmpegStatus(fallback);
      return fallback;
    }
  }, []);

  const downloadJSON = async (
    projectName: string,
    segments: Segment[],
    script: string,
  ) => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch("/api/export/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "local",
          projectName,
          createdAt: new Date().toISOString(),
          segments,
          script,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to export JSON");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setIsExporting(false);
      return false;
    }
  };

  const downloadCSV = async (projectName: string, segments: Segment[]) => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          segments,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to export CSV");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}-segments-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setIsExporting(false);
      return false;
    }
  };

  const exportAudio = async (
    projectId: string,
    projectName: string,
    format: "wav" | "mp3" | "ogg" | "flac" = "wav",
  ) => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/export/audio/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to export audio");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kebabify(projectName)}-audio-${format}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Project exported",
        description: "Check your downloads folder",
      });

      setIsExporting(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      toast({
        title: "Export Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsExporting(false);
      return false;
    }
  };

  const getExportInfo = async (projectId: string) => {
    try {
      const response = await fetch(`/api/export/info/${projectId}`);
      if (!response.ok) {
        throw new Error("Failed to get export info");
      }
      return await response.json();
    } catch (err) {
      console.error("Error getting export info:", err);
      return { segments: 0, takes: 0, missingSegments: [] };
    }
  };

  return {
    downloadJSON,
    downloadCSV,
    exportAudio,
    getExportInfo,
    checkFfmpegStatus,
    ffmpegStatus,
    isExporting,
    error,
  };
}

function kebabify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
