/**
 * Heuristic parser that turns raw OCR text from a South African till slip
 * into a structured purchase draft. The output is only a starting point —
 * the user reviews and edits everything before saving.
 */

const SUPPORTED_STORES = [
  { id: "Checkers", patterns: [/checkers/i, /sixty\s*60/i] },
  { id: "Woolworths", patterns: [/woolworths/i, /woolies/i, /wrewards/i] },
];

const UNSUPPORTED_STORES = [
  { name: "Pick n Pay", patterns: [/pick\s*n\s*pay/i, /\bpnp\b/i] },
  { name: "Spar", patterns: [/\bspar\b/i] },
  { name: "Food Lover's Market", patterns: [/food\s*lover/i] },
  { name: "Makro", patterns: [/makro/i] },
  { name: "Boxer", patterns: [/\bboxer\b/i] },
  { name: "OK Foods", patterns: [/\bok\s+foods?\b/i] },
  { name: "Shoprite", patterns: [/shoprite(?!\s*checkers)/i] },
  { name: "Clicks", patterns: [/\bclicks\b/i] },
  { name: "Dis-Chem", patterns: [/dis-?chem/i] },
];

// Lines containing these words are never treated as product lines.
const NOISE_WORDS = [
  "total", "subtotal", "sub total", "vat", "tax invoice", "change", "cash",
  "card", "credit", "debit", "tender", "balance", "due", "rounding", "savings",
  "saved", "discount", "loyalty", "xtra", "wrewards", "points", "till",
  "cashier", "operator", "receipt", "invoice", "reg no", "vat no", "tel",
  "phone", "www", ".co.za", "thank", "customer", "items", "auth", "approval",
  "ref", "terminal", "merchant", "swiped", "account", "sixty60", "delivery",
];

const MONEY_RE = /(\d{1,3}(?:[ ,]\d{3})*|\d+)[.,](\d{2})\b/;

function toAmount(match) {
  if (!match) return null;
  const whole = match[1].replace(/[ ,]/g, "");
  return Number(`${whole}.${match[2]}`);
}

function detectStore(text) {
  for (const store of SUPPORTED_STORES) {
    if (store.patterns.some((re) => re.test(text))) {
      return { store: store.id, unsupportedStore: null };
    }
  }
  for (const store of UNSUPPORTED_STORES) {
    if (store.patterns.some((re) => re.test(text))) {
      return { store: null, unsupportedStore: store.name };
    }
  }
  return { store: null, unsupportedStore: null };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Returns a date-only string (YYYY-MM-DD). Times on receipts are ignored. */
function detectDate(text) {
  // yyyy-mm-dd or yyyy/mm/dd
  let m = text.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // dd-mm-yyyy or dd/mm/yyyy (SA convention: day first)
  m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;

  // dd/mm/yy
  m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b/);
  if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;

  return null;
}

function isNoiseLine(line) {
  const lower = line.toLowerCase();
  return NOISE_WORDS.some((w) => lower.includes(w));
}

function detectTotal(lines) {
  let best = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.includes("total")) continue;
    if (/(sub|savings|saved|items|qty|vat)/.test(lower)) continue;
    const amount = toAmount(line.match(MONEY_RE));
    if (amount != null && (best == null || amount > best)) best = amount;
  }
  return best;
}

function cleanName(raw) {
  return raw
    .replace(/[*#@>~_|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-.,:]+|[\s\-.,:]+$/g, "")
    .trim();
}

function parseItems(lines) {
  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || isNoiseLine(line)) continue;

    // Price must sit at the end of the line: "NAME ..... 34.99"
    const tail = line.match(new RegExp(`${MONEY_RE.source}\\s*[A-Z*#]?$`));
    if (!tail) continue;

    const lineTotal = toAmount(tail);
    if (lineTotal == null || lineTotal <= 0 || lineTotal > 20000) continue;

    let name = cleanName(line.slice(0, tail.index));
    let quantity = 1;
    let unitPrice = lineTotal;

    // "2 x 17.99" style quantity, either embedded or on the previous line
    const qtyInline = name.match(/(\d{1,2})\s*[x@]\s*(\d+[.,]\d{2})/i);
    if (qtyInline) {
      quantity = Number(qtyInline[1]);
      unitPrice = Number(qtyInline[2].replace(",", "."));
      name = cleanName(name.replace(qtyInline[0], ""));
    } else {
      const leadQty = name.match(/^(\d{1,2})\s*[xX]\s+/);
      if (leadQty) {
        quantity = Number(leadQty[1]);
        name = cleanName(name.replace(leadQty[0], ""));
        unitPrice = quantity > 0 ? Number((lineTotal / quantity).toFixed(2)) : lineTotal;
      }
    }

    // Some slips print the product name on its own line, price on the next.
    if (!name && items.length === 0 && i > 0) {
      const prev = lines[i - 1].trim();
      if (prev && !isNoiseLine(prev) && !MONEY_RE.test(prev)) name = cleanName(prev);
    }

    // Reject fragments that are clearly not product names.
    if (!name || name.length < 3 || /^\d+$/.test(name)) continue;

    items.push({
      name,
      quantity,
      unitPrice,
      lineTotal,
    });
  }

  return items;
}

/**
 * @param {string} rawText raw OCR output
 * @returns {{store: string|null, unsupportedStore: string|null, purchaseDate: string|null, basketTotal: number|null, items: Array}}
 */
function parseReceiptText(rawText) {
  const text = rawText || "";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const { store, unsupportedStore } = detectStore(text);
  const items = parseItems(lines);
  const detectedTotal = detectTotal(lines);
  const itemsTotal = items.reduce((sum, it) => sum + it.lineTotal, 0);

  return {
    store,
    unsupportedStore,
    purchaseDate: detectDate(text),
    basketTotal: detectedTotal ?? (items.length ? Number(itemsTotal.toFixed(2)) : null),
    items,
  };
}

module.exports = { parseReceiptText, detectStore };
