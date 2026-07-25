import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import LoadingBlock from "../components/LoadingBlock";
import "./Pantry.css";

const DISPLAY_GROUPS = [
  {
    id: "fresh",
    label: "Fresh & dairy",
    order: 0,
    match: /dairy|fruit|vegetable|meat|fish|poultry|protein|fresh|produce/i,
  },
  {
    id: "staples",
    label: "Pantry staples",
    order: 1,
    match: /grain|pasta|rice|bakery|bread|cereal|can|staple|pantry|frozen/i,
  },
  {
    id: "treats",
    label: "Treats & snacks",
    order: 2,
    match: /unhealthy|snack|treat|sweet|beverage|drink|soft|confection/i,
  },
  {
    id: "extras",
    label: "Oils & extras",
    order: 3,
    match: /oil|condiment|spice|herb|sauce|seasoning|extra|vinegar/i,
  },
];

function getDisplayGroup(mainCategory) {
  const category = mainCategory || "Other";
  for (const group of DISPLAY_GROUPS) {
    if (group.match.test(category)) return group;
  }
  return DISPLAY_GROUPS.find((group) => group.id === "staples");
}

function formatShortDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function categoryIsRedundant(name, category) {
  const itemName = (name || "").toLowerCase();
  const label = (category || "").trim();
  if (!label) return true;

  const lower = label.toLowerCase();
  if (itemName.includes(lower)) return true;

  const parts = lower
    .split(/[,·/&]+|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 3);

  return parts.some((part) => itemName.includes(part));
}

function pantryMetaLine(item) {
  const added = formatShortDate(item.addedDate);
  const label = item.category || item.mainCategory;
  const showCategory = label && !categoryIsRedundant(item.name, label);

  if (showCategory && added) return `${label} · added ${added}`;
  if (showCategory) return label;
  if (added) return `Added ${added}`;
  return null;
}

function expiryWhenLabel(item) {
  if (item.expired) {
    const date = formatShortDate(item.expiryEstimate);
    return date ? `Expired ${date}` : "Expired";
  }
  if (item.daysLeft === 0) return "Use by today";
  if (item.daysLeft === 1) return "Use by tomorrow";
  if (item.daysLeft != null && item.daysLeft <= 3) {
    return `Expires in ${item.daysLeft} days`;
  }
  const date = formatShortDate(item.expiryEstimate);
  if (date) return `Expires ${date}`;
  return "No expiry set";
}

function quietDaysLabel(daysLeft) {
  if (daysLeft == null) return "No expiry";
  return `~${daysLeft} days left`;
}

function compactExpiryLabel(item) {
  if (!item) return "No expiry";
  if (item.daysLeft != null && item.daysLeft > 3) {
    return quietDaysLabel(item.daysLeft);
  }
  return expiryWhenLabel(item);
}

function dedupeByName(items) {
  const map = new Map();

  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: item.name,
        items: [],
        totalQty: 0,
        minDaysLeft: null,
      });
    }

    const row = map.get(key);
    row.items.push(item);
    row.totalQty += item.quantity;
    if (item.daysLeft != null) {
      row.minDaysLeft =
        row.minDaysLeft == null
          ? item.daysLeft
          : Math.min(row.minDaysLeft, item.daysLeft);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function Pantry() {
  const { customer } = useCustomer();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getPantry(customer.id)
      .then((res) => setItems(res.data?.items || []))
      .catch((err) => setError(err.message || "Failed to load pantry"))
      .finally(() => setLoading(false));
  }, [customer.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detailRow) return;

    const stillExists = detailRow.items.some((entry) =>
      items.some((row) => row.id === entry.id)
    );

    if (!stillExists) setDetailRow(null);
  }, [items, detailRow]);

  async function setQuantity(item, nextQty) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const quantity = Math.max(0, Number(nextQty));
    const previous = items;
    setBusyId(item.id);
    setError("");

    setItems((current) => {
      if (quantity <= 0) return current.filter((row) => row.id !== item.id);
      return current.map((row) =>
        row.id === item.id ? { ...row, quantity } : row
      );
    });

    const { error: updateError } = await supabase
      .from("pantry_items")
      .update({ quantity_remaining: quantity })
      .eq("id", item.id)
      .eq("customer_id", customer.id);

    if (updateError) {
      setItems(previous);
      setError(updateError.message || "Could not update pantry item");
    }

    setBusyId(null);
  }

  const needsAttention = useMemo(
    () =>
      items
        .filter((item) => item.expiringSoon || item.expired)
        .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
    [items]
  );

  const compactGroups = useMemo(() => {
    const remaining = items.filter(
      (item) => !item.expiringSoon && !item.expired
    );
    const map = new Map();

    for (const item of remaining) {
      const group = getDisplayGroup(item.mainCategory);
      if (!map.has(group.id)) {
        map.set(group.id, {
          id: group.id,
          label: group.label,
          order: group.order,
          items: [],
        });
      }
      map.get(group.id).items.push(item);
    }

    return [...map.values()]
      .map((group) => ({
        ...group,
        rows: dedupeByName(group.items),
        count: group.items.length,
      }))
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => a.order - b.order);
  }, [items]);

  function toggleGroup(groupId) {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function removeCompactRow(row) {
    const target = [...row.items].sort(
      (a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)
    )[0];
    if (target) setQuantity(target, 0);
  }

  if (loading && items.length === 0) {
    return <LoadingBlock label="Opening the smart fridge…" />;
  }

  return (
    <div className="fr">
      <div className="fr-hero" aria-hidden="true" />

      <div className="fr-shell">
        <header className="fr-status glass">
          <div className="fr-status-left">
            <span className="fr-pulse" aria-hidden="true" />
            <div>
              <p className="fr-status-label">Fridge system active</p>
              <h1>Pantry</h1>
              <p className="fr-status-meta">
                Main compartment · {items.length} items on hand ·{" "}
                {needsAttention.length} need attention
              </p>
            </div>
          </div>
          <div className="fr-actions">
            <button type="button" className="fr-btn-ghost" onClick={load}>
              Sync
            </button>
            <Link to="/app/recipes" className="fr-btn-primary">
              Cook from pantry
            </Link>
          </div>
        </header>

        {error && <div className="error-state glass fr-error">{error}</div>}

        {items.length === 0 ? (
          <div className="glass fr-empty">Your fridge looks empty.</div>
        ) : (
          <>
            <section className="fr-section fr-section-attention">
              <div className="fr-section-head">
                <div>
                  <span className="fr-alert-icon" aria-hidden="true">
                    !
                  </span>
                  <h2>Needs attention</h2>
                </div>
                <span className="fr-expiring-badge">
                  {needsAttention.length} item
                  {needsAttention.length === 1 ? "" : "s"}
                </span>
              </div>

              {needsAttention.length === 0 ? (
                <div className="glass fr-empty-soft">
                  Nothing expiring in the next 3 days.
                </div>
              ) : (
                <div className="fr-priority-grid">
                  {needsAttention.map((item) => (
                    <PantryCard
                      key={item.id}
                      item={item}
                      priority
                      busy={busyId === item.id}
                      onAdjust={(qty) => setQuantity(item, qty)}
                    />
                  ))}
                </div>
              )}
            </section>

            {compactGroups.map((group) => {
              const expanded = expandedGroups[group.id] ?? false;

              return (
                <section key={group.id} className="fr-section">
                  <button
                    type="button"
                    className="fr-group-toggle"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className="fr-group-toggle-left">
                      <span
                        className={`fr-chevron ${expanded ? "is-open" : ""}`}
                        aria-hidden="true"
                      />
                      <h2>{group.label}</h2>
                    </span>
                    <span className="fr-count-pill">
                      {group.count} item{group.count === 1 ? "" : "s"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="glass fr-compact-list">
                      {group.rows.map((row) => (
                        <CompactRow
                          key={row.key}
                          row={row}
                          busy={row.items.some((item) => busyId === item.id)}
                          onOpen={() => setDetailRow(row)}
                          onRemove={() => removeCompactRow(row)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}

        <footer className="fr-footer">
          <strong>
            Bite<span>Better</span>
          </strong>
          <span>What’s in your kitchen · based on your last 30 days of shopping</span>
          <div>
            <Link to="/app/recipes">Support recipes</Link>
            <Link to="/app/profile">Fridge settings</Link>
          </div>
        </footer>
      </div>

      {detailRow && (
        <ItemDetailPanel
          row={detailRow}
          items={items}
          busyId={busyId}
          onClose={() => setDetailRow(null)}
          onAdjust={setQuantity}
        />
      )}
    </div>
  );
}

function CompactRow({ row, busy, onOpen, onRemove }) {
  const entryCount = row.items.length;
  const soonest = [...row.items].sort(
    (a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)
  )[0];

  return (
    <div className="fr-compact-row">
      <button
        type="button"
        className="fr-compact-row-main"
        onClick={onOpen}
        disabled={busy}
      >
        <span className="fr-compact-name">
          {row.name}
          {entryCount > 1 && (
            <span className="fr-compact-entries">{entryCount} entries</span>
          )}
        </span>
        <span className="fr-compact-meta">
          <span className="fr-compact-qty">Qty {row.totalQty}</span>
          <span className="fr-compact-days">
            {compactExpiryLabel(soonest)}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="fr-compact-remove"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${row.name}`}
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}

function ItemDetailPanel({ row, items, busyId, onClose, onAdjust }) {
  const liveItems = row.items
    .map((entry) => items.find((rowItem) => rowItem.id === entry.id))
    .filter(Boolean)
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  const totalQty = liveItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fr-detail-overlay" role="presentation" onClick={onClose}>
      <div
        className="glass fr-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fr-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="fr-detail-head">
          <div>
            <p className="fr-detail-label">Pantry item</p>
            <h2 id="fr-detail-title">{row.name}</h2>
            <p className="fr-detail-summary">
              {totalQty} on hand
              {liveItems.length > 1
                ? ` · ${liveItems.length} separate entries`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="fr-detail-close"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </header>

        <div className="fr-detail-items">
          {liveItems.map((item) => {
            const meta = pantryMetaLine(item);

            return (
            <article key={item.id} className="fr-detail-item">
              <div className="fr-detail-item-top">
                <span className="fr-expiry-when">{expiryWhenLabel(item)}</span>
              </div>
              {meta && <p className="fr-meta fr-meta-inline">{meta}</p>}

              <div className="fr-card-actions fr-card-actions-tight">
                <div className="fr-stepper">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => onAdjust(item, item.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => onAdjust(item, item.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="fr-card-links">
                  <Link to="/app/recipes" className="fr-link">
                    Recipes
                  </Link>
                  <button
                    type="button"
                    className="fr-remove"
                    disabled={busyId === item.id}
                    onClick={() => onAdjust(item, 0)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PantryCard({ item, priority = false, busy, onAdjust }) {
  const meta = pantryMetaLine(item);

  return (
    <article className={`glass fr-card ${priority ? "is-priority is-compact" : ""}`}>
      {priority && (
        <div className="fr-card-top">
          <span
            className={`fr-urgent ${item.expired ? "is-past" : "is-soon"}`}
          >
            {item.expired ? "Past expiry" : "Expiring soon"}
          </span>
        </div>
      )}

      <h3>{item.name}</h3>
      <p className="fr-expiry-when">{expiryWhenLabel(item)}</p>
      {meta && <p className="fr-meta fr-meta-inline">{meta}</p>}

      <div className="fr-card-actions fr-card-actions-tight">
        <div className="fr-stepper">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(item.quantity - 1)}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span>{item.quantity}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdjust(item.quantity + 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <div className="fr-card-links">
          {priority && (
            <Link to="/app/recipes" className="fr-link">
              Recipes
            </Link>
          )}
          <button
            type="button"
            className="fr-remove"
            disabled={busy}
            onClick={() => onAdjust(0)}
            aria-label={`Remove ${item.name}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
