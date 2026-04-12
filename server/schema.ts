import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  script: text("script").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  segments: many(scriptSegments),
  legacySegments: many(segments),
}));

export const scriptSegments = sqliteTable("script_segments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  index: integer("idx").notNull(),
  text: text("text").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const scriptSegmentsRelations = relations(
  scriptSegments,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [scriptSegments.projectId],
      references: [projects.id],
    }),
    takes: many(segmentTakes),
  }),
);

export const segmentTakes = sqliteTable("segment_takes", {
  id: text("id").primaryKey(),
  segmentId: text("segment_id")
    .notNull()
    .references(() => scriptSegments.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  recordingId: text("recording_id").notNull(),
  recordingPath: text("recording_path").notNull(),
  transcription: text("transcription"),
  confidence: real("confidence"),
  words: text("words"),
  segments: text("segments"),
  audioDuration: real("audio_duration"),
  takeNumber: integer("take_number"),
  duration: integer("duration").notNull().default(0),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const segmentTakesRelations = relations(segmentTakes, ({ one }) => ({
  segment: one(scriptSegments, {
    fields: [segmentTakes.segmentId],
    references: [scriptSegments.id],
  }),
  project: one(projects, {
    fields: [segmentTakes.projectId],
    references: [projects.id],
  }),
}));

// Legacy segments table (for timeline labeling)
export const segments = sqliteTable("segments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  recordingId: text("recording_id"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const segmentsRelations = relations(segments, ({ one }) => ({
  project: one(projects, {
    fields: [segments.projectId],
    references: [projects.id],
  }),
}));
