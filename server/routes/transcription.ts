import type { RequestHandler } from "express";
import { Effect, Either, Schema, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { calculateDiffConfidence } from "../../shared/confidence";
import { decodeSchema, effectHandler, jsonResponse } from "../effect/http";
import {
  RecordingStore,
  SegmentRepo,
  TakeRepo,
  TranscriptionClient,
  calculateResolvedTakeDuration,
} from "../effect/services";
import { ExternalServiceError, ValidationError } from "../effect/errors";

const SegmentIdParams = Schema.Struct({
  segmentId: Schema.String,
});

const RecordTakeBody = Schema.Struct({
  audioBase64: Schema.UndefinedOr(Schema.String),
  audioUrl: Schema.UndefinedOr(Schema.String),
  duration: Schema.UndefinedOr(Schema.Number),
});

function loadAudioBuffer(body: Schema.Schema.Type<typeof RecordTakeBody>) {
  if (body.audioBase64) {
    return Effect.try({
      try: () => {
        const base64Data = body.audioBase64!.replace(
          /^data:audio\/[^;]+;base64,/,
          "",
        );
        return Buffer.from(base64Data, "base64");
      },
      catch: (error) =>
        new ValidationError({
          message: "Invalid audioBase64 payload",
          details: error,
        }),
    });
  }

  if (body.audioUrl) {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(body.audioUrl!);
        if (!response.ok) {
          throw new ValidationError({
            message: "Failed to fetch audio from URL",
            details: {
              status: response.status,
              audioUrl: body.audioUrl,
            },
          });
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      },
      catch: (error) =>
        error instanceof ValidationError
          ? error
          : new ExternalServiceError({
              message: "Failed to fetch audio from URL",
              details: error,
            }),
    });
  }

  return Effect.fail(
    new ValidationError({ message: "Audio data is required" }),
  );
}

export function makeTranscriptionHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly recordSegmentTake: RequestHandler;
} {
  return {
    recordSegmentTake: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(SegmentIdParams, request.params);
        const body = yield* decodeSchema(RecordTakeBody, request.body);
        const segmentRepo = yield* SegmentRepo;
        const takeRepo = yield* TakeRepo;
        const recordingStore = yield* RecordingStore;
        const transcriptionClient = yield* TranscriptionClient;

        const segment = yield* segmentRepo.getSegment(params.segmentId);
        const audioBuffer = yield* loadAudioBuffer(body);
        const recordingId = `recording_${Date.now()}`;
        const recordingPath = yield* recordingStore.writeRecording(
          recordingId,
          audioBuffer,
        );

        const transcriptionAttempt = yield* Effect.either(
          transcriptionClient.transcribe(audioBuffer, recordingId),
        );

        const transcriptionResult = Either.isRight(transcriptionAttempt)
          ? transcriptionAttempt.right
          : {};
        const transcriptionError = Either.isLeft(transcriptionAttempt)
          ? transcriptionAttempt.left.message
          : undefined;

        const takeNumber = yield* takeRepo.getNextTakeNumber(params.segmentId);
        const duration = calculateResolvedTakeDuration(
          body.duration ?? 0,
          transcriptionResult,
        );
        const confidence = calculateDiffConfidence(
          segment.text,
          transcriptionResult.text,
        );

        const take = yield* takeRepo.createTake({
          segmentId: params.segmentId,
          projectId: segment.projectId,
          recordingId,
          recordingPath,
          transcription: transcriptionResult.text,
          confidence,
          words: transcriptionResult.words,
          segments: transcriptionResult.segments,
          audioDuration: transcriptionResult.audioDuration,
          takeNumber,
          duration,
        });

        return jsonResponse(
          {
            ...take,
            transcriptionError,
          },
          { status: 201 },
        );
      }),
    ),
  };
}
