import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatCurrency } from "../lib/api";
import "./AddPurchaseModal.css";

const STORES = ["Checkers", "Woolworths"];
const MAX_FILE_MB = 10;

let itemKeySeq = 0;
function makeItem(partial = {}) {
  itemKeySeq += 1;
  return {
    key: `item-${itemKeySeq}`,
    name: partial.name || "",
    quantity: partial.quantity ?? 1,
    lineTotal: partial.lineTotal ?? "",
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Accepts "4.50", "4,50", "R 4,50" — common SA till formats. */
function parseAmount(value) {
  if (value === "" || value == null) return NaN;
  const cleaned = String(value)
    .replace(/[Rr]\s*/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return Number(cleaned);
}

function isAmountTyping(value) {
  return value === "" || /^[\d.,]*$/.test(String(value));
}

export default function AddPurchaseModal({ customerId, onClose, onSaved }) {
  const [step, setStep] = useState("choose"); // choose | scanning | review
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [receiptMeta, setReceiptMeta] = useState(null); // { image, rawText, provider, ocrDraft }

  const [store, setStore] = useState("");
  const [date, setDate] = useState(todayISO());
  const [statedTotal, setStatedTotal] = useState("");
  const [items, setItems] = useState([]);

  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const itemsTotal = useMemo(
    () => items.reduce((sum, it) => sum + (parseAmount(it.lineTotal) || 0), 0),
    [items]
  );

  const totalMismatch =
    statedTotal !== "" &&
    items.length > 0 &&
    Math.abs(parseAmount(statedTotal) - itemsTotal) > 0.05;

  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is too large — keep it under ${MAX_FILE_MB}MB.`);
      return;
    }

    setError("");
    setPreview(URL.createObjectURL(file));
    setStep("scanning");

    try {
      const res = await api.parseReceipt(customerId, file);
      const draft = res.data;
      setStore(draft.store || "");
      setDate(draft.purchaseDate || todayISO());
      setStatedTotal(draft.basketTotal != null ? String(draft.basketTotal) : "");
      setItems(
        (draft.items || []).length
          ? draft.items.map((it) => makeItem(it))
          : [makeItem()]
      );
      setReceiptMeta({
        image: draft.receiptImage,
        rawText: draft.rawText,
        provider: draft.provider,
        ocrDraft: {
          store: draft.store,
          purchaseDate: draft.purchaseDate,
          basketTotal: draft.basketTotal,
          items: draft.items,
        },
      });
      setStep("review");
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "UNSUPPORTED_STORE") {
        setError(
          `${data.message}${data.detectedStore ? ` (this looks like a ${data.detectedStore} receipt)` : ""}`
        );
        setPreview(null);
        setStep("choose");
        return;
      }
      // OCR failed — the user can still capture everything by hand.
      setError(
        `${data?.message || "We couldn't read that receipt automatically."} You can fill it in manually below.`
      );
      setItems([makeItem()]);
      setReceiptMeta(null);
      setStep("review");
    }
  }

  function updateItem(key, field, value) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, [field]: value } : it))
    );
  }

  function removeItem(key) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  async function handleSave() {
    setError("");

    if (!STORES.includes(store)) {
      setError("Pick the store — only Checkers and Woolworths are supported.");
      return;
    }
    if (!date) {
      setError("Pick the purchase date.");
      return;
    }
    const validItems = items.filter((it) => it.name.trim());
    if (validItems.length === 0) {
      setError("Add at least one item.");
      return;
    }
    for (const it of validItems) {
      const qty = Number(it.quantity);
      const price = parseAmount(it.lineTotal);
      if (!(qty > 0) || !(price >= 0) || it.lineTotal === "") {
        setError(`Check the quantity and price for "${it.name.trim()}".`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.createPurchase(customerId, {
        store,
        purchaseDate: date,
        items: validItems.map((it) => {
          const quantity = Number(it.quantity);
          const lineTotal = parseAmount(it.lineTotal);
          return {
            name: it.name.trim(),
            quantity,
            unitPrice: Number((lineTotal / quantity).toFixed(2)),
            lineTotal,
          };
        }),
        receipt: receiptMeta
          ? {
              imagePath: receiptMeta.image?.path,
              imageUrl: receiptMeta.image?.url,
              ocrText: receiptMeta.rawText,
              ocrDraft: receiptMeta.ocrDraft,
              provider: receiptMeta.provider,
            }
          : undefined,
      });
      onSaved(res.data);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      if (status === 404) {
        setError(
          "Could not reach the purchase API (404). Make sure the backend is running locally — Vite should use http://localhost:5000."
        );
      } else {
        setError(msg || "Could not save the purchase.");
      }
      setSaving(false);
    }
  }

  return (
    <div className="apm-backdrop" onClick={onClose} role="presentation">
      <div
        className="apm"
        role="dialog"
        aria-modal="true"
        aria-label="Add purchase"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="apm-head">
          <div>
            <p className="apm-kicker">Add purchase</p>
            <h2>
              {step === "choose" && "Scan your receipt"}
              {step === "scanning" && "Reading your receipt…"}
              {step === "review" && "Review & confirm"}
            </h2>
          </div>
          <button type="button" className="apm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className="apm-error">{error}</div>}

        {step === "choose" && (
          <div className="apm-choose">
            <button type="button" className="apm-option" onClick={() => cameraRef.current?.click()}>
              <span className="apm-option-icon" aria-hidden>📷</span>
              <strong>Take photo</strong>
              <span>Use your camera to snap the till slip</span>
            </button>
            <button type="button" className="apm-option" onClick={() => fileRef.current?.click()}>
              <span className="apm-option-icon" aria-hidden>🧾</span>
              <strong>Upload receipt</strong>
              <span>JPG, PNG, HEIC or PDF — up to {MAX_FILE_MB}MB</span>
            </button>
            <p className="apm-hint">Only Checkers and Woolworths receipts are supported.</p>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*,application/pdf"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {step === "scanning" && (
          <div className="apm-scanning">
            {preview && (
              <div className="apm-scan-frame">
                <img src={preview} alt="Receipt being scanned" />
                <div className="apm-scan-line" aria-hidden />
              </div>
            )}
            <div className="apm-skeletons" aria-hidden>
              <div className="apm-skeleton" style={{ width: "62%" }} />
              <div className="apm-skeleton" style={{ width: "84%" }} />
              <div className="apm-skeleton" style={{ width: "71%" }} />
              <div className="apm-skeleton" style={{ width: "78%" }} />
            </div>
            <p className="apm-scan-note">Extracting store, date and line items…</p>
          </div>
        )}

        {step === "review" && (
          <div className="apm-review">
            <div className="apm-review-grid">
              <div className="apm-fields">
                <label className="apm-field">
                  <span>Store</span>
                  <select value={store} onChange={(e) => setStore(e.target.value)}>
                    <option value="" disabled>
                      Select store
                    </option>
                    {STORES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="apm-field">
                  <span>Date</span>
                  <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="apm-field">
                  <span>Receipt total (R)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={statedTotal}
                    onChange={(e) => {
                      if (isAmountTyping(e.target.value)) setStatedTotal(e.target.value);
                    }}
                  />
                </label>
              </div>

              {preview && (
                <a
                  className="apm-thumb"
                  href={receiptMeta?.image?.url || preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open receipt image"
                >
                  <img src={preview} alt="Receipt preview" />
                  <span>View</span>
                </a>
              )}
            </div>

            <div className="apm-items-head">
              <h3>Items</h3>
              <span>
                {items.length} row{items.length === 1 ? "" : "s"} · {formatCurrency(itemsTotal)}
              </span>
            </div>

            <div className="apm-items">
              <div className="apm-items-labels" aria-hidden>
                <span>Product</span>
                <span>Qty</span>
                <span>Price (R)</span>
                <span />
              </div>
              {items.map((it) => (
                <div key={it.key} className="apm-item-row">
                  <input
                    type="text"
                    placeholder="Product name"
                    value={it.name}
                    onChange={(e) => updateItem(it.key, "name", e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={it.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*$/.test(v)) updateItem(it.key, "quantity", v);
                    }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Line price"
                    value={it.lineTotal}
                    onChange={(e) => {
                      if (isAmountTyping(e.target.value)) {
                        updateItem(it.key, "lineTotal", e.target.value);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="apm-item-remove"
                    onClick={() => removeItem(it.key)}
                    aria-label={`Remove ${it.name || "item"}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="apm-add-row" onClick={() => setItems((p) => [...p, makeItem()])}>
              + Add item
            </button>

            {totalMismatch && (
              <p className="apm-mismatch">
                Line items add up to {formatCurrency(itemsTotal)}, but the receipt total says{" "}
                {formatCurrency(parseAmount(statedTotal))}. Double-check before saving.
              </p>
            )}

            <div className="apm-actions">
              <button type="button" className="apm-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="apm-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : `Save purchase · ${formatCurrency(itemsTotal)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
