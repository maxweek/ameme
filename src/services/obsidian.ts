import { CONFIG } from '../config';

class _ObsidianService {
  private baseUrl: string;
  private auth: string;

  constructor() {
    const { url, db, user, password } = CONFIG.couchdb;
    this.baseUrl = `${url}/${db}`;
    this.auth = 'Basic ' + btoa(`${user}:${password}`);
  }


  // -- Прочитать документ по пути (напр. 'система/SOUL.md') -----------------------------------------

  read = async (path: string): Promise<string | null> => {
    const docId = this.pathToDocId(path);
    try {
      const doc = await this.fetchDoc(docId);
      if (!doc) return null;
      return this.assembleContent(doc);
    } catch {
      return null;
    }
  }


  // -- Записать/обновить документ -----------------------------------------

  write = async (path: string, content: string) => {
    const docId = this.pathToDocId(path);
    const existing = await this.fetchDoc(docId);

    const body: Record<string, unknown> = {
      _id: docId,
      type: 'plain',
      data: content,
    };

    if (existing?._rev) {
      body._rev = existing._rev;
    }

    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.auth,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Obsidian write failed: ${res.status} ${await res.text()}`);
    }
  }


  // -- Список документов (по префиксу) -----------------------------------------

  list = async (prefix?: string): Promise<string[]> => {
    const params = new URLSearchParams({ include_docs: 'false' });
    if (prefix) {
      params.set('startkey', JSON.stringify(prefix));
      params.set('endkey', JSON.stringify(prefix + '\ufff0'));
    }

    const res = await fetch(`${this.baseUrl}/_all_docs?${params}`, {
      headers: { Authorization: this.auth },
    });

    if (!res.ok) return [];
    const data = await res.json() as { rows: Array<{ id: string }> };


    return data?.rows
      .map((r: any) => r.id as string)
      .filter((id: string) => !id.startsWith('_'));
  }


  // -- Поиск по тексту (Mango query) -----------------------------------------

  search = async (query: string, limit = 10): Promise<Array<{ path: string; snippet: string }>> => {
    const res = await fetch(`${this.baseUrl}/_find`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.auth,
      },
      body: JSON.stringify({
        selector: {
          data: { $regex: query },
        },
        fields: ['_id', 'data'],
        limit,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as { docs: Array<{ _id: string; data?: string }> };

    return (data.docs ?? []).map((doc: any) => ({
      path: doc._id,
      snippet: (doc.data ?? '').slice(0, 200),
    }));
  }


  // ── Internal ──────────────────────────────────────────

  private fetchDoc = async (docId: string): Promise<any | null> => {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(docId)}`, {
      headers: { Authorization: this.auth },
    });
    if (!res.ok) return null;
    
    return await res.json() as Record<string, unknown>;
  }


  // -- LiveSync хранит контент в chunks (children) или напрямую в data -----------------------------------------

  private assembleContent = (doc: any): string => {
    // Простой формат — data как строка
    if (typeof doc.data === 'string') return doc.data;

    // LiveSync chunked формат
    if (Array.isArray(doc.children)) {
      return doc.children.map((c: any) => c.data ?? '').join('');
    }

    return JSON.stringify(doc);
  }


  // -- Путь → doc_id для CouchDB -----------------------------------------

  private pathToDocId = (path: string): string => {
    return path.replace(/^\/+/, '');
  }
}

export const ObsidianService = new _ObsidianService();