import type { RequestHandler } from "express";
import {
  Effect,
  Schema,
  type ManagedRuntime as ManagedRuntimeType,
} from "effect";
import {
  decodeSchema,
  effectHandler,
  jsonResponse,
  sendResponse,
} from "../effect/http";
import { ExportService, type AudioExportFormat } from "../effect/services";

const ProjectIdParams = Schema.Struct({
  projectId: Schema.String,
});

const ExportAudioBody = Schema.Struct({
  format: Schema.UndefinedOr(Schema.Literal("wav", "mp3", "ogg", "flac")),
});

const DownloadJsonBody = Schema.Struct({
  projectId: Schema.String,
  projectName: Schema.String,
  createdAt: Schema.UndefinedOr(Schema.String),
  segments: Schema.UndefinedOr(Schema.Array(Schema.Unknown)),
});

const CsvSegmentSchema = Schema.Struct({
  label: Schema.String,
  startTime: Schema.Number,
  endTime: Schema.Number,
  color: Schema.UndefinedOr(Schema.String),
});

const DownloadCsvBody = Schema.Struct({
  projectName: Schema.String,
  segments: Schema.Array(CsvSegmentSchema),
});

export function makeExportHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly downloadProjectJSON: RequestHandler;
  readonly downloadProjectCSV: RequestHandler;
  readonly exportProjectAudio: RequestHandler;
  readonly generateExport: RequestHandler;
  readonly getFfmpegStatus: RequestHandler;
} {
  return {
    downloadProjectJSON: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const body = yield* decodeSchema(DownloadJsonBody, request.body);
        const exportedAt = new Date().toISOString();
        const jsonPayload = JSON.stringify(
          {
            projectId: body.projectId,
            projectName: body.projectName,
            createdAt: body.createdAt || exportedAt,
            exportedAt,
            segments: body.segments || [],
          },
          null,
          2,
        );

        return sendResponse(jsonPayload, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${body.projectName}-export-${Date.now()}.json"`,
          },
        });
      }),
    ),
    downloadProjectCSV: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const body = yield* decodeSchema(DownloadCsvBody, request.body);
        const csvRows = body.segments.map((segment) => {
          const duration = segment.endTime - segment.startTime;
          return [
            segment.label,
            segment.startTime.toFixed(2),
            segment.endTime.toFixed(2),
            duration.toFixed(2),
            segment.color || "",
          ]
            .map((cell) => `"${cell}"`)
            .join(",");
        });

        const csvContent = [
          "Label,Start Time (s),End Time (s),Duration (s),Color",
          ...csvRows,
        ].join("\n");

        return sendResponse(csvContent, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${body.projectName}-segments-${Date.now()}.csv"`,
          },
        });
      }),
    ),
    exportProjectAudio: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const body = yield* decodeSchema(ExportAudioBody, request.body || {});
        const exportService = yield* ExportService;
        const format = (body.format ?? "wav") as AudioExportFormat;
        const zipBuffer = yield* exportService.exportProjectAudio(
          params.projectId,
          format,
        );

        return sendResponse(zipBuffer, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="project-audio-${format}.zip"`,
          },
        });
      }),
    ),
    generateExport: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const exportService = yield* ExportService;
        const payload = yield* exportService.generateExportInfo(
          params.projectId,
        );
        return jsonResponse(payload);
      }),
    ),
    getFfmpegStatus: effectHandler(runtime, () =>
      Effect.gen(function* () {
        const exportService = yield* ExportService;
        const isAvailable = yield* exportService.checkFfmpeg();
        return jsonResponse({
          available: isAvailable,
          supportedFormats: isAvailable
            ? ["wav", "mp3", "ogg", "flac"]
            : ["wav"],
        });
      }),
    ),
  };
}
