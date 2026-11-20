import { render, buildPayload, KINDS } from "./core.js";
const CORS = { "access-control-allow-origin": "*" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const out = r => r.json ? J(r.json, r.status) : new Response(r.body, { status: r.status, headers: { "content-type": r.type, "cache-control": "public, max-age=3600", ...CORS, ...(r.hdr || {}) } });
const SECRETS = e => [["rapidapi", e.PROXY_SECRET], ["apimarket", e.PROXY_SECRET_APIMARKET], ["zyla", e.PROXY_SECRET_ZYLA]];
export function marketplace(req, env) { const h = req.headers.get("X-RapidAPI-Proxy-Secret"); if (!h) return null; for (const [n, s] of SECRETS(env)) if (s && h === s) return n; return null; }
async function params(req, u) {
  const q = Object.fromEntries(u.searchParams);
  if (req.method === "POST") { try { Object.assign(q, await req.json()); } catch (e) { return { err: "bad json" }; } }
  return { q };
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === "/health") return J({ ok: true });
    const mk = marketplace(req, env);
    if (!mk) return J({ error: "forbidden" }, 403);
    console.log(JSON.stringify({ mk, path: u.pathname }));
    if (req.method !== "GET" && req.method !== "POST") return J({ error: "method not allowed" }, 405);
    if (u.pathname === "/qr") { const { q, err } = await params(req, u); return err ? J({ error: err }, 400) : out(await render(q)); }
    const m = /^\/qr\/([a-z]+)$/.exec(u.pathname);
    if (m && KINDS.includes(m[1])) {
      const { q, err } = await params(req, u); if (err) return J({ error: err }, 400);
      const p = buildPayload(m[1], q); if (p.error) return J({ error: p.error }, 400);
      return out(await render({ ...q, data: p.data }));
    }
    if (u.pathname === "/qr/batch" && req.method === "POST") {
      let b; try { b = await req.json(); } catch (e) { return J({ error: "bad json" }, 400); }
      const list = Array.isArray(b.items) ? b.items : null;
      if (!list || !list.length) return J({ error: 'body must be {"items":[{"data":"..."},...]} (max 10); shared options (ecc, size, margin, fg, bg) may be set on each item' }, 400);
      if (list.length > 10) return J({ error: "max 10 items per batch" }, 400);
      const results = await Promise.all(list.map(async it => { const r = await render({ ...(it || {}), format: "json" }); return r.json || { error: r.json?.error }; }));
      return J({ count: results.length, results });
    }
    return J({ error: "not found" }, 404);
  }
};
