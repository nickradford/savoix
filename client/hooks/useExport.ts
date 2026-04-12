import { useState } from "react";
import { Segment } from "@/components/SegmentTimeline";

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadJSON = async (
    projectName: string,
    segments: Segment[],
    script: string
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
      const errorMessage =
        err instanceof Error ? err.message : "Export failed";
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
      const errorMessage =
        err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      setIsExporting(false);
      return false;
    }
  };

  return { downloadJSON, downloadCSV, isExporting, error };
}
