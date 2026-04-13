import { RequestHandler } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import JSZip from "jszip";
import { db } from "../db";
import { projects, scriptSegments, segmentTakes } from "../schema";
import { eq, and, isNull, asc } from "drizzle-orm";

const RECORDINGS_DIR = path.join(process.cwd(), "recordings");

interface ExportAudioRequest {
  format?: "wav" | "mp3" | "ogg" | "flac";
}

/**
 * Convert audio file using ffmpeg
 */
async function convertAudio(
  inputPath: string,
  outputPath: string,
  format: "wav" | "mp3" | "ogg" | "flac",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = ["-i", inputPath, "-y"];

    // Add format-specific options
    switch (format) {
      case "mp3":
        args.push("-codec:a", "libmp3lame", "-q:a", "2");
        break;
      case "ogg":
        args.push("-codec:a", "libvorbis", "-q:a", "4");
        break;
      case "flac":
        args.push("-codec:a", "flac");
        break;
      case "wav":
      default:
        args.push("-codec:a", "pcm_s16le");
        break;
    }

    args.push(outputPath);

    const ffmpeg = spawn("ffmpeg", args);

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Check if ffmpeg is available
 */
async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"]);
    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Export selected takes as a ZIP file with audio conversion
 */
export const exportProjectAudio: RequestHandler<
  { projectId: string },
  Buffer | { error: string },
  ExportAudioRequest
> = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { format = "wav" } = req.body || {};

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get project
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get all segments with their selected takes
    const segments = await db.query.scriptSegments.findMany({
      where: eq(scriptSegments.projectId, projectId),
      orderBy: asc(scriptSegments.index),
      with: {
        takes: {
          where: and(
            eq(segmentTakes.isSelected, true),
            isNull(segmentTakes.deletedAt),
          ),
        },
      },
    });

    // Filter segments that have selected takes
    const segmentsWithTakes = segments
      .map((segment, index) => ({ segment, take: segment.takes[0], index }))
      .filter((item) => item.take);

    if (segmentsWithTakes.length === 0) {
      return res.status(400).json({ error: "No selected takes to export" });
    }

    // Check if we need ffmpeg (for non-wav formats)
    const needsConversion = format !== "wav";
    let ffmpegAvailable = false;

    if (needsConversion) {
      ffmpegAvailable = await checkFfmpeg();
      if (!ffmpegAvailable) {
        return res.status(500).json({
          error: `ffmpeg is required for ${format} conversion but is not available. Please install ffmpeg or use wav format.`,
        });
      }
    }

    // Create ZIP file
    const zip = new JSZip();
    const projectFolderName = kebabify(project.name);
    const folder = zip.folder(projectFolderName);

    if (!folder) {
      return res.status(500).json({ error: "Failed to create ZIP folder" });
    }

    // Process each segment
    const tempFiles: string[] = [];

    try {
      for (const { segment, take, index } of segmentsWithTakes) {
        const inputPath = take.recordingPath;

        if (!fs.existsSync(inputPath)) {
          console.warn(`Recording file not found: ${inputPath}`);
          continue;
        }

        let audioBuffer: Buffer;
        const outputFileName = `segment-${index + 1}.${format}`;

        if (needsConversion && ffmpegAvailable) {
          // Convert audio using ffmpeg
          const tempOutputPath = path.join(
            RECORDINGS_DIR,
            `temp-${take.recordingId}.${format}`,
          );
          tempFiles.push(tempOutputPath);

          await convertAudio(inputPath, tempOutputPath, format);
          audioBuffer = fs.readFileSync(tempOutputPath);
        } else {
          // Use original wav file
          audioBuffer = fs.readFileSync(inputPath);
        }

        folder.file(outputFileName, audioBuffer);
      }

      // Generate ZIP
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      // Set response headers for ZIP download
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${projectFolderName}-audio-${format}.zip"`,
      );

      res.send(zipBuffer);
    } finally {
      // Clean up temp files
      for (const tempFile of tempFiles) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        } catch (err) {
          console.warn(`Failed to clean up temp file: ${tempFile}`, err);
        }
      }
    }
  } catch (error) {
    console.error("Error exporting project audio:", error);
    res.status(500).json({
      error: `Failed to export audio: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

/**
 * Generate export data for a project
 */
export const generateExport: RequestHandler<
  { projectId: string },
  { segments: number; takes: number; missingSegments: number[] }
> = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        segments: 0,
        takes: 0,
        missingSegments: [],
      });
    }

    // Get all segments with their selected takes
    const segments = await db.query.scriptSegments.findMany({
      where: eq(scriptSegments.projectId, projectId),
      orderBy: asc(scriptSegments.index),
      with: {
        takes: {
          where: and(
            eq(segmentTakes.isSelected, true),
            isNull(segmentTakes.deletedAt),
          ),
        },
      },
    });

    const totalSegments = segments.length;
    const missingSegments: number[] = [];

    segments.forEach((segment, index) => {
      if (segment.takes.length === 0) {
        missingSegments.push(index + 1); // 1-based index
      }
    });

    const takes = segments.filter((s) => s.takes.length > 0).length;

    res.json({
      segments: totalSegments,
      takes,
      missingSegments,
    });
  } catch (error) {
    console.error("Error generating export info:", error);
    res.status(500).json({
      segments: 0,
      takes: 0,
      missingSegments: [],
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
      `attachment; filename="${projectName}-export-${Date.now()}.json"`,
    );

    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error downloading JSON:", error);
    res.status(500).json({
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
      `attachment; filename="${projectName}-segments-${Date.now()}.csv"`,
    );

    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({
      error: `Failed to generate download: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

function kebabify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
