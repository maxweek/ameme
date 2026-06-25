import { CONFIG } from '../config';

class _RerankerService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  rerank = async (query: string, documents: string[]): Promise<number[]> => {
    if (documents.length === 0) return [];

    try {
      const res = await fetch(`${this.url}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          texts: documents,
          raw_scores: false,
        }),
      });

      if (!res.ok) {
        console.error(`[reranker] failed: ${res.status}`);
        return documents.map(() => 0);
      }

      const data = await res.json() as Array<{ index: number; score: number }>;
      const scores = new Array<number>(documents.length).fill(0);
      for (const item of data) {
        scores[item.index] = item.score;
      }
      return scores;
    } catch (err) {
      console.error('[reranker] error:', err);
      return documents.map(() => 0);
    }
  }
}

export const RerankerService = new _RerankerService(CONFIG.reranker.url);
