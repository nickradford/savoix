import type { RequestHandler } from "express";
import { Effect, Schema, type ManagedRuntime as ManagedRuntimeType } from "effect";
import { ProjectRepo } from "../effect/services";
import { ValidationError } from "../effect/errors";
import { decodeSchema, effectHandler, emptyResponse, jsonResponse } from "../effect/http";

const ProjectIdParams = Schema.Struct({
  id: Schema.String,
});

const CreateProjectBody = Schema.Struct({
  name: Schema.String,
  description: Schema.UndefinedOr(Schema.String),
  script: Schema.UndefinedOr(Schema.String),
});

const UpdateProjectBody = Schema.Struct({
  name: Schema.UndefinedOr(Schema.String),
  description: Schema.UndefinedOr(Schema.String),
  script: Schema.UndefinedOr(Schema.String),
});

function requireProjectName(name: string) {
  return name.trim().length > 0
    ? Effect.succeed(name)
    : Effect.fail(
        new ValidationError({ message: "Project name is required" }),
      );
}

export function makeProjectHandlers(
  runtime: ManagedRuntimeType.ManagedRuntime<any, any>,
): {
  readonly getProjects: RequestHandler;
  readonly createProject: RequestHandler;
  readonly getProject: RequestHandler;
  readonly updateProject: RequestHandler;
  readonly deleteProject: RequestHandler;
} {
  return {
    getProjects: effectHandler(runtime, () =>
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepo;
        const projects = yield* projectRepo.listProjects();
        return jsonResponse(projects);
      }),
    ),
    createProject: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const body = yield* decodeSchema(CreateProjectBody, request.body);
        const projectRepo = yield* ProjectRepo;
        yield* requireProjectName(body.name);
        const project = yield* projectRepo.createProject(body);
        return jsonResponse(project, { status: 201 });
      }),
    ),
    getProject: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const projectRepo = yield* ProjectRepo;
        const project = yield* projectRepo.getProject(params.id);
        return jsonResponse(project);
      }),
    ),
    updateProject: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const body = yield* decodeSchema(UpdateProjectBody, request.body);
        if (body.name !== undefined) {
          yield* requireProjectName(body.name);
        }
        const projectRepo = yield* ProjectRepo;
        const project = yield* projectRepo.updateProject(params.id, body);
        return jsonResponse(project);
      }),
    ),
    deleteProject: effectHandler(runtime, (request) =>
      Effect.gen(function* () {
        const params = yield* decodeSchema(ProjectIdParams, request.params);
        const projectRepo = yield* ProjectRepo;
        yield* projectRepo.deleteProject(params.id);
        return emptyResponse();
      }),
    ),
  };
}
