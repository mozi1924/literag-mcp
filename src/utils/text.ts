export function estimateTokens(text: string): number {
  if (!text.trim()) {
    return 0;
  }
  // Rough heuristic for chunking decisions.
  return Math.ceil(text.length / 4);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
