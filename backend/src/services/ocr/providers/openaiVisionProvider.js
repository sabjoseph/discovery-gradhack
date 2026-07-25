/**
 * OCR provider backed by OpenAI vision models. Used automatically when
 * OPENAI_API_KEY is set. Returns both raw text and a structured draft,
 * which skips most of the heuristic parsing.
 */

const PROMPT = `You are a receipt OCR engine. Extract data from this South African grocery till slip.
Respond with ONLY a JSON object in this exact shape:
{
  "store": "Checkers" | "Woolworths" | "<other store name>" | null,
  "purchaseDate": "YYYY-MM-DD" | null,
  "basketTotal": number | null,
  "items": [{ "name": string, "quantity": number, "unitPrice": number, "lineTotal": number }],
  "rawText": "full text you can read on the receipt"
}
Rules:
- purchaseDate is the date only; ignore any time printed on the slip.
- Exclude totals, VAT, savings, card/cash tender lines from items.
- If quantity is not printed, use 1 and set unitPrice = lineTotal.
- Product names should be human readable (title case, no till codes).`;

module.exports = {
  id: "openai-vision",
  async extract(buffer, mimeType) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI OCR failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      rawText: parsed.rawText || "",
      structured: {
        store: parsed.store || null,
        purchaseDate: parsed.purchaseDate || null,
        basketTotal: parsed.basketTotal != null ? Number(parsed.basketTotal) : null,
        items: Array.isArray(parsed.items)
          ? parsed.items
              .filter((it) => it && it.name)
              .map((it) => ({
                name: String(it.name),
                quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
                unitPrice: Number(it.unitPrice) || Number(it.lineTotal) || 0,
                lineTotal: Number(it.lineTotal) || Number(it.unitPrice) || 0,
              }))
          : [],
      },
    };
  },
};
