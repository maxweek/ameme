import { CONFIG } from '../config';

class _EmbeddingService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }


  // -- Embed текст для сохранения (passage) ------------------------------

  embedPassage = async (text: string): Promise<number[]> => {
    return this.embed(`passage: ${text}`);
  }


  // -- Embed текст для поиска (query) ------------------------------

  embedQuery = async (text: string): Promise<number[]> => {
    return this.embed(`query: ${text}`);
  }


  // -- Batch embed для backfill ------------------------------

  embedPassages = async (texts: string[]): Promise<number[][]> => {
    const res = await fetch(`${this.url}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: texts.map(t => `passage: ${t}`),
      }),
    });

    if (!res.ok) {
      throw new Error(`TEI batch embed failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error(`Unexpected TEI response format: ${JSON.stringify(data)}`);
    }

    return data;
  }


  // ── Internal embed method ─────────────────────────────────────────

  private embed = async (input: string): Promise<number[]> => {
    const res = await fetch(`${this.url}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: input }),
    });

    if (!res.ok) {
      throw new Error(`TEI embed failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error(`Unexpected TEI response format: ${JSON.stringify(data)}`);
    }

    return Array.isArray(data[0]) ? data[0] : data;
  }
}

export const EmbeddingService = new _EmbeddingService(CONFIG.embedding.url);