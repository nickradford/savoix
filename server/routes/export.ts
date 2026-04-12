import { RequestHandler } from "express";

interface ExportData {
  projectId: string;
  projectName: string;
  createdAt: string;
  segments: Array<{
    id: string;
    label: string;
    startTime: number;
    endTime: number;
    color?: string;
  }>;
}

/**
 * Generate export data for a project
 */
export const generateExport: RequestHandler<
  { projectId: string },
  ExportData
> = (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        projectId: "",
        projectName: "",
        createdAt: "",
        segments: [],
      });
    }

    // Get project data from request body or query
    const { projectName, segments, createdAt } = req.body || {};

    if (!projectName) {
      return res.status(400).json({
        projectId,
        projectName: "",
        createdAt: "",
        segments: [],
      });
    }

    // Format export data
    const exportData: ExportData = {
      projectId,
      projectName,
      createdAt: createdAt || new Date().toISOString(),
      segments: segments || [],
    };

    res.json(exportData);
  } catch (error) {
    console.error("Error generating export:", error);
    res.status(500).json({
      projectId: "",
      projectName: "",
      createdAt: "",
      segments: [],
    });
  }
};

/**
 * Download project data as JSON
 */
export const downloadProjectJSON: RequestHandler = (req, res) => {
  try {
    const { projectId, projectName, segments, createdAt } = req.body;

    if (!projectId || !projectName) {
      return res
        .status(400)
        .json({ error: "projectId and projectName are required" });
    }

    const data = {
      projectId,
      projectName,
      createdAt: createdAt || new Date().toISOString(),
      exportedAt: new Date().toISOString(),
      segments: segments || [],
    };

    // Set response headers for JSON download
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName}-export-${Date.now()}.json"`
    );

    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error downloading JSON:", error);
    res
      .status(500)
      .json({
        error: `Failed to generate download: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
  }
};

/**
 * Download project metadata as CSV
 */
export const downloadProjectCSV: RequestHandler = (req, res) => {
  try {
    const { projectName, segments } = req.body;

    if (!projectName || !Array.isArray(segments)) {
      return res
        .status(400)
        .json({ error: "projectName and segments array are required" });
    }

    // Generate CSV content
    let csvContent = "Label,Start Time (s),End Time (s),Duration (s),Color\n";

    segments.forEach((segment: any) => {
      const duration = segment.endTime - segment.startTime;
      const row = [
        segment.label,
        segment.startTime.toFixed(2),
        segment.endTime.toFixed(2),
        duration.toFixed(2),
        segment.color || "",
      ];
      csvContent += row.map((cell) => `"${cell}"`).join(",") + "\n";
    });

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${projectName}-segments-${Date.now()}.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res
      .status(500)
      .json({
        error: `Failed to generate download: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
  }
};
