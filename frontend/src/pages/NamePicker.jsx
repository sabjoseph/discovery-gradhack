import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCustomer } from "../context/CustomerContext";
import "./NamePicker.css";

const DEBOUNCE_MS = 300;

export default function NamePicker() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { customer, setCustomer } = useCustomer();
  const navigate = useNavigate();

  useEffect(() => {
    if (customer?.id) navigate("/app", { replace: true });
  }, [customer, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;

    async function searchCustomers() {
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      let request = supabase
        .from("customers")
        .select("id, name, created_at")
        .order("name", { ascending: true })
        .limit(80);

      if (debouncedQuery) {
        request = request.ilike("name", `%${debouncedQuery}%`);
      }

      const { data, error: queryError } = await request;

      if (!alive) return;

      if (queryError) {
        setError(queryError.message || "Could not load customers.");
        setCustomers([]);
      } else {
        setCustomers(data || []);
        setSelected((prev) =>
          prev && (data || []).some((c) => c.id === prev.id) ? prev : null
        );
      }

      setLoading(false);
    }

    searchCustomers();
    return () => {
      alive = false;
    };
  }, [debouncedQuery]);

  async function activateCustomer(person) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return false;
    }

    const token = crypto.randomUUID();
    const { error: sessionError } = await supabase
      .from("customer_sessions")
      .insert({
        token,
        customer_id: String(person.id),
      });

    if (sessionError) {
      setError(sessionError.message || "Could not start your session.");
      return false;
    }

    setCustomer({ id: person.id, name: person.name, token });
    return true;
  }

  async function continueToDashboard() {
    if (!selected) {
      setError("Select your name to continue.");
      return;
    }
    const ok = await activateCustomer(selected);
    if (ok) navigate("/app");
  }

  return (
    <div className="np-page">
      <div className="np-main">
        <section className="np-brand">
          {/*<h1 className="np-title">BiteBetter</h1>         <p className="np-lead">
            Welcome back to your journey of fresh vitality. Find your name to
            track your progress, manage your pantry, and discover your next
            favorite healthy meal.
          </p> */}

          {/*<ul className="np-features">
            <li>
              <span className="np-feature-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M12 8v4l2.5 1.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              Smart Nutrition Tracking
            </li>
            <li>
              <span className="np-feature-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="4"
                    y="7"
                    width="16"
                    height="12"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M8 7V6a4 4 0 0 1 8 0v1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              Intelligent Pantry Management
            </li>
          </ul>*/}
        </section> 

        <section className="np-card">
          <header className="np-card-header">
            <div className="np-card-brand">
              <div className="np-logo-badge">
                <img src="/BiteBetter Logo.png" alt="BiteBetter" />
              </div>
              <div>
                <h2>Welcome Back to BiteBetter</h2>
                <p>Search your name to access your dashboard</p>
              </div>
            </div>
          </header>

          <label className="np-field">
            <span className="np-label">Your name</span>
            <div className="np-input">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M20 20l-3.2-3.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing your name…"
                autoFocus
                autoComplete="off"
              />
            </div>
          </label>

          <div className="np-results" role="listbox" aria-label="Matching customers">
            {loading && <div className="np-status">Searching…</div>}
            {!loading && error && <div className="np-status np-status-error">{error}</div>}
            {!loading && !error && customers.length === 0 && (
              <div className="np-status">No matching names.</div>
            )}
            {!loading &&
              !error &&
              customers.map((person) => {
                const active = selected?.id === person.id;
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`np-result ${active ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelected(person);
                      setError("");
                    }}
                    onDoubleClick={async () => {
                      const ok = await activateCustomer(person);
                      if (ok) navigate("/app");
                    }}
                  >
                    <span className="np-result-avatar">
                      {person.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")}
                    </span>
                    <span className="np-result-meta">
                      <strong>{person.name}</strong>
                    </span>
                    {active && (
                      <span className="np-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <button
            type="button"
            className="np-cta"
            onClick={continueToDashboard}
            disabled={!selected}
          >
            Continue
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>

      <img
        className="np-mascot"
        src="/leaf-mascot.png"
        alt="BiteBetter mascot"
      />

      <footer className="np-footer">
        <div className="np-footer-left">
          <strong>
            Bite<span>Better</span>
          </strong>
          <span>© {new Date().getFullYear()} Bite better, be better.</span>
        </div>
        <div className="np-footer-links">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Contact Us</span>
        </div>
      </footer>
    </div>
  );
}
