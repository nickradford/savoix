import { Data, ParseResult } from "effect";
import type { ApiError } from "@shared/api";

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class DependencyUnavailableError extends Data.TaggedError(
  "DependencyUnavailableError",
)<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class ExternalServiceError extends Data.TaggedError("ExternalServiceError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class PersistenceError extends Data.TaggedError("PersistenceError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class UnexpectedError extends Data.TaggedError("UnexpectedError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export type DomainError =
  | ValidationError
  | NotFoundError
  | ConflictError
  | DependencyUnavailableError
  | ExternalServiceError
  | PersistenceError
  | FileSystemError
  | UnexpectedError;

export function formatParseError(error: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(error);
}

export function makeValidationError(
  error: ParseResult.ParseError,
  details?: unknown,
) {
  return new ValidationError({
    message: formatParseError(error),
    details,
  });
}

export function normalizeUnknownError(error: unknown): DomainError {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const taggedError = error as { _tag: string; message?: string; details?: unknown };
    switch (taggedError._tag) {
      case "ValidationError":
      case "NotFoundError":
      case "ConflictError":
      case "DependencyUnavailableError":
      case "ExternalServiceError":
      case "PersistenceError":
      case "FileSystemError":
      case "UnexpectedError":
        return error as DomainError;
    }
  }

  if (error instanceof ParseResult.ParseError) {
    return makeValidationError(error);
  }

  if (error instanceof Error) {
    return new UnexpectedError({
      message: error.message,
      details: {
        name: error.name,
        stack: error.stack,
      },
    });
  }

  return new UnexpectedError({
    message: "Unexpected error",
    details: error,
  });
}

export function toApiError(error: unknown): {
  readonly status: number;
  readonly body: ApiError;
} {
  const normalized = normalizeUnknownError(error);

  switch (normalized._tag) {
    case "ValidationError":
      return {
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "NotFoundError":
      return {
        status: 404,
        body: {
          error: {
            code: "NOT_FOUND",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "ConflictError":
      return {
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "DependencyUnavailableError":
      return {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "ExternalServiceError":
      return {
        status: 502,
        body: {
          error: {
            code: "EXTERNAL_SERVICE_ERROR",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "PersistenceError":
      return {
        status: 500,
        body: {
          error: {
            code: "PERSISTENCE_ERROR",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "FileSystemError":
      return {
        status: 500,
        body: {
          error: {
            code: "FILE_SYSTEM_ERROR",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
    case "UnexpectedError":
    default:
      return {
        status: 500,
        body: {
          error: {
            code: "UNEXPECTED_ERROR",
            message: normalized.message,
            details: normalized.details,
          },
        },
      };
  }
}
