import type { RequestHandler } from "express";
import { Effect, Schema, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { SegmentRepo } from "../effect/services";
import { ValidationError } from "../effect/errors";
import { decodeSchema, effectHandler, jsonResponse } from "../effect/http";

const ProjectIdParams = Schema.Struct({
  projectId: Schema.String,
});

const SegmentIdParams = Schema.Struct({
  segmentId: Schema.String,
});

const UpdateScriptBody = Schema.Struct({
  script: Schema.String,
});

export function makeScriptSegmentHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly getScriptSegments: RequestHandler;
  readonly updateScriptSegments: RequestHandler;
  readonly getSegmentTakes: RequestHandler;
} {
  return {
    getScriptSegments: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const segmentRepo = yield* SegmentRepo;
        const segments = yield* segmentRepo.listProjectSegments(params.projectId);
        return jsonResponse(segments);
      }),
    ),
    updateScriptSegments: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const body = yield* decodeSchema(UpdateScriptBody, request.body);

        if (body.script === undefined) {
          return yield* Effect.fail(
            new ValidationError({ message: "Script is required" }),
          );
        }

        const segmentRepo = yield* SegmentRepo;
        const segments = yield* segmentRepo.updateProjectScript(
          params.projectId,
          body.script,
        );
        return jsonResponse(segments);
      }),
    ),
    getSegmentTakes: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(SegmentIdParams, request.params);
        const segmentRepo = yield* SegmentRepo;
        const takes = yield* segmentRepo.listSegmentTakes(params.segmentId);
        return jsonResponse(takes);
      }),
    ),
  };
}
