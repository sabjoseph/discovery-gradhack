import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatDate } from "../lib/api";
import { supabase } from "../lib/supabase";
import LoadingBlock from "../components/LoadingBlock";
import "./Pantry.css";

function expiryLabel(item) {
  if (item.expired) return "Past expiry estimate";
  if (item.daysLeft === 0) return "Use by today";
  if (item.daysLeft === 1) return "Use by tomorrow";
  if (item.daysLeft != null && item.daysLeft <= 3) {
    return `Expires in ${item.daysLeft} days`;
  }
  if (item.daysLeft != null) return `~${item.daysLeft} days left`;
  return "No expiry set";
}

export default function Pantry() {
  const { customer } = useCustomer();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

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

  const expiring = useMemo(
    () =>
      items
        .filter((item) => item.expiringSoon || item.expired)
        .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
    [items]
  );

  const shelves = useMemo(() => {
    const remaining = items.filter((item) => !item.expiringSoon && !item.expired);
    const map = new Map();

    for (const item of remaining) {
      const key = item.mainCategory || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }

    return [...map.entries()]
      .map(([name, shelfItems]) => ({
        name,
        items: shelfItems.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const produceShelf = shelves.find((s) =>
    /fruit|vegetable/i.test(s.name)
  );
  const otherShelves = shelves.filter((s) => s !== produceShelf);

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
                {expiring.length} high priority
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
            <section className="fr-section">
              <div className="fr-section-head">
                <div>
                  <span className="fr-alert-icon" aria-hidden="true">
                    !
                  </span>
                  <h2>Top shelf · High priority</h2>
                </div>
                <span className="fr-expiring-badge">Expiring soon</span>
              </div>

              {expiring.length === 0 ? (
                <div className="glass fr-empty-soft">
                  Nothing expiring in the next 3 days.
                </div>
              ) : (
                <div className="fr-priority-grid">
                  {expiring.map((item) => (
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

            {otherShelves.map((shelf, index) => (
              <section key={shelf.name} className="fr-section">
                <div className="fr-section-head">
                  <h2>
                    Shelf {index + 2}: {shelf.name}
                  </h2>
                  <span className="fr-count-pill">
                    {shelf.items.length} items active
                  </span>
                </div>
                <div className="fr-shelf-grid">
                  {shelf.items.map((item) => (
                    <PantryCard
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onAdjust={(qty) => setQuantity(item, qty)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {produceShelf && (
              <section className="fr-section">
                <div className="fr-section-head">
                  <h2>Drawers · {produceShelf.name}</h2>
                  <span className="fr-count-pill">
                    {produceShelf.items.length} items active
                  </span>
                </div>
                <div className="fr-drawers">
                  <div className="glass fr-drawer fr-drawer-green">
                    <header>
                      <h3>Crisper drawer</h3>
                      <small>Optimal humidity: High</small>
                    </header>
                    <div className="fr-tags">
                      {produceShelf.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="fr-tag"
                          disabled={busyId === item.id}
                          onClick={() => setQuantity(item, item.quantity - 1)}
                          title="Use 1"
                        >
                          <strong>{item.name}</strong>
                          <span>({item.quantity})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <footer className="fr-footer">
          <strong>
            Bite<span>Better</span>
          </strong>
          <span>Kitchen intelligence hub · pantry from your last 30 days</span>
          <div>
            <Link to="/app/recipes">Support recipes</Link>
            <Link to="/app/profile">Fridge settings</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PantryCard({ item, priority = false, busy, onAdjust }) {
  return (
    <article className={`glass fr-card ${priority ? "is-priority" : ""}`}>
      <div className="fr-card-top">
        <span className="fr-qty-chip">Qty {item.quantity}</span>
        {priority && <span className="fr-urgent">Expiring soon</span>}
      </div>

      <h3>{item.name}</h3>
      <p className={`fr-expiry ${priority ? "is-urgent" : ""}`}>
        {expiryLabel(item)}
      </p>
      <p className="fr-meta">
        {item.category} · added {formatDate(item.addedDate)}
      </p>

      <div className="fr-card-actions">
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
