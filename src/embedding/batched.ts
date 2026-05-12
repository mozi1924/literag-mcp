import type { EmbeddingProvider } from "../types.js";

interface EmbedRequestState {
  results: number[][];
  remaining: number;
  settled: boolean;
  resolve: (value: number[][]) => void;
  reject: (reason?: unknown) => void;
}

interface EmbedUnit {
  text: string;
  request: EmbedRequestState;
  index: number;
}

export class BatchedEmbeddingProvider implements EmbeddingProvider {
  private readonly queue: EmbedUnit[] = [];
  private readonly maxBatchTexts: number;
  private readonly maxConcurrency: number;
  private activeWorkers = 0;
  private pumpScheduled = false;

  constructor(
    private readonly inner: EmbeddingProvider,
    options: {
      maxBatchTexts: number;
      maxConcurrency: number;
    },
  ) {
    this.maxBatchTexts = Math.max(1, Math.floor(options.maxBatchTexts));
    this.maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency));
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    return new Promise<number[][]>((resolve, reject) => {
      const request: EmbedRequestState = {
        results: new Array(texts.length),
        remaining: texts.length,
        settled: false,
        resolve,
        reject,
      };

      for (let i = 0; i < texts.length; i += 1) {
        this.queue.push({
          text: texts[i],
          request,
          index: i,
        });
      }

      this.schedulePump();
    });
  }

  private schedulePump(): void {
    if (this.pumpScheduled) {
      return;
    }
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pumpWorkers();
    });
  }

  private pumpWorkers(): void {
    while (this.activeWorkers < this.maxConcurrency && this.queue.length > 0) {
      this.activeWorkers += 1;
      void this.runWorker();
    }
  }

  private async runWorker(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.maxBatchTexts);
        try {
          const vectors = await this.inner.embed(batch.map(unit => unit.text));
          if (vectors.length !== batch.length) {
            throw new Error("Batched embedding provider received mismatched embedding count");
          }
          for (let i = 0; i < batch.length; i += 1) {
            const unit = batch[i];
            const vector = vectors[i];
            if (!vector) {
              throw new Error("Batched embedding provider missing embedding vector");
            }
            if (unit.request.settled) {
              continue;
            }
            unit.request.results[unit.index] = vector;
            unit.request.remaining -= 1;
            if (unit.request.remaining === 0) {
              unit.request.settled = true;
              unit.request.resolve(unit.request.results);
            }
          }
        } catch (error) {
          this.failUnits(batch, error);
        }
      }
    } catch (error) {
      this.failUnits(this.queue.splice(0, this.queue.length), error);
    } finally {
      this.activeWorkers -= 1;
      if (this.queue.length > 0) {
        this.schedulePump();
      }
    }
  }

  private failUnits(failed: EmbedUnit[], error: unknown): void {
    if (failed.length === 0) {
      return;
    }
    const pending = new Set<EmbedRequestState>();
    for (const unit of failed) {
      pending.add(unit.request);
    }
    for (const request of pending) {
      if (!request.settled) {
        request.settled = true;
        request.reject(error);
      }
    }
  }
}
