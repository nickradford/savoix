import type { RequestHandler } from "express";
import { Effect, Schema, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { decodeSchema, effectHandler, jsonResponse } from "../effect/http";
import { LegacySegmentStore } from "../effect/services";

const LegacyProjectIdParams = Schema.Struct({
  projectId: Schema.String,
});

const LegacySegmentIdParams = Schema.Struct({
  projectId: Schema.String,
  segmentId: Schema.String,
});

const LegacySegmentBody = Schema.Struct({
  id: Schema.UndefinedOr(Schema.String),
  startTime: Schema.Number,
  endTime: Schema.Number,
  label: Schema.String,
  color: Schema.UndefinedOr(Schema.String),
  recordingId: Schema.UndefinedOr(Schema.String),
});

export function makeLegacySegmentHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly getSegments: RequestHandler;
  readonly saveSegment: RequestHandler;
  readonly deleteSegment: RequestHandler;
} {
  return {
    getSegments: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(LegacyProjectIdParams, request.params);
        const store = yield* LegacySegmentStore;
        const segments = yield* store.list(params.projectId);
        return jsonResponse({ segments });
      }),
    ),
    saveSegment: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(LegacyProjectIdParams, request.params);
        const body = yield* decodeSchema(LegacySegmentBody, request.body);
        const store = yield* LegacySegmentStore;
        const segments = yield* store.save(params.projectId, body);
        return jsonResponse({ segments });
      }),
    ),
    deleteSegment: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(LegacySegmentIdParams, request.params);
        const store = yield* LegacySegmentStore;
        const segments = yield* store.remove(params.projectId, params.segmentId);
        return jsonResponse({ segments });
      }),
    ),
  };
}
