#!/usr/bin/env node
/**
 * Backfill script to calculate and update confidence scores for existing takes.
 *
 * This script:
 * 1. Finds all takes that have a transcription but no confidence (or confidence = 0.85)
 * 2. Calculates the diff confidence by comparing expected script with transcription
 * 3. Updates the database with the calculated confidence
 *
 * Usage:
 *   pnpm tsx scripts/backfill-confidence.ts
 *
 * Or with dry-run to see what would be updated:
 *   pnpm tsx scripts/backfill-confidence.ts --dry-run
 */

import { db } from "../server/db";
import { scriptSegments, segmentTakes } from "../server/schema";
import { eq, isNull, or, and, ne, sql } from "drizzle-orm";
import { calculateDiffConfidence } from "../shared/confidence";

const isDryRun = process.argv.includes("--dry-run");

async function backfillConfidence() {
  console.log("🔍 Fetching takes that need confidence backfill...\n");

  // Find all takes that have transcription but may need confidence update
  // We include takes with confidence = 0.85 (the old hardcoded value) or null
  const takes = await db.query.segmentTakes.findMany({
    with: {
      segment: true,
    },
  });

  // Filter in JS since we need to check multiple conditions
  const takesToProcess = takes.filter((take) => {
    // Must have transcription
    if (!take.transcription || take.transcription === "") return false;

    // Check if confidence needs update (null or the old hardcoded 0.85)
    const needsUpdate =
      take.confidence === null ||
      take.confidence === undefined ||
      take.confidence === 0.85;

    return needsUpdate;
  });

  console.log(`📊 Found ${takesToProcess.length} takes to process\n`);

  if (takesToProcess.length === 0) {
    console.log("✅ No takes need updating!");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const take of takesToProcess) {
    const segment = take.segment;

    if (!segment) {
      console.log(`⚠️  Skipping take ${take.id}: No associated segment found`);
      skipped++;
      continue;
    }

    const expectedScript = segment.text;
    const transcribedText = take.transcription!;

    const newConfidence = calculateDiffConfidence(
      expectedScript,
      transcribedText,
    );

    const oldConfidence = take.confidence ?? "null";
    const newConfidenceDisplay =
      newConfidence !== undefined
        ? `${Math.round(newConfidence * 100)}%`
        : "undefined";

    if (isDryRun) {
      console.log(
        `[DRY RUN] Take ${take.id}: "${transcribedText.substring(0, 50)}${transcribedText.length > 50 ? "..." : ""}"`,
      );
      console.log(
        `  Expected: "${expectedScript.substring(0, 50)}${expectedScript.length > 50 ? "..." : ""}"`,
      );
      console.log(
        `  Old confidence: ${oldConfidence} → New confidence: ${newConfidenceDisplay}`,
      );
      console.log();
    } else {
      try {
        await db
          .update(segmentTakes)
          .set({ confidence: newConfidence })
          .where(eq(segmentTakes.id, take.id));

        console.log(
          `✅ Updated take ${take.id}: confidence ${oldConfidence} → ${newConfidenceDisplay}`,
        );
        updated++;
      } catch (error) {
        console.error(`❌ Error updating take ${take.id}:`, error);
        errors++;
      }
    }
  }

  console.log("\n📈 Summary:");
  console.log(`   Total takes found: ${takes.length}`);
  console.log(`   Takes to process: ${takesToProcess.length}`);

  if (isDryRun) {
    console.log(`   Would update: ${takesToProcess.length - skipped}`);
    console.log(`   Would skip: ${skipped}`);
  } else {
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
  }
}

backfillConfidence()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });
