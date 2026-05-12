import type { EmbeddingProvider } from "../types.js";

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly dimensions?: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Embedding request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as EmbeddingResponse;
    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
      throw new Error("Embedding API returned unexpected data shape");
    }

    return payload.data.map(item => item.embedding);
  }
}
