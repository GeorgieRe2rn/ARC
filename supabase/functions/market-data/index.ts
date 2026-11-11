import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS", "Content-Type": "application/json" };
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = url.searchParams.get("interval") || "1day";
  if (!/^[A-Z.]{1,12}$/.test(symbol)) return new Response(JSON.stringify({ error: "Invalid symbol" }), { status: 400, headers: cors });
  if (!["1min","5min","15min","30min","1h","1day","1week","1month"].includes(interval)) return new Response(JSON.stringify({ error: "Invalid interval" }), { status: 400, headers: cors });
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "Market data provider is not configured" }), { status: 503, headers: cors });
  const endpoint = new URL("https://api.twelvedata.com/time_series");
  endpoint.searchParams.set("symbol", symbol); endpoint.searchParams.set("interval", interval); endpoint.searchParams.set("outputsize", "100"); endpoint.searchParams.set("apikey", key);
  try {
    const upstream = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    const payload = await upstream.json();
    if (!upstream.ok || payload.status === "error") return new Response(JSON.stringify({ error: payload.message || "Market data request failed" }), { status: upstream.status || 502, headers: cors });
    return new Response(JSON.stringify({ symbol, meta: payload.meta, values: payload.values, source: "Twelve Data", fetched_at: new Date().toISOString() }), { status: 200, headers: cors });
  } catch { return new Response(JSON.stringify({ error: "Market data provider is temporarily unavailable" }), { status: 502, headers: cors }); }
});
