export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const url = req.query?.url;
    if (!url) return res.status(400).json({ error: "Faltou a URL" });

    const store = detectStore(url);

    if (req.query?.debug === "1") {
      return res.status(200).json({ ok: true, receivedUrl: url, store });
    }

    if (store === "ml") {
      const finalUrl = await resolveFinalUrl(url);
      const html = await fetchText(finalUrl);

      const title = pickMeta(html, "og:title") || pickTitle(html) || null;
      const image = pickMeta(html, "og:image") || null;
      const price = pickPrice(html);

      return res.json({
        store: "mercado_livre",
        title,
        image,
        price,
        currency: "BRL",
        coupon: null,
        source: "html"
      });
    }

    if (store === "amazon") {
      return res.json({ store: "amazon", error: "Amazon ainda não ligado" });
    }

    if (store === "ali") {
      return res.json({ store: "aliexpress", error: "AliExpress ainda não ligado" });
    }

    return res.status(400).json({ error: "Loja não reconhecida", store });
  } catch (e) {
    return res.status(500).json({
      error: "Crash no backend",
      message: e?.message || String(e),
      stack: (e?.stack || "").split("\n").slice(0, 10)
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
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
    }
  });
  if (!r.ok) throw new Error(`Falha ao abrir página: HTTP ${r.status}`);
  return await r.text();
}

function pickMeta(html, property) {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]).trim() : null;
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtml(m[1]).replace(/\s+-\s+Mercado Livre.*$/i, "").trim() : null;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function pickPrice(html) {
  // tenta metas comuns
  const metaPrice =
    pickMeta(html, "product:price:amount") ||
    pickMeta(html, "og:price:amount");

  if (metaPrice) {
    const n = Number(String(metaPrice).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : metaPrice;
  }

  // fallback: procura "R$ 123,45"
  const m = html.match(/R\$\s*([\d\.]+,\d{2})/);
  if (m) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : m[1];
  }

  return null;
}
