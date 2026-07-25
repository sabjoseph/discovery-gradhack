const Tesseract = require("tesseract.js");

/**
 * Free, key-less OCR fallback. Runs Tesseract (WASM) inside Node.
 * Returns raw text only; structure is extracted by the receipt parser.
 */
module.exports = {
  id: "tesseract",
  async extract(buffer) {
    const { data } = await Tesseract.recognize(buffer, "eng");
    return { rawText: data?.text || "", structured: null };
  },
};
