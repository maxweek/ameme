import { CONFIG } from '../config';

interface ReadResult {
  path: string;
  content: string;
}

interface DocGraphNode {
  id: string;
  name: string;
  folder: string;
}

interface DocGraphLink {
  source: string;
  target: string;
}

interface DocGraph {
  nodes: DocGraphNode[];
  links: DocGraphLink[];
}


class _ObsidianService {
  private baseUrl: string;
  private auth: string;

  private idCache: Map<string, string> | null = null;

  private docGraphCache: DocGraph | null = null;
  private docGraphCacheTime = 0;
  private DOC_GRAPH_TTL = 60_000; // 1 min

  constructor() {
    const { url, db, user, password } = CONFIG.couchdb;
    this.baseUrl = `${url}/${db}`;
    this.auth = 'Basic ' + btoa(`${user}:${password}`);
  }

  ensureDb = async () => {
    try {
      await fetch(this.baseUrl, {
        method: 'PUT',
        headers: { Authorization: this.auth },
      });
    } catch {
      // Already exists
    }
  }


  // -- Прочитать документ по пути (напр. 'система/SOUL.md') -----------------------------------------

  read = async (path: string): Promise<ReadResult | null> => {
    const docId = this.pathToDocId(path);
    try {
      // Exact match variants
      for (const tryId of [docId, docId + '.md', docId.replace(/\.md$/, '')]) {
        const doc = await this.fetchDoc(tryId);
        if (doc && !doc.deleted) {
          return { path: doc._id, content: await this.assembleContent(doc) };
        }
      }

      // Case-insensitive fallback
      const doc = await this.fetchDocCaseInsensitive(docId);
      if (doc && !doc.deleted) {
        return { path: doc._id, content: await this.assembleContent(doc) };
      }

      return null;
    } catch {
      return null;
    }
  }



  private fetchDocCaseInsensitive = async (docId: string): Promise<any | null> => {
    if (!this.idCache) {
      const res = await fetch(`${this.baseUrl}/_all_docs?include_docs=false`, {
        headers: { Authorization: this.auth },
      });
      if (!res.ok) return null;
      const data = await res.json() as { rows: Array<{ id: string }> };
      this.idCache = new Map(
        data.rows
          .filter(r => !r.id.startsWith('_') && !r.id.startsWith('h:'))
          .map(r => [r.id.toLowerCase(), r.id])
      );
    }

    const lower = docId.toLowerCase();
    const realId = this.idCache.get(lower)
      ?? this.idCache.get(lower + '.md')
      ?? this.idCache.get(lower.replace(/\.md$/, ''));

    if (!realId) return null;
    return this.fetchDoc(realId);
  }



  // -- Записать/обновить документ -----------------------------------------

  write = async (path: string, content: string) => {
    this.idCache = null; // сбросить после записи
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
    return data.rows
      .map(r => r.id)
      .filter(id => !id.startsWith('_') && !id.startsWith('h:'));
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

  private assembleContent = async (doc: any): Promise<string> => {
    // Простой формат — data как строка
    if (typeof doc.data === 'string' && doc.data.length > 0) {
      return doc.data;
    }

    // LiveSync chunked формат — children содержит id чанков
    if (Array.isArray(doc.children) && doc.children.length > 0) {
      const chunks: string[] = [];
      for (const childId of doc.children) {
        const child = await this.fetchDoc(childId);
        if (child?.data) {
          chunks.push(child.data);
        }
      }
      return chunks.join('');
    }

    // Нет данных
    return '';
  }

  getDocGraph = async (): Promise<DocGraph> => {
    if (this.docGraphCache && Date.now() - this.docGraphCacheTime < this.DOC_GRAPH_TTL) {
      return this.docGraphCache;
    }

    const docs = await this.list();
    const docSet = new Set(docs.map(d => d.toLowerCase()));
    const nodes: DocGraphNode[] = [];
    const links: DocGraphLink[] = [];

    for (const doc of docs) {
      const parts = doc.split('/');
      nodes.push({
        id: doc,
        name: parts[parts.length - 1].replace(/\.md$/, ''),
        folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
      });

      // Parse [[wikilinks]] from content
      const result = await this.read(doc);
      const content = result?.content ?? '';
      const wikilinks = content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g);

      for (const match of wikilinks) {
        let target = match[1].trim();
        if (!target.endsWith('.md')) target += '.md';

        // Resolve: try exact, then case-insensitive
        const resolved = docs.find(d =>
          d.toLowerCase() === target.toLowerCase() ||
          d.toLowerCase().endsWith('/' + target.toLowerCase())
        );

        if (resolved) {
          links.push({ source: doc, target: resolved });
        }
      }
    }

    this.docGraphCache = { nodes, links };
    this.docGraphCacheTime = Date.now();
    return this.docGraphCache;
  }


  // -- Путь → doc_id для CouchDB -----------------------------------------

  private pathToDocId = (path: string): string => {
    return path.replace(/^\/+/, '');
  }
}

export const ObsidianService = new _ObsidianService();