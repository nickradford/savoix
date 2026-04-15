import type { Request, RequestHandler, Response } from "express";
import {
  Cause,
  Exit,
  Effect,
  Option,
  Schema,
  type ManagedRuntime as ManagedRuntimeType,
} from "effect";
import { makeValidationError, toApiError } from "./errors";

export type ApiResponse =
  | {
      readonly kind: "json";
      readonly status?: number;
      readonly headers?: Record<string, string>;
      readonly body: unknown;
    }
  | {
      readonly kind: "send";
      readonly status?: number;
      readonly headers?: Record<string, string>;
      readonly body: string | Uint8Array;
    }
  | {
      readonly kind: "empty";
      readonly status?: number;
      readonly headers?: Record<string, string>;
    };

export function jsonResponse(
  body: unknown,
  options?: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
  },
): ApiResponse {
  return {
    kind: "json",
    body,
    status: options?.status,
    headers: options?.headers,
  };
}

export function sendResponse(
  body: string | Uint8Array,
  options?: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
  },
): ApiResponse {
  return {
    kind: "send",
    body,
    status: options?.status,
    headers: options?.headers,
  };
}

export function emptyResponse(
  status = 204,
  headers?: Record<string, string>,
): ApiResponse {
  return {
    kind: "empty",
    status,
    headers,
  };
}

function applyHeaders(response: Response, headers?: Record<string, string>) {
  if (!headers) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
}

function applyApiResponse(response: Response, apiResponse: ApiResponse) {
  applyHeaders(response, apiResponse.headers);
  const status = apiResponse.status ?? 200;

  switch (apiResponse.kind) {
    case "send":
      response.status(status).send(apiResponse.body);
      return;
    case "empty":
      response.status(status).send();
      return;
    case "json":
    default:
      response.status(status).json(apiResponse.body);
  }
}

export function effectHandler(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
  handler: (request: Request, response: Response) => Effect.Effect<ApiResponse, unknown, any>,
): RequestHandler {
  return (request, response) => {
    runtime.runPromiseExit(handler(request, response)).then((exit) => {
      if (Exit.isSuccess(exit)) {
        applyApiResponse(response, exit.value);
        return;
      }

      const failure = Option.getOrElse(Cause.failureOption(exit.cause), () =>
        Cause.squash(exit.cause),
      );
      const apiError = toApiError(failure);
      if (!response.headersSent) {
        response.status(apiError.status).json(apiError.body);
      }
    });
  };
}

export function decodeSchema<S extends Schema.Schema.Any>(
  schema: S,
  value: unknown,
  details?: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((error) => makeValidationError(error, details)),
  );
}
