import { RedisClient } from 'bun';
import { CONFIG } from '../config';

class _RedisService {
  private client: RedisClient;

  constructor(url: string) {
    this.client = new RedisClient(url);
  }


  // -- Получить значение ------------------------------

  get = async (key: string): Promise<string | null> => {
    return this.client.get(key);
  }


  // -- Записать с опциональным TTL (секунды) ------------------------------

  set = async (key: string, value: string, ttlSeconds?: number) => {
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }


  // -- Удалить ключ ------------------------------

  del = async (key: string) => {
    await this.client.del(key);
  }


  // -- Получить JSON ------------------------------

  getJson = async <T = unknown>(key: string): Promise<T | null> => {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }


  // -- Записать JSON с TTL ------------------------------

  setJson = async (key: string, value: unknown, ttlSeconds?: number) => {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}

export const RedisService = new _RedisService(CONFIG.redis.url);