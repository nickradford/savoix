// Migration script to add contentHash column and populate it
import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "app.db");
const db = new Database(dbPath);

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

console.log("Starting migration: Adding content_hash column...");

// Check if column exists
const tableInfo = db.prepare("PRAGMA table_info(script_segments)").all();
const hasContentHash = tableInfo.some(
  (col: any) => col.name === "content_hash",
);

if (!hasContentHash) {
  console.log("Adding content_hash column...");
  db.exec("ALTER TABLE script_segments ADD COLUMN content_hash TEXT");

  console.log("Populating content_hash values...");
  const segments = db.prepare("SELECT id, text FROM script_segments").all();

  const updateStmt = db.prepare(
    "UPDATE script_segments SET content_hash = ? WHERE id = ?",
  );

  for (const segment of segments as any[]) {
    const hash = hashContent(segment.text);
    updateStmt.run(hash, segment.id);
    console.log(
      `  Updated segment ${segment.id.slice(0, 8)}... with hash ${hash}`,
    );
  }

  console.log(`✓ Migrated ${segments.length} segments`);
} else {
  console.log("content_hash column already exists, skipping...");
}

db.close();
console.log("Migration complete!");
