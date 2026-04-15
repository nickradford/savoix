import { randomUUID } from "crypto";
import path from "node:path";
import JSZip from "jszip";
import FormData from "form-data";
import { Command, FileSystem } from "@effect/platform";
import type { AppDatabase } from "../db";
import { segmentTakes, projects, scriptSegments } from "../schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Context, Effect } from "effect";
import type { Segment } from "@shared/api";
import { buildSegmentsForScript, syncSegmentsWithScriptForDb } from "../services/segmentSync";
import {
  DependencyUnavailableError,
  ExternalServiceError,
  FileSystemError,
  NotFoundError,
  PersistenceError,
  ValidationError,
} from "./errors";

export interface AppConfigShape {
  readonly pingMessage: string;
  readonly parakeetEndpoint: string;
  readonly dbPath: string;
  readonly recordingsDir: string;
  readonly ffmpegBinary: string;
}

export interface TranscriptionResult {
  readonly text?: string;
  readonly words?: string;
  readonly segments?: string;
  readonly audioDuration?: number;
}

export class AppConfig extends Context.Tag("AppConfig")<AppConfig, AppConfigShape>() {}

export interface ProjectRepoShape {
  readonly listProjects: () => Effect.Effect<any[], PersistenceError, any>;
  readonly createProject: (input: {
    readonly name: string;
    readonly description?: string;
    readonly script?: string;
  }) => Effect.Effect<any, PersistenceError, any>;
  readonly getProject: (
    id: string,
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly updateProject: (
    id: string,
    input: {
      readonly name?: string;
      readonly description?: string;
      readonly script?: string;
    },
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly deleteProject: (
    id: string,
  ) => Effect.Effect<void, NotFoundError | PersistenceError, any>;
}

export class ProjectRepo extends Context.Tag("ProjectRepo")<ProjectRepo, ProjectRepoShape>() {}

export interface SegmentRepoShape {
  readonly getSegment: (
    segmentId: string,
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly listProjectSegments: (
    projectId: string,
  ) => Effect.Effect<any[], PersistenceError, any>;
  readonly updateProjectScript: (
    projectId: string,
    script: string,
  ) => Effect.Effect<any[], NotFoundError | PersistenceError, any>;
  readonly listSegmentTakes: (
    segmentId: string,
  ) => Effect.Effect<any[], PersistenceError, any>;
}

export class SegmentRepo extends Context.Tag("SegmentRepo")<SegmentRepo, SegmentRepoShape>() {}

export interface TakeRepoShape {
  readonly getTake: (
    takeId: string,
    options?: { readonly includeDeleted?: boolean },
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly getTakeById: (
    takeId: string,
  ) => Effect.Effect<any | null, PersistenceError, any>;
  readonly getNextTakeNumber: (
    segmentId: string,
  ) => Effect.Effect<number, PersistenceError, any>;
  readonly createTake: (input: {
    readonly segmentId: string;
    readonly projectId: string;
    readonly recordingId: string;
    readonly recordingPath: string;
    readonly transcription?: string;
    readonly confidence?: number;
    readonly words?: string;
    readonly segments?: string;
    readonly audioDuration?: number;
    readonly takeNumber?: number;
    readonly duration: number;
  }) => Effect.Effect<any, PersistenceError, any>;
  readonly updateTake: (
    takeId: string,
    values: Record<string, unknown>,
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly softDeleteTake: (
    takeId: string,
  ) => Effect.Effect<void, NotFoundError | PersistenceError, any>;
  readonly restoreTake: (
    takeId: string,
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
  readonly selectTake: (
    takeId: string,
    isSelected: boolean,
  ) => Effect.Effect<any, NotFoundError | PersistenceError, any>;
}

export class TakeRepo extends Context.Tag("TakeRepo")<TakeRepo, TakeRepoShape>() {}

export interface LegacySegmentStoreShape {
  readonly list: (projectId: string) => Effect.Effect<Segment[], never, any>;
  readonly save: (
    projectId: string,
    segment: Omit<Segment, "projectId">,
  ) => Effect.Effect<Segment[], ValidationError, any>;
  readonly remove: (
    projectId: string,
    segmentId: string,
  ) => Effect.Effect<Segment[], never, any>;
}

export class LegacySegmentStore extends Context.Tag("LegacySegmentStore")<
  LegacySegmentStore,
  LegacySegmentStoreShape
>() {}

export interface RecordingStoreShape {
  readonly writeRecording: (
    recordingId: string,
    audioBuffer: Uint8Array,
  ) => Effect.Effect<string, FileSystemError, any>;
  readonly readRecordingById: (
    recordingId: string,
  ) => Effect.Effect<Uint8Array, NotFoundError | FileSystemError, any>;
  readonly readRecordingAtPath: (
    recordingPath: string,
  ) => Effect.Effect<Uint8Array, NotFoundError | FileSystemError, any>;
  readonly existsAtPath: (
    recordingPath: string,
  ) => Effect.Effect<boolean, FileSystemError, any>;
  readonly removeAtPath: (
    recordingPath: string,
  ) => Effect.Effect<void, FileSystemError, any>;
}

export class RecordingStore extends Context.Tag("RecordingStore")<
  RecordingStore,
  RecordingStoreShape
>() {}

export interface TranscriptionClientShape {
  readonly transcribe: (
    audioBuffer: Uint8Array,
    recordingId: string,
  ) => Effect.Effect<TranscriptionResult, ExternalServiceError, any>;
}

export class TranscriptionClient extends Context.Tag("TranscriptionClient")<
  TranscriptionClient,
  TranscriptionClientShape
>() {}

export interface ExportServiceShape {
  readonly checkFfmpeg: () => Effect.Effect<boolean, never, any>;
  readonly exportProjectAudio: (
    projectId: string,
    format: AudioExportFormat,
  ) => Effect.Effect<
    Buffer,
    | ValidationError
    | NotFoundError
    | DependencyUnavailableError
    | FileSystemError
    | PersistenceError
    | ExternalServiceError,
    any
  >;
  readonly generateExportInfo: (
    projectId: string,
  ) => Effect.Effect<
    { segments: number; takes: number; missingSegments: number[] },
    PersistenceError,
    any
  >;
}

export class ExportService extends Context.Tag("ExportService")<
  ExportService,
  ExportServiceShape
>() {}

export type AudioExportFormat = "wav" | "mp3" | "ogg" | "flac";

function dbError(message: string, error: unknown) {
  return new PersistenceError({
    message,
    details: error,
  });
}

function fileError(message: string, error: unknown) {
  return new FileSystemError({
    message,
    details: error,
  });
}

function resolveTakeDurationMs(
  fallbackDurationMs: number,
  audioDurationSeconds?: number,
) {
  if (
    typeof audioDurationSeconds === "number" &&
    Number.isFinite(audioDurationSeconds) &&
    audioDurationSeconds > 0
  ) {
    return Math.round(audioDurationSeconds * 1000);
  }

  return fallbackDurationMs;
}

function kebabify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeProjectRepo(database: AppDatabase): ProjectRepoShape {
  const getProjectRecord = (id: string) =>
    Effect.tryPromise({
      try: () =>
        database.query.projects.findFirst({
          where: eq(projects.id, id),
          with: {
            segments: {
              orderBy: (table, helpers) => [helpers.asc(table.index)],
              with: {
                takes: {
                  orderBy: (takesTable, helpers) => [
                    helpers.desc(takesTable.createdAt),
                  ],
                },
              },
            },
          },
        }),
      catch: (error) => dbError("Failed to fetch project", error),
    });

  return {
    listProjects: () =>
      Effect.tryPromise({
        try: () =>
          database.query.projects.findMany({
            orderBy: (table, helpers) => [helpers.desc(table.createdAt)],
          }),
        catch: (error) => dbError("Failed to fetch projects", error),
      }),
    createProject: ({ name, description = "", script = "" }) =>
      Effect.gen(function* () {
        const projectId = randomUUID();

        yield* Effect.tryPromise({
          try: () =>
            database.insert(projects).values({
              id: projectId,
              name,
              description,
              script,
            }),
          catch: (error) => dbError("Failed to create project", error),
        });

        const segments = buildSegmentsForScript(projectId, script);
        if (segments.length > 0) {
          yield* Effect.tryPromise({
            try: () => database.insert(scriptSegments).values(segments),
            catch: (error) => dbError("Failed to create script segments", error),
          });
        }

        return yield* Effect.flatMap(getProjectRecord(projectId), (project) =>
          project
            ? Effect.succeed(project)
            : Effect.fail(dbError("Created project could not be reloaded", projectId)),
        );
      }),
    getProject: (id) =>
      Effect.flatMap(getProjectRecord(id), (project) =>
        project
          ? Effect.succeed(project)
          : Effect.fail(new NotFoundError({ message: "Project not found" })),
      ),
    updateProject: (id, input) =>
      Effect.gen(function* () {
        const existingProject = yield* Effect.tryPromise({
          try: () =>
            database.query.projects.findFirst({
              where: eq(projects.id, id),
            }),
          catch: (error) => dbError("Failed to fetch project", error),
        });

        if (!existingProject) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Project not found" }),
          );
        }

        const nextScript = input.script ?? existingProject.script;

        yield* Effect.tryPromise({
          try: () =>
            database
              .update(projects)
              .set({
                name: input.name ?? existingProject.name,
                description: input.description ?? existingProject.description,
                script: nextScript,
              })
              .where(eq(projects.id, id)),
          catch: (error) => dbError("Failed to update project", error),
        });

        if (input.script !== undefined && input.script !== existingProject.script) {
          yield* Effect.tryPromise({
            try: () => syncSegmentsWithScriptForDb(database, id, input.script!),
            catch: (error) => dbError("Failed to sync script segments", error),
          });
        }

        return yield* Effect.flatMap(getProjectRecord(id), (project) =>
          project
            ? Effect.succeed(project)
            : Effect.fail(dbError("Updated project could not be reloaded", id)),
        );
      }),
    deleteProject: (id) =>
      Effect.gen(function* () {
        const existingProject = yield* Effect.tryPromise({
          try: () =>
            database.query.projects.findFirst({
              where: eq(projects.id, id),
            }),
          catch: (error) => dbError("Failed to fetch project", error),
        });

        if (!existingProject) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Project not found" }),
          );
        }

        yield* Effect.tryPromise({
          try: () => database.delete(projects).where(eq(projects.id, id)),
          catch: (error) => dbError("Failed to delete project", error),
        });
      }),
  };
}

export function makeSegmentRepo(database: AppDatabase): SegmentRepoShape {
  const listProjectSegments = (projectId: string) =>
    Effect.tryPromise({
      try: () =>
        database.query.scriptSegments.findMany({
          where: eq(scriptSegments.projectId, projectId),
          orderBy: (table, helpers) => [helpers.asc(table.index)],
          with: {
            takes: {
              orderBy: (takesTable, helpers) => [helpers.desc(takesTable.createdAt)],
            },
          },
        }),
      catch: (error) => dbError("Failed to fetch script segments", error),
    });

  return {
    getSegment: (segmentId) =>
      Effect.gen(function* () {
        const segment = yield* Effect.tryPromise({
          try: () =>
            database.query.scriptSegments.findFirst({
              where: eq(scriptSegments.id, segmentId),
            }),
          catch: (error) => dbError("Failed to fetch segment", error),
        });

        if (!segment) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Segment not found" }),
          );
        }

        return segment;
      }),
    listProjectSegments,
    updateProjectScript: (projectId, script) =>
      Effect.gen(function* () {
        const project = yield* Effect.tryPromise({
          try: () =>
            database.query.projects.findFirst({
              where: eq(projects.id, projectId),
            }),
          catch: (error) => dbError("Failed to fetch project", error),
        });

        if (!project) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Project not found" }),
          );
        }

        yield* Effect.tryPromise({
          try: () => syncSegmentsWithScriptForDb(database, projectId, script),
          catch: (error) => dbError("Failed to update script segments", error),
        });

        return yield* listProjectSegments(projectId);
      }),
    listSegmentTakes: (segmentId) =>
      Effect.tryPromise({
        try: () =>
          database.query.segmentTakes.findMany({
            where: eq(segmentTakes.segmentId, segmentId),
            orderBy: (table, helpers) => [helpers.desc(table.createdAt)],
          }),
        catch: (error) => dbError("Failed to fetch segment takes", error),
      }),
  };
}

export function makeTakeRepo(database: AppDatabase): TakeRepoShape {
  const loadTake = (takeId: string, includeDeleted = true) =>
    Effect.tryPromise({
      try: () =>
        database.query.segmentTakes.findFirst({
          where: includeDeleted
            ? eq(segmentTakes.id, takeId)
            : and(eq(segmentTakes.id, takeId), isNull(segmentTakes.deletedAt)),
        }),
      catch: (error) => dbError("Failed to fetch take", error),
    });

  return {
    getTake: (takeId, options) =>
      Effect.flatMap(loadTake(takeId, options?.includeDeleted ?? true), (take) =>
        take
          ? Effect.succeed(take)
          : Effect.fail(new NotFoundError({ message: "Take not found" })),
      ),
    getTakeById: (takeId) => loadTake(takeId, true),
    getNextTakeNumber: (segmentId) =>
      Effect.map(
        Effect.tryPromise({
          try: () =>
            database.query.segmentTakes.findMany({
              where: eq(segmentTakes.segmentId, segmentId),
              columns: { takeNumber: true },
            }),
          catch: (error) => dbError("Failed to fetch take numbers", error),
        }),
        (takes) =>
          takes.reduce(
            (currentMax, take) => Math.max(currentMax, take.takeNumber ?? 0),
            0,
          ) + 1,
      ),
    createTake: (input) =>
      Effect.gen(function* () {
        const takeId = randomUUID();
        yield* Effect.tryPromise({
          try: () =>
            database.insert(segmentTakes).values({
              id: takeId,
              ...input,
            }),
          catch: (error) => dbError("Failed to create take", error),
        });

        return yield* Effect.flatMap(loadTake(takeId, true), (take) =>
          take
            ? Effect.succeed(take)
            : Effect.fail(dbError("Created take could not be reloaded", takeId)),
        );
      }),
    updateTake: (takeId, values) =>
      Effect.gen(function* () {
        const take = yield* loadTake(takeId, true);
        if (!take) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Take not found" }),
          );
        }

        yield* Effect.tryPromise({
          try: () =>
            database.update(segmentTakes).set(values).where(eq(segmentTakes.id, takeId)),
          catch: (error) => dbError("Failed to update take", error),
        });

        return yield* Effect.flatMap(loadTake(takeId, true), (updatedTake) =>
          updatedTake
            ? Effect.succeed(updatedTake)
            : Effect.fail(dbError("Updated take could not be reloaded", takeId)),
        );
      }),
    softDeleteTake: (takeId) =>
      Effect.gen(function* () {
        const take = yield* loadTake(takeId, false);
        if (!take) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Take not found" }),
          );
        }

        yield* Effect.tryPromise({
          try: () =>
            database
              .update(segmentTakes)
              .set({ deletedAt: new Date().toISOString() })
              .where(eq(segmentTakes.id, takeId)),
          catch: (error) => dbError("Failed to delete take", error),
        });
      }),
    restoreTake: (takeId) =>
      Effect.gen(function* () {
        const take = yield* loadTake(takeId, true);
        if (!take) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Take not found" }),
          );
        }

        yield* Effect.tryPromise({
          try: () =>
            database
              .update(segmentTakes)
              .set({ deletedAt: null })
              .where(eq(segmentTakes.id, takeId)),
          catch: (error) => dbError("Failed to restore take", error),
        });

        return yield* Effect.flatMap(loadTake(takeId, true), (restoredTake) =>
          restoredTake
            ? Effect.succeed(restoredTake)
            : Effect.fail(dbError("Restored take could not be reloaded", takeId)),
        );
      }),
    selectTake: (takeId, isSelected) =>
      Effect.gen(function* () {
        const take = yield* loadTake(takeId, false);
        if (!take) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Take not found" }),
          );
        }

        if (isSelected) {
          yield* Effect.tryPromise({
            try: () =>
              database
                .update(segmentTakes)
                .set({ isSelected: false })
                .where(
                  and(
                    eq(segmentTakes.segmentId, take.segmentId),
                    eq(segmentTakes.isSelected, true),
                    sql`${segmentTakes.id} != ${takeId}`,
                  ),
                ),
            catch: (error) =>
              dbError("Failed to update take selection", error),
          });
        }

        yield* Effect.tryPromise({
          try: () =>
            database
              .update(segmentTakes)
              .set({ isSelected })
              .where(eq(segmentTakes.id, takeId)),
          catch: (error) => dbError("Failed to select take", error),
        });

        return yield* Effect.flatMap(loadTake(takeId, true), (updatedTake) =>
          updatedTake
            ? Effect.succeed(updatedTake)
            : Effect.fail(dbError("Selected take could not be reloaded", takeId)),
        );
      }),
  };
}

export function makeLegacySegmentStore(): LegacySegmentStoreShape {
  const segmentsStorage = new Map<string, Segment[]>();

  return {
    list: (projectId) => Effect.succeed(segmentsStorage.get(projectId) || []),
    save: (projectId, segment) =>
      Effect.try({
        try: () => {
        if (
          !segment.label ||
          segment.startTime === undefined ||
          segment.endTime === undefined
        ) {
          throw new ValidationError({
            message: "label, startTime, and endTime are required",
          });
        }

        const existingSegments = segmentsStorage.get(projectId) || [];
        const nextSegment: Segment = {
          ...segment,
          projectId,
          id: segment.id || Date.now().toString(),
        };
        const existingIndex = existingSegments.findIndex((item) => item.id === segment.id);

        if (existingIndex >= 0) {
          existingSegments[existingIndex] = nextSegment;
        } else {
          existingSegments.push(nextSegment);
        }

        segmentsStorage.set(projectId, existingSegments);
        return existingSegments;
        },
        catch: (error) =>
          error instanceof ValidationError
            ? error
            : new ValidationError({
                message: "Failed to save segment",
                details: error,
              }),
      }),
    remove: (projectId, segmentId) =>
      Effect.sync(() => {
        const nextSegments = (segmentsStorage.get(projectId) || []).filter(
          (segment) => segment.id !== segmentId,
        );
        segmentsStorage.set(projectId, nextSegments);
        return nextSegments;
      }),
  };
}

export function makeRecordingStore(config: AppConfigShape): RecordingStoreShape {
  const resolvePath = (recordingId: string) =>
    path.join(config.recordingsDir, `${recordingId}.wav`);

  const ensureDir = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(config.recordingsDir, { recursive: true });
  }).pipe(
    Effect.mapError((error) => fileError("Failed to create recordings directory", error)),
  );

  const recordingStore: RecordingStoreShape = {
    writeRecording: (recordingId, audioBuffer) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* ensureDir;
        const filePath = resolvePath(recordingId);
        yield* fs.writeFile(filePath, audioBuffer);
        return filePath;
      }).pipe(
        Effect.mapError((error) =>
          error instanceof FileSystemError
            ? error
            : fileError("Failed to write recording", error),
        ),
      ),
    readRecordingById: (recordingId) =>
      Effect.gen(function* () {
        const filePath = resolvePath(recordingId);
        return yield* recordingStore.readRecordingAtPath(filePath);
      }).pipe(
        Effect.mapError((error) =>
          error instanceof NotFoundError || error instanceof FileSystemError
            ? error
            : fileError("Failed to read recording", error),
        ),
      ),
    readRecordingAtPath: (recordingPath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(recordingPath);
        if (!exists) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Recording not found" }),
          );
        }
        return yield* fs.readFile(recordingPath);
      }).pipe(
        Effect.mapError((error) =>
          error instanceof NotFoundError
            ? error
            : fileError("Failed to read recording", error),
        ),
      ),
    existsAtPath: (recordingPath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(recordingPath);
      }).pipe(
        Effect.mapError((error) => fileError("Failed to check recording path", error)),
      ),
    removeAtPath: (recordingPath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(recordingPath);
        if (exists) {
          yield* fs.remove(recordingPath);
        }
      }).pipe(
        Effect.mapError((error) => fileError("Failed to remove recording", error)),
      ),
  };

  return recordingStore;
}

export function makeTranscriptionClient(
  config: AppConfigShape,
  options?: {
    readonly fetchImpl?: typeof fetch;
  },
): TranscriptionClientShape {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const endpointUrl = `${config.parakeetEndpoint}/audio/transcriptions`;

  return {
    transcribe: (audioBuffer, recordingId) =>
      Effect.tryPromise({
        try: async () => {
          const formData = new FormData();
          formData.append("file", Buffer.from(audioBuffer), {
            filename: `${recordingId}.wav`,
            contentType: "audio/wav",
          });
          formData.append("response_format", "verbose_json");
          formData.append("timestamp_granularities", "word");
          formData.append("timestamp_granularities", "segment");

          const response = await fetchImpl(endpointUrl, {
            method: "POST",
            headers: formData.getHeaders(),
            body: formData.getBuffer() as unknown as BodyInit,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new ExternalServiceError({
              message: `Transcription failed: ${errorText}`,
              details: {
                endpointUrl,
                status: response.status,
              },
            });
          }

          const data = await response.json();
          return {
            text: data.text || "",
            words: data.words ? JSON.stringify(data.words) : undefined,
            segments: data.segments ? JSON.stringify(data.segments) : undefined,
            audioDuration: data.duration ?? undefined,
          } satisfies TranscriptionResult;
        },
        catch: (error) =>
          error instanceof ExternalServiceError
            ? error
            : new ExternalServiceError({
                message:
                  error instanceof Error
                    ? error.message
                    : "Transcription request failed",
                details: {
                  endpointUrl,
                  error,
                },
              }),
      }),
  };
}

export function makeExportService(
  config: AppConfigShape,
  database: AppDatabase,
  recordingStore: RecordingStoreShape,
  options?: {
    readonly checkFfmpegImpl?: () => Effect.Effect<boolean, never, any>;
    readonly convertAudioImpl?: (
      inputPath: string,
      outputPath: string,
      format: AudioExportFormat,
    ) => Effect.Effect<
      void,
      DependencyUnavailableError | ExternalServiceError,
      any
    >;
  },
): ExportServiceShape {
  const checkFfmpeg =
    options?.checkFfmpegImpl ??
    (() =>
      Command.exitCode(Command.make(config.ffmpegBinary, "-version")).pipe(
        Effect.map((exitCode) => exitCode === 0),
        Effect.catchAll(() => Effect.succeed(false)),
      ));

  const convertAudio =
    options?.convertAudioImpl ??
    ((inputPath: string, outputPath: string, format: AudioExportFormat) => {
    const args = ["-i", inputPath, "-y"];

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

    return Command.exitCode(Command.make(config.ffmpegBinary, ...args)).pipe(
      Effect.flatMap((exitCode) =>
        exitCode === 0
          ? Effect.succeed(undefined)
          : Effect.fail(
              new ExternalServiceError({
                message: "ffmpeg exited with a non-zero status",
                details: { exitCode, inputPath, outputPath, format },
              }),
            ),
      ),
      Effect.catchAll((error) =>
        Effect.fail(
          new DependencyUnavailableError({
            message: "ffmpeg is unavailable",
            details: error,
          }),
        ),
      ),
    );
    });

  return {
    checkFfmpeg,
    exportProjectAudio: (projectId, format) =>
      Effect.gen(function* () {
        const project = yield* Effect.tryPromise({
          try: () =>
            database.query.projects.findFirst({
              where: eq(projects.id, projectId),
            }),
          catch: (error) => dbError("Failed to fetch project", error),
        });

        if (!project) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Project not found" }),
          );
        }

        const segments = yield* Effect.tryPromise({
          try: () =>
            database.query.scriptSegments.findMany({
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
            }),
          catch: (error) => dbError("Failed to fetch export segments", error),
        });

        const segmentsWithTakes = segments
          .map((segment, index) => ({ segment, take: segment.takes[0], index }))
          .filter((item) => Boolean(item.take));

        if (segmentsWithTakes.length === 0) {
          return yield* Effect.fail(
            new ValidationError({ message: "No selected takes to export" }),
          );
        }

        if (format !== "wav") {
          const ffmpegAvailable = yield* checkFfmpeg();
          if (!ffmpegAvailable) {
            return yield* Effect.fail(
              new DependencyUnavailableError({
                message: `ffmpeg is required for ${format} conversion but is not available. Please install ffmpeg or use wav format.`,
              }),
            );
          }
        }

        const projectFolderName = kebabify(project.name);
        const zip = new JSZip();
        const folder = zip.folder(projectFolderName);

        if (!folder) {
          return yield* Effect.fail(
            new FileSystemError({ message: "Failed to create ZIP folder" }),
          );
        }

        const tempFiles: string[] = [];

        const zipBuffer = yield* Effect.ensuring(
          Effect.gen(function* () {
            for (const { take, index } of segmentsWithTakes) {
              if (!take) {
                continue;
              }

              const inputExists = yield* recordingStore.existsAtPath(take.recordingPath);
              if (!inputExists) {
                continue;
              }

              let audioBuffer: Uint8Array;
              const outputFileName = `segment-${index + 1}.${format}`;

              if (format !== "wav") {
                const tempOutputPath = path.join(
                  config.recordingsDir,
                  `temp-${take.recordingId}.${format}`,
                );
                tempFiles.push(tempOutputPath);
                yield* convertAudio(take.recordingPath, tempOutputPath, format);
                audioBuffer = yield* recordingStore.readRecordingAtPath(tempOutputPath);
              } else {
                audioBuffer = yield* recordingStore.readRecordingAtPath(
                  take.recordingPath,
                );
              }

              folder.file(outputFileName, Buffer.from(audioBuffer));
            }

            return yield* Effect.tryPromise({
              try: () => zip.generateAsync({ type: "nodebuffer" }),
              catch: (error) => fileError("Failed to generate ZIP archive", error),
            });
          }),
          Effect.forEach(
            tempFiles,
            (tempFile) =>
              recordingStore.removeAtPath(tempFile).pipe(
                Effect.catchAll(() => Effect.succeed(undefined)),
              ),
            { discard: true },
          ),
        );

        return Buffer.from(zipBuffer);
      }),
    generateExportInfo: (projectId) =>
      Effect.tryPromise({
        try: async () => {
          const segments = await database.query.scriptSegments.findMany({
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

          const missingSegments: number[] = [];
          segments.forEach((segment, index) => {
            if (segment.takes.length === 0) {
              missingSegments.push(index + 1);
            }
          });

          return {
            segments: segments.length,
            takes: segments.filter((segment) => segment.takes.length > 0).length,
            missingSegments,
          };
        },
        catch: (error) => dbError("Failed to generate export info", error),
      }),
  };
}

export function calculateResolvedTakeDuration(
  fallbackDurationMs: number,
  transcriptionResult: Pick<TranscriptionResult, "audioDuration">,
) {
  return resolveTakeDurationMs(
    fallbackDurationMs,
    transcriptionResult.audioDuration,
  );
}
