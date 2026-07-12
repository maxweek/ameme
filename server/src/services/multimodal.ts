import { CONFIG } from '../config';

export interface Attachment {
  type: 'image' | 'audio' | 'file';
  data: string;          // base64
  mimeType: string;      // image/png, audio/webm, application/pdf
  filename?: string;
}

export interface ProcessedAttachment {
  type: Attachment['type'];
  mimeType: string;
  filename?: string;
  storageKey: string;    // путь в MinIO/filesystem
  description: string;   // текстовое описание для extraction
}

class _MultimodalService {

  /** Обработать attachment → текстовое описание + сохранить binary */
  process = async (attachment: Attachment): Promise<ProcessedAttachment> => {
    // 1. Сохранить бинарные данные
    const storageKey = await this.store(attachment);

    // 2. Получить текстовое описание
    let description: string;

    switch (attachment.type) {
      case 'image':
        description = await this.describeImage(attachment.data, attachment.mimeType);
        break;
      case 'audio':
        description = await this.transcribeAudio(attachment.data, attachment.mimeType);
        break;
      case 'file':
        description = await this.extractFileText(attachment.data, attachment.mimeType);
        break;
      default:
        description = `[Вложение: ${attachment.mimeType}]`;
    }

    return {
      type: attachment.type,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      storageKey,
      description,
    };
  }

  /** Batch: несколько attachments */
  processAll = async (attachments: Attachment[]): Promise<ProcessedAttachment[]> => {
    return Promise.all(attachments.map(a => this.process(a)));
  }

  // ── Image → text (Vision LLM) ────────────────────────

  private describeImage = async (base64: string, mimeType: string): Promise<string> => {
    try {
      const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.multimodal.visionModel,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: 'text',
                text: 'Опиши что изображено на этом изображении. Кратко, 2-3 предложения. Если есть текст — перепиши его. Если есть люди — опиши что они делают. Отвечай на русском.',
              },
            ],
          }],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        console.error(`[multimodal] vision failed: ${response.status}`);
        return '[Изображение: не удалось распознать]';
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content ?? '[Изображение: пустой ответ]';
    } catch (err) {
      console.error('[multimodal] vision error:', err);
      return '[Изображение: ошибка распознавания]';
    }
  }

  // ── Audio → text (Whisper) ────────────────────────────

  private transcribeAudio = async (base64: string, mimeType: string): Promise<string> => {
    try {
      // OpenAI-compatible Whisper API
      const blob = Buffer.from(base64, 'base64');
      const formData = new FormData();
      formData.append('file', new Blob([blob], { type: mimeType }), 'audio.webm');
      formData.append('model', CONFIG.multimodal.whisperModel);
      formData.append('language', 'ru');

      const response = await fetch(`${CONFIG.multimodal.whisperUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        console.error(`[multimodal] whisper failed: ${response.status}`);
        return '[Аудио: не удалось транскрибировать]';
      }

      const data = await response.json() as any;
      return data.text ?? '[Аудио: пустой ответ]';
    } catch (err) {
      console.error('[multimodal] whisper error:', err);
      return '[Аудио: ошибка транскрибации]';
    }
  }

  // ── File → text ───────────────────────────────────────

  private extractFileText = async (base64: string, mimeType: string): Promise<string> => {
    const buffer = Buffer.from(base64, 'base64');

    // Plain text / code
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const text = buffer.toString('utf-8');
      return text.length > 2000 ? text.slice(0, 1500) + '\n...\n' + text.slice(-500) : text;
    }

    // PDF — через Vision LLM как изображение страниц (fallback)
    if (mimeType === 'application/pdf') {
      return this.describeImage(base64, mimeType);
    }

    return `[Файл: ${mimeType}, ${buffer.length} bytes]`;
  }

  // ── Storage ───────────────────────────────────────────

  private store = async (attachment: Attachment): Promise<string> => {
    const key = `attachments/${Date.now()}_${attachment.filename ?? crypto.randomUUID()}`;

    if (CONFIG.multimodal.storageType === 'minio') {
      await this.storeMinIO(key, attachment);
    } else {
      await this.storeLocal(key, attachment);
    }

    return key;
  }

  private storeMinIO = async (key: string, attachment: Attachment) => {
    const buffer = Buffer.from(attachment.data, 'base64');

    const response = await fetch(`${CONFIG.multimodal.minioUrl}/${CONFIG.multimodal.minioBucket}/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    if (!response.ok) {
      console.error(`[multimodal] MinIO store failed: ${response.status}`);
    }
  }

  private storeLocal = async (key: string, attachment: Attachment) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dir = path.dirname(`${CONFIG.multimodal.localStoragePath}/${key}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      `${CONFIG.multimodal.localStoragePath}/${key}`,
      Buffer.from(attachment.data, 'base64'),
    );
  }
}

export const MultimodalService = new _MultimodalService();