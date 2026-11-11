import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Content-Type": "application/json" };
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!; const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const clientHeaders = { "Authorization": auth, "apikey": anon, "Content-Type": "application/json" };
  const symbol = (new URL(req.url).searchParams.get("symbol") || "").trim().toUpperCase();
  const rest = `${url}/rest/v1/watchlist_items`;
  try {
    if (req.method === "GET") {
      const r=await fetch(`${rest}?select=id,symbol,created_at&order=created_at.desc`,{headers:clientHeaders});
      return new Response(await r.text(),{status:r.status,headers:cors});
    }
    if (req.method === "POST") {
      if (!/^[A-Z.]{1,12}$/.test(symbol)) return new Response(JSON.stringify({error:"Invalid symbol"}),{status:400,headers:cors});
      const r=await fetch(rest,{method:"POST",headers:{...clientHeaders,"Prefer":"return=representation,resolution=ignore-duplicates"},body:JSON.stringify({symbol})});
      return new Response(await r.text(),{status:r.status,headers:cors});
    }
    if (req.method === "DELETE") {
      if (!/^[A-Z.]{1,12}$/.test(symbol)) return new Response(JSON.stringify({error:"Invalid symbol"}),{status:400,headers:cors});
      const r=await fetch(`${rest}?symbol=eq.${encodeURIComponent(symbol)}`,{method:"DELETE",headers:clientHeaders});
      return new Response(JSON.stringify({ok:r.ok}),{status:r.ok?200:r.status,headers:cors});
    }
    return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:cors});
  } catch { return new Response(JSON.stringify({error:"Database request failed"}),{status:502,headers:cors}); }
});
