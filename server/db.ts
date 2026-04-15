import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof createDatabase>;

export const getDefaultDbPath = () =>
  path.join(process.cwd(), "data", "app.db");

type TableInfoRow = {
  name: string;
};

function ensureDataDirectory(dbPath: string) {
  const dataDirectory = path.dirname(dbPath);
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      script TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS script_segments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS segment_takes (
      id TEXT PRIMARY KEY NOT NULL,
      segment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      recording_path TEXT NOT NULL,
      transcription TEXT,
      confidence REAL,
      words TEXT,
      segments TEXT,
      audio_duration REAL,
      take_number INTEGER,
      duration INTEGER NOT NULL DEFAULT 0,
      is_selected INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (segment_id) REFERENCES script_segments(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      label TEXT NOT NULL,
      color TEXT,
      recording_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS script_segments_project_idx
      ON script_segments(project_id, idx);
    CREATE INDEX IF NOT EXISTS segment_takes_segment_idx
      ON segment_takes(segment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS segment_takes_project_idx
      ON segment_takes(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS segments_project_idx
      ON segments(project_id);
  `);
}

function ensureSegmentTakeColumns(sqlite: Database.Database) {
  const tableExists = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'segment_takes'",
    )
    .get() as { name: string } | undefined;

  if (!tableExists) {
    return;
  }

  const tableInfo = sqlite
    .prepare("PRAGMA table_info(segment_takes)")
    .all() as TableInfoRow[];
  const columnNames = new Set(tableInfo.map((column) => column.name));

  if (!columnNames.has("take_number")) {
    sqlite.exec("ALTER TABLE segment_takes ADD COLUMN take_number integer");
  }

  if (!columnNames.has("deleted_at")) {
    sqlite.exec("ALTER TABLE segment_takes ADD COLUMN deleted_at text");
  }

  sqlite.exec(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY segment_id
          ORDER BY created_at ASC, id ASC
        ) AS take_number
      FROM segment_takes
    )
    UPDATE segment_takes
    SET take_number = (
      SELECT ranked.take_number
      FROM ranked
      WHERE ranked.id = segment_takes.id
    )
    WHERE take_number IS NULL
  `);
}

export function createDatabase(dbPath = getDefaultDbPath()) {
  ensureDataDirectory(dbPath);

  console.log("[DB] Connecting to database at:", dbPath);
  console.log("[DB] Current working directory:", process.cwd());
  console.log("[DB] Database file exists:", fs.existsSync(dbPath));

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureSchema(sqlite);
  ensureSegmentTakeColumns(sqlite);

  const database = drizzle(sqlite, { schema });

  console.log("[DB] Database initialized successfully");

  return database;
}
