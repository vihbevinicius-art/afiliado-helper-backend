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
  const finalUrl = await resolveFinalUrl(url);

  let html;
  try {
    html = await fetchText(finalUrl);
  } catch (err) {
    // Amazon costuma bloquear com 403/503/robot check
    return res.status(200).json({
      store: "amazon",
      title: null,
      image: null,
      price: null,
      currency: "BRL",
      coupon: null,
      source: "html",
      error: `Amazon bloqueou a leitura (${err?.message || "erro"})`,
      hint: "Tenta colar o link do produto no formato /dp/ASIN (ou outro link/afiliado).",
    });
  }

  // title
  const title =
    pickMeta(html, "og:title") ||
    pickMetaName(html, "title") ||
    pickTitle(html) ||
    null;

  // image
  const image =
    pickMeta(html, "og:image") ||
    pickMetaName(html, "twitter:image") ||
    null;

  // price (tentativas)
  const price =
    pickAmazonPrice(html) ??
    pickPrice(html); // fallback genérico (R$ 123,45)

  return res.status(200).json({
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
  const finalUrl = await resolveFinalUrl(url);
  const html = await fetchText(finalUrl);

  // 1) tenta via OG/meta (muitas páginas do Ali têm)
  const title =
    pickMeta(html, "og:title") ||
    pickMeta(html, "twitter:title") ||
    pickTitle(html) ||
    null;

  const image =
    pickMeta(html, "og:image") ||
    pickMeta(html, "twitter:image") ||
    null;

  // 2) preço: tenta metas comuns, senão JSON-LD, senão fallback R$
  const metaPrice =
    pickMeta(html, "product:price:amount") ||
    pickMeta(html, "og:price:amount") ||
    pickMeta(html, "twitter:data1") ||
    null;

  let price = null;
  if (metaPrice) {
    const n = Number(String(metaPrice).replace(/\./g, "").replace(",", "."));
    price = Number.isFinite(n) ? n : metaPrice;
  } else {
    const ld = pickJsonLdProduct(html);
    if (ld?.price != null) price = ld.price;
  }

  // se vier imagem/price melhor do JSON-LD, usa
  const ld2 = pickJsonLdProduct(html);
  const finalImage = image || ld2?.image || null;

  return res.json({
    store: "aliexpress",
    title: title || ld2?.title || null,
    image: finalImage,
    price,
    currency: ld2?.currency || "BRL",
    coupon: null,
    source: "html",
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
    const h = new URL(link).hostname.toLowerCase();

    // Mercado Livre
    if (h.includes("mercadolivre") || h.includes("mercadolibre")) return "ml";

    // Amazon (inclui shortlink)
    if (h.includes("amazon.")) return "amazon";
    if (h === "amzn.to" || h.endsWith(".amzn.to")) return "amazon";

    // AliExpress
    if (h.includes("aliexpress")) return "ali";
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

function pickMetaName(html, name) {
  const re = new RegExp(
    `<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]).trim() : null;
}

function pickAmazonPrice(html) {
  const meta =
    pickMeta(html, "product:price:amount") ||
    pickMeta(html, "og:price:amount");

  if (meta) {
    const n = Number(String(meta).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  const m = html.match(/R\$\s*([\d\.]+,\d{2})/);
  if (m) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function pickJsonLdProduct(html) {
  try {
    const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of scripts) {
      const raw = s[1].trim();
      if (!raw) continue;

      const json = JSON.parse(raw);
      const nodes = Array.isArray(json) ? json : [json];

      for (const node of nodes) {
        const graph = node["@graph"] ? node["@graph"] : [node];

        for (const item of graph) {
          if (!item) continue;
          const type = String(item["@type"] || "").toLowerCase();
          if (!type.includes("product")) continue;

          const title = item.name || null;

          let image = null;
          if (typeof item.image === "string") image = item.image;
          if (Array.isArray(item.image)) image = item.image[0] || null;

          let price = null;
          const offers = item.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            price = offer?.price || offer?.lowPrice || offer?.highPrice || null;
            if (price != null) {
              const n = Number(String(price).replace(/\./g, "").replace(",", "."));
              price = Number.isFinite(n) ? n : price;
            }
          }

          return { title, image, price };
        }
      }
    }
  } catch (e) {}
  return null;
}


