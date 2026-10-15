/** Small token bucket, keyed by string. Used for per-participant socket rate limiting. */
export class TokenBuckets {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.prune(now);
    return allowed;
  }

  private prune(now: number) {
    for (const [k, b] of this.buckets) if (now - b.at > 60_000) this.buckets.delete(k);
  }

  delete(key: string) {
    this.buckets.delete(key);
  }
}
