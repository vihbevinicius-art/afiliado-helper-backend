export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Faltou a URL" });
  }

  try {
    const store = detectStore(url);

    if (store === "ml") {
      const id = await getMlId(url);
if (!id) {
  return res.status(400).json({ error: "Não achei o ID do Mercado Livre (nem na URL, nem na página)" });
}

const r = await fetch(`https://api.mercadolibre.com/items/${id}`);

      }

      const r = await fetch(`https://api.mercadolibre.com/items/${id}`);
      const item = await r.json();

      return res.json({
        store: "mercado_livre",
        title: item.title,
        image: item.pictures?.[0]?.url || item.thumbnail,
        price: item.price,
        currency: item.currency_id,
        coupon: null
      });
    }

    if (store === "amazon") {
      return res.json({
        store: "amazon",
        error: "Amazon ainda não ligado"
      });
    }

    if (store === "ali") {
      return res.json({
        store: "aliexpress",
        error: "AliExpress ainda não ligado"
      });
    }

    return res.status(400).json({ error: "Loja não reconhecida" });

  } catch (e) {
    return res.status(500).json({ error: "Erro ao buscar produto" });
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
  // tenta achar MLB123456789 em qualquer texto
  const m = text.match(/MLB-?\d{6,}/i);
  return m ? m[0].replace("-", "").toUpperCase() : null;
}

async function getMlId(productUrl) {
  // 1) tenta na própria URL
  const fromUrl = extractMlIdFromText(productUrl);
  if (fromUrl) return fromUrl;

  // 2) tenta dentro do HTML da página do produto
  try {
    const r = await fetch(productUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await r.text();

    // procura um MLB dentro da página
    const fromHtml = extractMlIdFromText(html);
    if (fromHtml) return fromHtml;
  } catch (e) {}

  return null;
}

