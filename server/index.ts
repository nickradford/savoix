import express from "express";
import cors from "cors";
import { Effect, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { appRuntime } from "./effect/runtime";
import { AppConfig } from "./effect/services";
import { effectHandler, jsonResponse } from "./effect/http";
import { makeDemoHandler } from "./routes/demo";
import { makeProjectHandlers } from "./routes/projects";
import { makeScriptSegmentHandlers } from "./routes/script-segments";
import { makeLegacySegmentHandlers } from "./routes/segments";
import { makeExportHandlers } from "./routes/export";
import { makeTakeHandlers } from "./routes/takes";
import { makeTranscriptionHandlers } from "./routes/transcription";

export function createServer(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any> = appRuntime,
) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const demoHandler = makeDemoHandler(runtime);
  const projectHandlers = makeProjectHandlers(runtime);
  const scriptSegmentHandlers = makeScriptSegmentHandlers(runtime);
  const legacySegmentHandlers = makeLegacySegmentHandlers(runtime);
  const exportHandlers = makeExportHandlers(runtime);
  const takeHandlers = makeTakeHandlers(runtime);
  const transcriptionHandlers = makeTranscriptionHandlers(runtime);

  app.get(
    "/api/ping",
    effectHandler(runtime, () =>
      Effect.gen(function* () {
        const config = yield* AppConfig;
        return jsonResponse({ message: config.pingMessage });
      }),
    ),
  );

  app.get("/api/demo", demoHandler);

  app.get("/api/projects", projectHandlers.getProjects);
  app.post("/api/projects", projectHandlers.createProject);
  app.get("/api/projects/:id", projectHandlers.getProject);
  app.patch("/api/projects/:id", projectHandlers.updateProject);
  app.delete("/api/projects/:id", projectHandlers.deleteProject);

  app.get(
    "/api/projects/:projectId/segments",
    scriptSegmentHandlers.getScriptSegments,
  );
  app.post(
    "/api/projects/:projectId/segments",
    scriptSegmentHandlers.updateScriptSegments,
  );

  app.get(
    "/api/segments/:segmentId/takes",
    scriptSegmentHandlers.getSegmentTakes,
  );
  app.post(
    "/api/segments/:segmentId/takes",
    transcriptionHandlers.recordSegmentTake,
  );

  app.post("/api/takes/:takeId/transcribe", takeHandlers.retryTakeTranscription);
  app.delete("/api/takes/:takeId", takeHandlers.deleteTake);
  app.post("/api/takes/:takeId/restore", takeHandlers.restoreTake);
  app.post("/api/takes/:takeId/select", takeHandlers.selectTake);

  app.get("/api/recordings/:recordingId", takeHandlers.getRecording);

  app.get("/api/segments/:projectId", legacySegmentHandlers.getSegments);
  app.post("/api/segments/:projectId", legacySegmentHandlers.saveSegment);
  app.delete(
    "/api/segments/:projectId/:segmentId",
    legacySegmentHandlers.deleteSegment,
  );

  app.post("/api/export/json", exportHandlers.downloadProjectJSON);
  app.post("/api/export/csv", exportHandlers.downloadProjectCSV);
  app.post("/api/export/audio/:projectId", exportHandlers.exportProjectAudio);
  app.get("/api/export/info/:projectId", exportHandlers.generateExport);

  return app;
}
