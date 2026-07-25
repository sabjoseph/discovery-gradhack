const supabase = require("../config/supabase");

const BUCKET = "receipts";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
  });
  // "already exists" is fine; anything else surfaces on upload anyway.
  if (!error || /already exists/i.test(error.message || "")) bucketReady = true;
}

function extensionFor(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
  };
  return map[mimeType] || "jpg";
}

/**
 * Uploads the receipt image to Supabase Storage.
 * @returns {Promise<{path: string, url: string}>}
 */
async function uploadReceiptImage(customerId, buffer, mimeType) {
  await ensureBucket();
  const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(mimeType)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Receipt image upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/**
 * Persists the receipt record (image + OCR output) linked to a basket.
 * Prefers the dedicated `receipts` table (see backend/migrations/receipts.sql);
 * falls back to `activity_log` so the feature works before the migration runs.
 */
async function saveReceiptRecord({ customerId, basketId, imagePath, imageUrl, ocrText, ocrDraft, provider }) {
  const { error } = await supabase.from("receipts").insert({
    customer_id: customerId,
    basket_id: basketId,
    image_path: imagePath,
    image_url: imageUrl,
    ocr_text: ocrText || null,
    ocr_draft: ocrDraft || null,
    ocr_provider: provider || null,
  });

  if (!error) return { storedIn: "receipts" };

  await supabase.from("activity_log").insert({
    customer_id: customerId,
    event_type: "receipt_saved",
    metadata: {
      basket_id: basketId,
      image_path: imagePath,
      image_url: imageUrl,
      ocr_provider: provider || null,
    },
  });
  return { storedIn: "activity_log" };
}

/** Fetches receipt info for a basket, checking both storage strategies. */
async function getReceiptForBasket(customerId, basketId) {
  const { data, error } = await supabase
    .from("receipts")
    .select("image_url, image_path, ocr_provider, created_at")
    .eq("customer_id", customerId)
    .eq("basket_id", basketId)
    .maybeSingle();

  if (!error && data) {
    return {
      imageUrl: data.image_url,
      provider: data.ocr_provider,
      createdAt: data.created_at,
    };
  }

  const { data: rows } = await supabase
    .from("activity_log")
    .select("metadata, created_at")
    .eq("customer_id", customerId)
    .eq("event_type", "receipt_saved")
    .eq("metadata->>basket_id", basketId)
    .limit(1);

  const row = rows?.[0];
  if (!row?.metadata?.image_url) return null;
  return {
    imageUrl: row.metadata.image_url,
    provider: row.metadata.ocr_provider || null,
    createdAt: row.created_at,
  };
}

module.exports = { uploadReceiptImage, saveReceiptRecord, getReceiptForBasket };
