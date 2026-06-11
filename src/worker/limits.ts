import type { Env } from "./env";

/**
 * Globální denní strop GM tahů — tvrdá ochrana nákladů.
 * Bez KV bindingu se limit nevynucuje (lokální vývoj); v produkci KV doporučeno.
 */
export async function checkDailyLimit(env: Env): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = Math.max(1, Number(env.DAILY_TURN_LIMIT ?? "150") || 150);
  if (!env.LIMITS) return { ok: true, used: 0, limit };

  const key = `turns:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.LIMITS.get(key)) ?? "0") || 0;
  if (used >= limit) return { ok: false, used, limit };

  // KV není atomické — pro ochranný strop to stačí
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  return { ok: true, used: used + 1, limit };
}
