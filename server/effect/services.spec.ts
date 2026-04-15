import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { createDatabase } from "../db";
import { projects, scriptSegments, segmentTakes } from "../schema";
import {
  makeExportService,
  makeTranscriptionClient,
  type AppConfigShape,
  type RecordingStoreShape,
} from "./services";

const tempPaths: string[] = [];

afterEach(() => {
  while (tempPaths.length > 0) {
    const target = tempPaths.pop();
    if (target) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

function makeTempWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "effect-services-"));
  tempPaths.push(workspace);
  return workspace;
}

describe("effect services", () => {
  it("transcription client parses successful responses from a fetch double", async () => {
    const config: AppConfigShape = {
      pingMessage: "ping",
      parakeetEndpoint: "http://parakeet.test",
      dbPath: "",
      recordingsDir: "",
      ffmpegBinary: "ffmpeg",
    };

    const client = makeTranscriptionClient(config, {
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            text: "From double",
            words: [{ word: "From" }],
            segments: [{ text: "From double" }],
            duration: 2,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )) as unknown as typeof fetch,
    });

    const result = await Effect.runPromise(
      client.transcribe(Buffer.from("audio"), "recording-1") as Effect.Effect<
        any,
        any,
        never
      >,
    );

    expect(result).toEqual({
      text: "From double",
      words: JSON.stringify([{ word: "From" }]),
      segments: JSON.stringify([{ text: "From double" }]),
      audioDuration: 2,
    });
  });

  it("export service can package selected takes with injected doubles and fails cleanly when ffmpeg is unavailable", async () => {
    const workspace = makeTempWorkspace();
    const db = createDatabase(path.join(workspace, "data", "app.db"));

    await db.insert(projects).values({
      id: "project-1",
      name: "Service Project",
      description: "",
      script: "Line one",
    });
    await db.insert(scriptSegments).values({
      id: "segment-1",
      projectId: "project-1",
      index: 0,
      text: "Line one",
      contentHash: "hash-1",
      createdAt: new Date().toISOString(),
    });
    await db.insert(segmentTakes).values({
      id: "take-1",
      segmentId: "segment-1",
      projectId: "project-1",
      recordingId: "recording-1",
      recordingPath: path.join(workspace, "recordings", "recording-1.wav"),
      transcription: "Line one",
      duration: 1000,
      isSelected: true,
      createdAt: new Date().toISOString(),
    });

    const config: AppConfigShape = {
      pingMessage: "ping",
      parakeetEndpoint: "http://parakeet.test",
      dbPath: path.join(workspace, "data", "app.db"),
      recordingsDir: path.join(workspace, "recordings"),
      ffmpegBinary: "ffmpeg",
    };

    const recordingStore: RecordingStoreShape = {
      writeRecording: () => Effect.succeed(""),
      readRecordingById: () => Effect.succeed(Buffer.from("audio")),
      readRecordingAtPath: () => Effect.succeed(Buffer.from("audio")),
      existsAtPath: () => Effect.succeed(true),
      removeAtPath: () => Effect.succeed(undefined),
    };

    const exportService = makeExportService(config, db, recordingStore, {
      checkFfmpegImpl: () => Effect.succeed(true),
      convertAudioImpl: () => Effect.succeed(undefined),
    });

    const archive = await Effect.runPromise(
      exportService.exportProjectAudio("project-1", "mp3") as Effect.Effect<
        any,
        any,
        never
      >,
    );
    expect(archive.byteLength).toBeGreaterThan(0);

    const unavailableExportService = makeExportService(config, db, recordingStore, {
      checkFfmpegImpl: () => Effect.succeed(false),
      convertAudioImpl: () => Effect.succeed(undefined),
    });

    try {
      await Effect.runPromise(
        unavailableExportService.exportProjectAudio(
          "project-1",
          "mp3",
        ) as Effect.Effect<any, any, never>,
      );
      throw new Error("Expected exportProjectAudio to fail");
    } catch (error) {
      expect(String(error)).toContain("DependencyUnavailableError");
      expect(String(error)).toContain("ffmpeg is required");
    }
  });
});
