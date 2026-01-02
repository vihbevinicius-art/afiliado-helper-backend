export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const url = req.query?.url;
    if (!url) return res.status(400).json({ error: "Faltou a URL" });

    const store = detectStore(url);

    // DEBUG: pra ver exatamente o que ele recebeu
    // (se você quiser depois a gente remove)
    if (req.query?.debug === "1") {
      return res.status(200).json({ ok: true, receivedUrl: url, store });
    }

    if (store === "ml") {
      const id = await getMlId(url);
      if (!id) {
        return res.status(400).json({
          error: "Não achei o ID do Mercado Livre",
          hint: "Tenta com ?debug=1 pra validar a URL recebida"
        });
      }
if (store === "ml") {
  const id = await getMlId(url);
  if (!id) {
    return res.status(400).json({
      error: "Não achei o ID do Mercado Livre",
      hint: "Tenta com ?debug=1 pra validar a URL recebida"
    });
  }

  const item = await fetchJson(`https://api.mercadolibre.com/items/${id}`);

  return res.json({
    store: "mercado_livre",
    title: item.title || null,
    image: item?.pictures?.[0]?.url || item.thumbnail || null,
    price: item.price ?? null,
    currency: item.currency_id || "BRL",
    coupon: null,
    mlb: id
  });
}
 async function fetchJson(u) {
  const r = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Referer": "https://www.mercadolivre.com.br/"
    }
  });
  if (!r.ok) throw new Error(`Falha na API do ML: HTTP ${r.status}`);
  return await r.json();
}

    }

    if (store === "amazon") {
      return res.json({ store: "amazon", error: "Amazon ainda não ligado" });
    }

    if (store === "ali") {
      return res.json({ store: "aliexpress", error: "AliExpress ainda não ligado" });
    }

    return res.status(400).json({ error: "Loja não reconhecida", store });
  } catch (e) {
    // ERRO REAL AQUI
    return res.status(500).json({
      error: "Crash no backend",
      message: e?.message || String(e),
      stack: (e?.stack || "").split("\n").slice(0, 6) // só um pedacinho
    });
  }
}

function detectStore(link) {
  try {
    const h = new URL(link).hostname;
    if (h.includes("mercadolivre")) return "ml";
    if (h.includes("amazon")) return "amazon";
    if (h.includes("aliexpress")) return "ali";
  } catch {}
  return "unknown";
}

function extractMlIdFromText(text) {
  const m = String(text).match(/MLB-?\d{6,}/i);
  return m ? m[0].replace("-", "").toUpperCase() : null;
}

async function getMlId(productUrl) {
  // 1) tenta na URL
  const fromUrl = extractMlIdFromText(productUrl);
  if (fromUrl) return fromUrl;

  // 2) tenta seguir redirecionamento pra URL final
  const finalUrl = await resolveFinalUrl(productUrl);

  const fromFinalUrl = extractMlIdFromText(finalUrl);
  if (fromFinalUrl) return fromFinalUrl;

  // 3) tenta no HTML da página
  const html = await fetchText(finalUrl);
  const fromHtml = extractMlIdFromText(html);
  if (fromHtml) return fromHtml;

  return null;
}

async function resolveFinalUrl(originalUrl) {
  try {
    const r = await fetch(originalUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    return r.url || originalUrl;
  } catch {
    return originalUrl;
  }
}

async function fetchText(u) {
  const r = await fetch(u, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9" }
  });
  if (!r.ok) throw new Error(`Falha ao abrir página do ML: HTTP ${r.status}`);
  return await r.text();
}

async function fetchJson(u) {
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Falha na API do ML: HTTP ${r.status}`);
  return await r.json();
}
