import type { Env } from "./env";
import { codeMatches, issueToken, verifyToken } from "./auth";
import { checkDailyLimit } from "./limits";
import { runGmTurn } from "./gm";
import { runNpcTurn } from "./npc";
import type { GmRequestBody, NpcRequestBody } from "../shared/types";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** ACCESS_CODE nenastavený = lokální vývoj, auth se nevynucuje. */
function devMode(env: Env): boolean {
  return !env.ACCESS_CODE;
}

async function authorized(env: Env, request: Request): Promise<boolean> {
  if (devMode(env)) return true;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return verifyToken(env.ACCESS_CODE!, token);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        const { code } = (await request.json()) as { code?: string };
        if (devMode(env)) return json({ token: "dev" });
        if (!code || !codeMatches(env.ACCESS_CODE!, code)) {
          return json({ error: "Neplatný přístupový kód." }, 401);
        }
        return json({ token: await issueToken(env.ACCESS_CODE!) });
      }

      if (url.pathname === "/api/gm" && request.method === "POST") {
        if (!(await authorized(env, request))) return json({ error: "Nepřihlášen." }, 401);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "Chybí ANTHROPIC_API_KEY." }, 500);

        const limit = await checkDailyLimit(env);
        if (!limit.ok) {
          return json({ error: `Denní limit hry (${limit.limit} tahů) je vyčerpán. Zkus to zítra.` }, 429);
        }

        const body = (await request.json()) as GmRequestBody;
        if (!body?.state || typeof body.playerInput !== "string") {
          return json({ error: "Neplatný požadavek." }, 400);
        }
        const stream = await runGmTurn(env.ANTHROPIC_API_KEY, body);
        return new Response(stream, { headers: SSE_HEADERS });
      }

      if (url.pathname === "/api/npc" && request.method === "POST") {
        if (!(await authorized(env, request))) return json({ error: "Nepřihlášen." }, 401);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "Chybí ANTHROPIC_API_KEY." }, 500);

        const limit = await checkDailyLimit(env);
        if (!limit.ok) {
          return json({ error: `Denní limit hry (${limit.limit} tahů) je vyčerpán. Zkus to zítra.` }, 429);
        }

        const body = (await request.json()) as NpcRequestBody;
        if (!body?.npcId || !body?.state || typeof body.playerInput !== "string") {
          return json({ error: "Neplatný požadavek." }, 400);
        }
        const stream = await runNpcTurn(env.ANTHROPIC_API_KEY, body);
        return new Response(stream, { headers: SSE_HEADERS });
      }

      return json({ error: "Nenalezeno." }, 404);
    } catch (err) {
      console.error(`[${url.pathname}]`, err);
      return json({ error: err instanceof Error ? err.message : "Chyba serveru." }, 500);
    }
  },
};
