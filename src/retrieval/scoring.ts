export interface RankedCandidate {
  chunkId: string;
  distance: number;
  vectorRaw: number;
  keywordRaw?: number;
}

function normalize(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return values.map(() => 1);
  }
  return values.map(v => (v - min) / (max - min));
}

export function vectorDistanceToScore(distance: number): number {
  return 1 / (1 + Math.max(0, distance));
}

export function rankHybrid(
  candidates: RankedCandidate[],
  alpha: number,
): Array<RankedCandidate & { vectorScore: number; keywordScore: number; finalScore: number }> {
  const vectorScores = normalize(candidates.map(c => c.vectorRaw));

  const keywordPrepared = candidates.map(c => {
    if (typeof c.keywordRaw !== "number") {
      return null;
    }
    // SQLite bm25 lower is better.
    return -c.keywordRaw;
  });

  const keywordValues = keywordPrepared.filter((x): x is number => x !== null);
  const keywordNormalizedValues = normalize(keywordValues);
  let keywordCursor = 0;

  return candidates
    .map((candidate, index) => {
      const vectorScore = vectorScores[index] ?? 0;
      let keywordScore = 0;
      if (keywordPrepared[index] !== null) {
        keywordScore = keywordNormalizedValues[keywordCursor] ?? 0;
        keywordCursor += 1;
      }
      const finalScore = alpha * vectorScore + (1 - alpha) * keywordScore;
      return {
        ...candidate,
        vectorScore,
        keywordScore,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
