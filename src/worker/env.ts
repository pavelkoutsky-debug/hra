/** Minimální typy prostředí Workeru (bez závislosti na @cloudflare/workers-types). */
export interface KVNamespaceLite {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  /** Anthropic API klíč (wrangler secret) */
  ANTHROPIC_API_KEY: string;
  /** Přístupový kód pro hráče (wrangler secret). Nenastavený = dev režim, projde cokoliv. */
  ACCESS_CODE?: string;
  /** Denní strop GM tahů (vars, default 150) */
  DAILY_TURN_LIMIT?: string;
  /** Volitelný KV namespace pro počítadlo limitů */
  LIMITS?: KVNamespaceLite;
  /** Statické soubory (vite build) */
  ASSETS: { fetch(request: Request): Promise<Response> };
}
