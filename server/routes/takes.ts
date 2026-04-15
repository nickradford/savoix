import type { RequestHandler } from "express";
import { Effect, Either, Schema, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { decodeSchema, effectHandler, emptyResponse, jsonResponse, sendResponse } from "../effect/http";
import { NotFoundError } from "../effect/errors";
import {
  RecordingStore,
  TakeRepo,
  TranscriptionClient,
  calculateResolvedTakeDuration,
} from "../effect/services";

const TakeIdParams = Schema.Struct({
  takeId: Schema.String,
});

const RecordingIdParams = Schema.Struct({
  recordingId: Schema.String,
});

const SelectTakeBody = Schema.Struct({
  isSelected: Schema.UndefinedOr(Schema.Boolean),
});

export function makeTakeHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly retryTakeTranscription: RequestHandler;
  readonly deleteTake: RequestHandler;
  readonly restoreTake: RequestHandler;
  readonly selectTake: RequestHandler;
  readonly getRecording: RequestHandler;
} {
  return {
    retryTakeTranscription: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(TakeIdParams, request.params);
        const takeRepo = yield* TakeRepo;
        const recordingStore = yield* RecordingStore;
        const transcriptionClient = yield* TranscriptionClient;

        const take = yield* takeRepo.getTake(params.takeId, {
          includeDeleted: false,
        });
        const recordingExists = yield* recordingStore.existsAtPath(take.recordingPath);
        if (!recordingExists) {
          return yield* Effect.fail(
            new NotFoundError({ message: "Recording file not found" }),
          );
        }

        const audioBuffer = yield* recordingStore.readRecordingAtPath(
          take.recordingPath,
        );
        const retryAttempt = yield* Effect.either(
          transcriptionClient.transcribe(audioBuffer, take.recordingId),
        );

        const updatedTake = Either.isRight(retryAttempt)
          ? yield* takeRepo.updateTake(params.takeId, {
              transcription: retryAttempt.right.text || "",
              confidence: 0.85,
              words: retryAttempt.right.words,
              segments: retryAttempt.right.segments,
              audioDuration: retryAttempt.right.audioDuration,
              duration: calculateResolvedTakeDuration(
                take.duration,
                retryAttempt.right,
              ),
            })
          : yield* takeRepo.getTake(params.takeId);

        return jsonResponse({
          ...updatedTake,
          transcriptionError: Either.isLeft(retryAttempt)
            ? retryAttempt.left.message
            : undefined,
        });
      }),
    ),
    deleteTake: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(TakeIdParams, request.params);
        const takeRepo = yield* TakeRepo;
        yield* takeRepo.softDeleteTake(params.takeId);
        return emptyResponse();
      }),
    ),
    restoreTake: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(TakeIdParams, request.params);
        const takeRepo = yield* TakeRepo;
        const restoredTake = yield* takeRepo.restoreTake(params.takeId);
        return jsonResponse(restoredTake);
      }),
    ),
    selectTake: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(TakeIdParams, request.params);
        const body = yield* decodeSchema(SelectTakeBody, request.body);
        const takeRepo = yield* TakeRepo;
        const updatedTake = yield* takeRepo.selectTake(
          params.takeId,
          body.isSelected ?? true,
        );
        return jsonResponse(updatedTake);
      }),
    ),
    getRecording: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(RecordingIdParams, request.params);
        const recordingStore = yield* RecordingStore;
        const recording = yield* recordingStore.readRecordingById(
          params.recordingId,
        );
        return sendResponse(recording, {
          headers: {
            "Content-Type": "audio/wav",
          },
        });
      }),
    ),
  };
}
