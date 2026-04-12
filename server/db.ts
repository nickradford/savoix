import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

// Use process.cwd() to ensure we always look in the project root
// This matches drizzle.config.ts which uses "./data/app.db"
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "app.db");

console.log("[DB] Connecting to database at:", DB_PATH);
console.log("[DB] Current working directory:", process.cwd());
console.log("[DB] Database file exists:", fs.existsSync(DB_PATH));

// Create database connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.pragma("journal_mode = WAL");

type TableInfoRow = {
  name: string;
};

function ensureSegmentTakeColumns() {
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

ensureSegmentTakeColumns();

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

console.log("[DB] Database initialized successfully");
