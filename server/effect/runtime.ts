import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { Config, ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";
import { createDatabase, getDefaultDbPath } from "../db";
import {
  AppConfig,
  type AppConfigShape,
  ExportService,
  LegacySegmentStore,
  ProjectRepo,
  RecordingStore,
  SegmentRepo,
  TakeRepo,
  TranscriptionClient,
  type ExportServiceShape,
  type RecordingStoreShape,
  type TranscriptionClientShape,
  makeExportService,
  makeLegacySegmentStore,
  makeProjectRepo,
  makeRecordingStore,
  makeSegmentRepo,
  makeTakeRepo,
  makeTranscriptionClient,
} from "./services";

function envProvider() {
  const entries = Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as const],
  );

  return ConfigProvider.fromMap(new Map(entries));
}

export function loadAppConfig(
  overrides: Partial<AppConfigShape> = {},
) {
  return Effect.withConfigProvider(envProvider())(
    Config.all({
      pingMessage: Config.withDefault(Config.string("PING_MESSAGE"), "ping"),
      parakeetEndpoint: Config.withDefault(
        Config.string("PARAKEET_ENDPOINT"),
        "http://localhost:8765",
      ),
      dbPath: Config.withDefault(Config.string("DB_PATH"), getDefaultDbPath()),
      recordingsDir: Config.withDefault(
        Config.string("RECORDINGS_DIR"),
        path.join(process.cwd(), "recordings"),
      ),
      ffmpegBinary: Config.withDefault(
        Config.string("FFMPEG_BINARY"),
        "ffmpeg",
      ),
    }),
  ).pipe(Effect.map((config) => ({ ...config, ...overrides })));
}

export interface RuntimeOverrides {
  readonly config?: Partial<AppConfigShape>;
  readonly services?: {
    readonly recordingStore?: RecordingStoreShape;
    readonly transcriptionClient?: TranscriptionClientShape;
    readonly exportService?: ExportServiceShape;
  };
}

export function buildAppLayer(overrides: RuntimeOverrides = {}) {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* loadAppConfig(overrides.config);
      const database = createDatabase(config.dbPath);
      const recordingStore =
        overrides.services?.recordingStore ?? makeRecordingStore(config);
      const transcriptionClient =
        overrides.services?.transcriptionClient ??
        makeTranscriptionClient(config);
      const exportService =
        overrides.services?.exportService ??
        makeExportService(config, database, recordingStore);

      return Layer.mergeAll(
        NodeContext.layer,
        Layer.succeed(AppConfig, config),
        Layer.succeed(ProjectRepo, makeProjectRepo(database)),
        Layer.succeed(SegmentRepo, makeSegmentRepo(database)),
        Layer.succeed(TakeRepo, makeTakeRepo(database)),
        Layer.succeed(LegacySegmentStore, makeLegacySegmentStore()),
        Layer.succeed(RecordingStore, recordingStore),
        Layer.succeed(TranscriptionClient, transcriptionClient),
        Layer.succeed(ExportService, exportService),
      );
    }),
  );
}

export function createAppRuntime(overrides: RuntimeOverrides = {}) {
  return ManagedRuntime.make(buildAppLayer(overrides));
}

export const appRuntime = createAppRuntime();
