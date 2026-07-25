import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCustomer } from "../context/CustomerContext";
import "./NamePicker.css";

export default function NamePicker() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { setCustomer, customer } = useCustomer();
  const navigate = useNavigate();

  useEffect(() => {
    if (customer?.id) navigate("/app", { replace: true });
  }, [customer, navigate]);

  useEffect(() => {
    let alive = true;
    api
      .getCustomers()
      .then((res) => {
        if (!alive) return;
        setCustomers(res.data || []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || "Could not load customers.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, query]);

  function selectCustomer(person) {
    setCustomer({ id: person.id, name: person.name });
    navigate("/app");
  }

  return (
    <div className="picker-page">
      <div className="picker-atmosphere" aria-hidden="true" />
      <div className="picker-shell">
        <header className="picker-hero">
          <img
            src="/BiteBetter Logo.png"
            alt="BiteBetter"
            className="picker-logo"
          />
          <h1>
            Bite<span>Better</span>
          </h1>
          <p className="picker-tagline">Smart choices. Better you.</p>
          <p className="picker-lead">
            Find your name to open your HealthyFood companion — purchases,
            pantry, and recipes ready from your real shopping history.
          </p>
        </header>

        <section className="picker-panel">
          <label className="search-field picker-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your name"
              autoFocus
            />
          </label>

          {loading && <div className="loading-state">Loading customers…</div>}
          {error && <div className="error-state">{error}</div>}

          {!loading && !error && (
            <div className="picker-list">
              {filtered.length === 0 ? (
                <div className="empty-state">No matching names.</div>
              ) : (
                filtered.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="picker-item"
                    onClick={() => selectCustomer(person)}
                  >
                    <span className="picker-avatar">
                      {person.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className="picker-meta">
                      <strong>{person.name}</strong>
                      <small>{person.id}</small>
                    </span>
                    <span className="picker-chevron" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
