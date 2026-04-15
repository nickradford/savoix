import type { RequestHandler } from "express";
import { Effect, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { effectHandler, jsonResponse } from "../effect/http";

export function makeDemoHandler(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): RequestHandler {
  return effectHandler(runtime, () =>
    Effect.succeed(
      jsonResponse({
        message: "Hello from the demo endpoint",
      }),
    ),
  );
}
