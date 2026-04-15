import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { RequestHandler } from "express";
import { afterEach, describe, expect, it } from "vitest";
import httpMocks from "node-mocks-http";
import { Effect } from "effect";
import { createAppRuntime } from "./effect/runtime";
import {
  type TranscriptionClientShape,
  type TranscriptionResult,
} from "./effect/services";
import { ExternalServiceError } from "./effect/errors";
import { makeProjectHandlers } from "./routes/projects";
import { makeScriptSegmentHandlers } from "./routes/script-segments";
import { makeTakeHandlers } from "./routes/takes";
import { makeExportHandlers } from "./routes/export";
import { makeTranscriptionHandlers } from "./routes/transcription";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "effect-backend-"));
}

function createFakeTranscriptionClient(state: {
  mode: "success" | "failure";
  result?: TranscriptionResult;
  errorMessage?: string;
}): TranscriptionClientShape {
  return {
    transcribe: () =>
      state.mode === "success"
        ? Effect.succeed(
            state.result ?? {
              text: "Default take",
              words: JSON.stringify([{ word: "Default" }]),
              segments: JSON.stringify([{ text: "Default take" }]),
              audioDuration: 1.2,
            },
          )
        : Effect.fail(
            new ExternalServiceError({
              message: state.errorMessage ?? "Transcription failed",
            }),
          ),
  };
}

async function startHandlers(options?: {
  readonly ffmpegBinary?: string;
  readonly transcriptionClient?: TranscriptionClientShape;
}) {
  const workspaceDir = makeTempDir();
  const runtime = createAppRuntime({
    config: {
      dbPath: path.join(workspaceDir, "data", "app.db"),
      recordingsDir: path.join(workspaceDir, "recordings"),
      ffmpegBinary: options?.ffmpegBinary ?? "ffmpeg",
    },
    services: {
      transcriptionClient: options?.transcriptionClient,
    },
  });

  return {
    projects: makeProjectHandlers(runtime),
    scriptSegments: makeScriptSegmentHandlers(runtime),
    takes: makeTakeHandlers(runtime),
    exports: makeExportHandlers(runtime),
    transcription: makeTranscriptionHandlers(runtime),
    close: async () => {
      await runtime.dispose();
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    },
  };
}

async function invokeHandler(
  handler: RequestHandler,
  options: {
    readonly method?: string;
    readonly url: string;
    readonly params?: Record<string, string>;
    readonly body?: unknown;
  },
) {
  const request = httpMocks.createRequest({
    method: (options.method ?? "GET") as any,
    url: options.url,
    params: options.params,
    body: options.body,
    headers: {
      "content-type": "application/json",
    },
  });
  const response = httpMocks.createResponse({
    eventEmitter: EventEmitter,
  });

  await new Promise<void>((resolve, reject) => {
    response.on("end", resolve);
    handler(request, response, (error) => {
      if (error) {
        reject(error);
      }
    });
  });

  const contentType = response.getHeader("content-type");
  const isJson =
    typeof contentType === "string" && contentType.includes("application/json");
  const rawData = response._getData();
  const buffer = Buffer.isBuffer(rawData)
    ? rawData
    : rawData instanceof Uint8Array
      ? Buffer.from(rawData)
      : typeof rawData === "string"
        ? Buffer.from(rawData)
        : typeof response._getBuffer === "function"
          ? response._getBuffer()
          : null;

  return {
    status: response.statusCode,
    headers: response.getHeaders(),
    body: isJson ? response._getJSONData() : rawData,
    buffer,
  };
}

const audioBase64 =
  "data:audio/wav;base64," + Buffer.from("fake-wav-audio").toString("base64");

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("effect backend route handlers", () => {
  it("returns normalized validation errors", async () => {
    const handlers = await startHandlers();
    cleanups.push(handlers.close);

    const response = await invokeHandler(handlers.projects.createProject, {
      method: "POST",
      url: "/api/projects",
      body: { description: "missing-name" },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
      },
    });
  });

  it("handles project CRUD, segments, takes, export info, recording streaming, and wav export", async () => {
    const handlers = await startHandlers({
      transcriptionClient: createFakeTranscriptionClient({
        mode: "success",
        result: {
          text: "First take",
          words: JSON.stringify([{ word: "First", start: 0, end: 0.5 }]),
          segments: JSON.stringify([{ text: "First take", start: 0, end: 1.2 }]),
          audioDuration: 1.2,
        },
      }),
    });
    cleanups.push(handlers.close);

    const createProject = await invokeHandler(handlers.projects.createProject, {
      method: "POST",
      url: "/api/projects",
      body: {
        name: "Test Project",
        description: "demo",
        script: "Line one\nLine two",
      },
    });
    expect(createProject.status).toBe(201);
    const projectId = createProject.body.id as string;

    const getProject = await invokeHandler(handlers.projects.getProject, {
      url: `/api/projects/${projectId}`,
      params: { id: projectId },
    });
    expect(getProject.status).toBe(200);
    expect(getProject.body.segments).toHaveLength(2);

    const updateSegments = await invokeHandler(
      handlers.scriptSegments.updateScriptSegments,
      {
        method: "POST",
        url: `/api/projects/${projectId}/segments`,
        params: { projectId },
        body: { script: "Line one\nLine two\nLine three" },
      },
    );
    expect(updateSegments.status).toBe(200);
    expect(updateSegments.body).toHaveLength(3);

    const segmentId = updateSegments.body[0].id as string;
    const recordTake = await invokeHandler(handlers.transcription.recordSegmentTake, {
      method: "POST",
      url: `/api/segments/${segmentId}/takes`,
      params: { segmentId },
      body: {
        audioBase64,
        duration: 1000,
      },
    });
    expect(recordTake.status).toBe(201);
    expect(recordTake.body.transcription).toBe("First take");
    expect(recordTake.body.transcriptionError).toBeUndefined();

    const takeId = recordTake.body.id as string;
    const recordingId = recordTake.body.recordingId as string;

    const takeList = await invokeHandler(handlers.scriptSegments.getSegmentTakes, {
      url: `/api/segments/${segmentId}/takes`,
      params: { segmentId },
    });
    expect(takeList.status).toBe(200);
    expect(takeList.body).toHaveLength(1);

    const selectTake = await invokeHandler(handlers.takes.selectTake, {
      method: "POST",
      url: `/api/takes/${takeId}/select`,
      params: { takeId },
      body: { isSelected: true },
    });
    expect(selectTake.status).toBe(200);
    expect(selectTake.body.isSelected).toBe(true);

    const exportInfo = await invokeHandler(handlers.exports.generateExport, {
      url: `/api/export/info/${projectId}`,
      params: { projectId },
    });
    expect(exportInfo.status).toBe(200);
    expect(exportInfo.body).toEqual({
      segments: 3,
      takes: 1,
      missingSegments: [2, 3],
    });

    const recordingResponse = await invokeHandler(handlers.takes.getRecording, {
      url: `/api/recordings/${recordingId}`,
      params: { recordingId },
    });
    expect(recordingResponse.status).toBe(200);
    expect(recordingResponse.headers["content-type"]).toContain("audio/wav");
    expect(recordingResponse.buffer?.byteLength).toBeGreaterThan(0);

    const exportAudio = await invokeHandler(handlers.exports.exportProjectAudio, {
      method: "POST",
      url: `/api/export/audio/${projectId}`,
      params: { projectId },
      body: { format: "wav" },
    });
    expect(exportAudio.status).toBe(200);
    expect(exportAudio.headers["content-type"]).toContain("application/zip");
    expect(exportAudio.buffer?.byteLength).toBeGreaterThan(0);

    const deleteTake = await invokeHandler(handlers.takes.deleteTake, {
      method: "DELETE",
      url: `/api/takes/${takeId}`,
      params: { takeId },
    });
    expect(deleteTake.status).toBe(204);

    const restoreTake = await invokeHandler(handlers.takes.restoreTake, {
      method: "POST",
      url: `/api/takes/${takeId}/restore`,
      params: { takeId },
    });
    expect(restoreTake.status).toBe(200);
    expect(restoreTake.body.deletedAt).toBeNull();
    expect(restoreTake.body.id).toBe(takeId);
  });

  it("retries transcription and surfaces both failure and success", async () => {
    const transcriptionState: {
      mode: "success" | "failure";
      result: TranscriptionResult;
      errorMessage: string;
    } = {
      mode: "success",
      result: {
        text: "Initial take",
        words: JSON.stringify([]),
        segments: JSON.stringify([]),
        audioDuration: 1.1,
      },
      errorMessage: "Transcription failed again",
    };

    const handlers = await startHandlers({
      transcriptionClient: createFakeTranscriptionClient(transcriptionState),
    });
    cleanups.push(handlers.close);

    const createProject = await invokeHandler(handlers.projects.createProject, {
      method: "POST",
      url: "/api/projects",
      body: {
        name: "Retry Project",
        script: "Retry line",
      },
    });
    const getProject = await invokeHandler(handlers.projects.getProject, {
      url: `/api/projects/${createProject.body.id}`,
      params: { id: createProject.body.id },
    });
    const segmentId = getProject.body.segments[0].id as string;

    const take = await invokeHandler(handlers.transcription.recordSegmentTake, {
      method: "POST",
      url: `/api/segments/${segmentId}/takes`,
      params: { segmentId },
      body: {
        audioBase64,
        duration: 900,
      },
    });
    const takeId = take.body.id as string;

    transcriptionState.mode = "failure";
    const failedRetry = await invokeHandler(handlers.takes.retryTakeTranscription, {
      method: "POST",
      url: `/api/takes/${takeId}/transcribe`,
      params: { takeId },
    });
    expect(failedRetry.status).toBe(200);
    expect(failedRetry.body.transcriptionError).toContain("Transcription failed");

    transcriptionState.mode = "success";
    transcriptionState.result = {
      text: "Recovered take",
      words: JSON.stringify([]),
      segments: JSON.stringify([]),
      audioDuration: 1.5,
    };

    const successfulRetry = await invokeHandler(
      handlers.takes.retryTakeTranscription,
      {
        method: "POST",
        url: `/api/takes/${takeId}/transcribe`,
        params: { takeId },
      },
    );
    expect(successfulRetry.status).toBe(200);
    expect(successfulRetry.body.transcription).toBe("Recovered take");
    expect(successfulRetry.body.transcriptionError).toBeUndefined();
  });

  it("returns 404 for missing recordings", async () => {
    const handlers = await startHandlers();
    cleanups.push(handlers.close);

    const response = await invokeHandler(handlers.takes.getRecording, {
      url: "/api/recordings/missing-recording",
      params: { recordingId: "missing-recording" },
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns dependency unavailable when ffmpeg is missing for mp3 export", async () => {
    const handlers = await startHandlers({
      ffmpegBinary: "definitely-missing-ffmpeg",
      transcriptionClient: createFakeTranscriptionClient({
        mode: "success",
        result: {
          text: "Export take",
          words: JSON.stringify([]),
          segments: JSON.stringify([]),
          audioDuration: 1.0,
        },
      }),
    });
    cleanups.push(handlers.close);

    const createProject = await invokeHandler(handlers.projects.createProject, {
      method: "POST",
      url: "/api/projects",
      body: {
        name: "MP3 Project",
        script: "One line",
      },
    });
    const getProject = await invokeHandler(handlers.projects.getProject, {
      url: `/api/projects/${createProject.body.id}`,
      params: { id: createProject.body.id },
    });
    const segmentId = getProject.body.segments[0].id as string;

    const take = await invokeHandler(handlers.transcription.recordSegmentTake, {
      method: "POST",
      url: `/api/segments/${segmentId}/takes`,
      params: { segmentId },
      body: {
        audioBase64,
        duration: 900,
      },
    });
    await invokeHandler(handlers.takes.selectTake, {
      method: "POST",
      url: `/api/takes/${take.body.id}/select`,
      params: { takeId: take.body.id },
      body: { isSelected: true },
    });

    const failedExport = await invokeHandler(handlers.exports.exportProjectAudio, {
      method: "POST",
      url: `/api/export/audio/${createProject.body.id}`,
      params: { projectId: createProject.body.id },
      body: { format: "mp3" },
    });

    expect(failedExport.status).toBe(503);
    expect(failedExport.body).toEqual({
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: expect.stringContaining("ffmpeg is required"),
      },
    });
  });
});
