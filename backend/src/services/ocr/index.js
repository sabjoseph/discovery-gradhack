/**
 * OCR service entry point. UI and routes never talk to a provider directly —
 * they call extractReceipt() and get back a normalised draft.
 *
 * Provider selection (env `OCR_PROVIDER` wins, otherwise auto):
 *   - "openai"    → OpenAI Vision (needs OPENAI_API_KEY)
 *   - "tesseract" → local Tesseract WASM (no keys required)
 *
 * Adding Google Vision / Azure Document Intelligence later only requires a
 * new file in ./providers exposing { id, extract(buffer, mimeType) }.
 */

const tesseractProvider = require("./providers/tesseractProvider");
const openaiVisionProvider = require("./providers/openaiVisionProvider");
const { parseReceiptText, detectStore } = require("./receiptParser");

function getProvider() {
  const forced = (process.env.OCR_PROVIDER || "").toLowerCase();
  if (forced === "tesseract") return tesseractProvider;
  if (forced === "openai") return openaiVisionProvider;
  return process.env.OPENAI_API_KEY ? openaiVisionProvider : tesseractProvider;
}

/**
 * Runs OCR on a receipt image and returns a purchase draft.
 * @param {Buffer} buffer image bytes
 * @param {string} mimeType e.g. "image/jpeg"
 * @returns {Promise<{provider: string, rawText: string, draft: object}>}
 */
async function extractReceipt(buffer, mimeType) {
  const provider = getProvider();
  const { rawText, structured } = await provider.extract(buffer, mimeType);

  let draft;
  if (structured) {
    // Structured providers may return any store name; classify it here.
    const detection = detectStore(`${structured.store || ""}\n${rawText}`);
    draft = {
      ...structured,
      store: detection.store,
      unsupportedStore:
        detection.store == null && structured.store
          ? detection.unsupportedStore || structured.store
          : detection.unsupportedStore,
    };
  } else {
    draft = parseReceiptText(rawText);
  }

  return { provider: provider.id, rawText, draft };
}

module.exports = { extractReceipt };
