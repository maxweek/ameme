// ── Utils ───────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}


export function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

export const ANTONYM_PAIRS: [string, string][] = [
  ['LIKES', 'DISLIKES'], ['USES', 'LEFT'],
  ['WORKS_AT', 'LEFT'], ['OWNS', 'SOLD'],
  ['STARTED', 'FINISHED'], ['ENABLED', 'DISABLED'],
  ['PREFERS', 'AVOIDS'],
];

export const REPLACEMENT_PAIRS: [string, string][] = [
  ['USES', 'REPLACES'],
  ['USES', 'SWITCHED_TO'],
  ['USES', 'USED'],
  ['USES', 'PREVIOUSLY_USED'],    // ← добавь
  ['USES', 'STOPPED_USING'],      // ← добавь
  ['WORKS_AT', 'LEFT'],
  ['WORKS_AS', 'BECAME'],
  ['HAS_SKILL', 'BECAME'],
  ['IS', 'BECAME'],
  ['LIVES_IN', 'MOVED_TO'],
];

export function isAntonym(a: string, b: string): boolean {
  return ANTONYM_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function isReplacement(existing: string, incoming: string): boolean {
  return REPLACEMENT_PAIRS.some(([old, rep]) => existing === old && incoming === rep);
}