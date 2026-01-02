export default async function handler(req, res) {
  // CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const url = req.query?.url;
    if (!url) return res.status(400).json({ error: "Faltou a URL" });

    const store = detectStore(url);

    // Debug: só valida entrada e loja detectada
    if (req.query?.debug === "1") {
      return res.status(200).json({ ok: true, receivedUrl: url, store });
    }

    // Resolve redirecionamentos (short links etc)
    const finalUrl = await resolveFinalUrl(url);
    const html = await fetchText(finalUrl);

    if (store === "ml") {
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
        source: "html",
      });
    }

    if (store === "amazon") {
      // Amazon é chata: pode retornar "Robot Check" / bloqueio
      const title =
        pickMeta(html, "og:title") ||
        pickTitle(html) ||
        pickMetaByName(html, "title") ||
        null;

      const image =
        pickMeta(html, "og:image") ||
        pickMetaByName(html, "twitter:image") ||
        null;

      const price = pickPrice(html);

      // Se tiver cara de bloqueio, já devolve um erro amigável
      const isBlocked =
        /robot check|captcha|automated access|sorry/i.test(html);

      if (isBlocked) {
        return res.status(200).json({
          store: "amazon",
          error: "Amazon bloqueou o robô (captcha/robot check).",
          title,
          image,
          price,
          currency: "BRL",
          coupon: null,
          source: "html",
        });
      }

      return res.json({
        store: "amazon",
        title,
        image,
        price,
        currency: "BRL",
        coupon: null,
        source: "html",
      });
    }

    if (store === "ali") {
      return res.json({
        store: "aliexpress",
        error: "AliExpress ainda não ligado",
      });
    }

    return res.status(400).json({ error: "Loja não reconhecida", store });
  } catch (e) {
    return res.status(500).json({
      error: "Crash no backend",
      message: e?.message || String(e),
      stack: (e?.stack || "").split("\n").slice(0, 10),
    });
  }
}

function detectStore(link) {
  try {
    const u = new URL(link);
    const h = u.hostname.toLowerCase();

    // ML
    if (h.includes("mercadolivre") || h.includes("ml.com")) return "ml";

    // Amazon (inclui amzn.to)
    if (h.includes("amazon") || h.includes("amzn.to")) return "amazon";

    // Ali
    if (h.includes("aliexpress") || h.includes("ali")) return "ali";
  } catch {}
  return "unknown";
}

async function resolveFinalUrl(originalUrl) {
  try {
    const r = await fetch(originalUrl, {
      redirect: "follow",
      headers: { "User-Agent": ua() },
    });
    return r.url || originalUrl;
  } catch {
    return originalUrl;
  }
}

async function fetchText(url) {
  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": ua(),
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  const text = await r.text();

  if (r.status >= 400) {
    // devolve status real pra você entender o que rolou
    throw new Error(`Falha ao buscar HTML: HTTP ${r.status}`);
  }

  return text;
}

function ua() {
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
}

function pickMeta(html, property) {
  // <meta property="og:title" content="...">
  const re = new RegExp(
    `<meta[^>]+property=["']${escapeReg(property)}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]).trim() : null;
}

function pickMetaByName(html, name) {
  // <meta name="twitter:image" content="...">
  const re = new RegExp(
    `<meta[^>]+name=["']${escapeReg(name)}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]).trim() : null;
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtml(m[1]).trim() : null;
}

function pickPrice(html) {
  // metas comuns
  const metaPrice =
    pickMeta(html, "product:price:amount") ||
    pickMeta(html, "og:price:amount") ||
    pickMetaByName(html, "twitter:data1");

  if (metaPrice) {
    const n = Number(String(metaPrice).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : metaPrice;
  }

  // fallback BRL (R$ 123,45)
  const m = html.match(/R\$\s*([\d\.]+,\d{2})/);
  if (m) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : m[1];
  }

  return null;
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

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

