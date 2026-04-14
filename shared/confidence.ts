/**
 * Calculate confidence score by comparing expected script with transcribed text.
 * Uses a diff algorithm to find differences between word sequences.
 * Confidence = 1 - (incorrect words / max length)
 */

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find differences between two word sequences using a diff algorithm.
 * Returns indices in the spokenWords array that don't match the expectedWords.
 *
 * This uses a simplified Myers diff approach to find the optimal alignment
 * between two sequences, handling insertions and deletions gracefully.
 */
function findIncorrectWordIndices(
  expectedWords: string[],
  spokenWords: string[],
): Set<number> {
  const incorrectIndices = new Set<number>();

  if (spokenWords.length === 0) {
    return incorrectIndices;
  }

  if (expectedWords.length === 0) {
    // All spoken words are incorrect if there's no expected script
    for (let i = 0; i < spokenWords.length; i++) {
      incorrectIndices.add(i);
    }
    return incorrectIndices;
  }

  // Build DP table for edit distance with backtracking info
  // dp[i][j] = minimum edit distance between expected[0..i-1] and spoken[0..j-1]
  const dp: number[][] = Array(expectedWords.length + 1)
    .fill(null)
    .map(() => Array(spokenWords.length + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= expectedWords.length; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= spokenWords.length; j++) {
    dp[0][j] = j;
  }

  // Fill DP table
  for (let i = 1; i <= expectedWords.length; i++) {
    for (let j = 1; j <= spokenWords.length; j++) {
      const cost = expectedWords[i - 1] === spokenWords[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion from expected
        dp[i][j - 1] + 1, // insertion into spoken
        dp[i - 1][j - 1] + cost, // substitution or match
      );
    }
  }

  // Backtrack to find aligned pairs
  let i = expectedWords.length;
  let j = spokenWords.length;
  const alignedSpokenIndices = new Set<number>();
  const matchedSpokenIndices = new Set<number>();

  while (i > 0 || j > 0) {
    if (i === 0) {
      // Only spoken words left - insertion
      j--;
      alignedSpokenIndices.add(j);
    } else if (j === 0) {
      // Only expected words left - deletion (not in spoken)
      i--;
    } else {
      const cost = expectedWords[i - 1] === spokenWords[j - 1] ? 0 : 1;

      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        // Diagonal move - substitution or match
        i--;
        j--;
        alignedSpokenIndices.add(j);
        if (cost === 0) {
          matchedSpokenIndices.add(j);
        }
      } else if (dp[i][j] === dp[i][j - 1] + 1) {
        // Left move - insertion into spoken
        j--;
        alignedSpokenIndices.add(j);
      } else {
        // Up move - deletion from expected
        i--;
      }
    }
  }

  // Any spoken index that was aligned but not matched is incorrect
  for (const idx of alignedSpokenIndices) {
    if (!matchedSpokenIndices.has(idx)) {
      incorrectIndices.add(idx);
    }
  }

  return incorrectIndices;
}

/**
 * Calculate confidence score by comparing expected script with transcribed text.
 * Returns a value between 0 and 1, where 1 is perfect match.
 */
export function calculateDiffConfidence(
  expectedScript: string | null | undefined,
  transcribedText: string | null | undefined,
): number | undefined {
  if (!expectedScript || !transcribedText) {
    return undefined;
  }

  const expectedWords = expectedScript
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map(normalizeWord);

  const spokenWords = transcribedText
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map(normalizeWord);

  if (spokenWords.length === 0) {
    return expectedWords.length === 0 ? 1 : 0;
  }

  if (expectedWords.length === 0) {
    return 0;
  }

  const incorrectIndices = findIncorrectWordIndices(expectedWords, spokenWords);

  // Calculate confidence based on diff: 1 - (incorrect words / max length)
  const maxLen = Math.max(expectedWords.length, spokenWords.length);
  if (maxLen === 0) {
    return 1;
  }

  return 1 - incorrectIndices.size / maxLen;
}
