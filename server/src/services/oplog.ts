export interface OpLogEntry {
  id: string;
  timestamp: string;
  operation: 'search' | 'remember' | 'dreaming' | 'startup';
  input: any;
  result: any;
  durationMs: number;
}

class _OpLog {
  private entries: OpLogEntry[] = [];
  private maxSize = 500;

  add = (entry: Omit<OpLogEntry, 'id' | 'timestamp'>) => {
    this.entries.unshift({
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(0, this.maxSize);
    }
  }

  getRecent = (limit = 50): OpLogEntry[] => {
    return this.entries.slice(0, limit);
  }
}

export const OpLog = new _OpLog();