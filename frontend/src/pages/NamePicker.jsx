import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { useCustomer } from "../context/CustomerContext";
import "./NamePicker.css";

const DEBOUNCE_MS = 300;

function hasValidName(name) {
  return typeof name === "string" && /\p{L}/u.test(name);
}

export default function NamePicker() {
  const [mode, setMode] = useState("search"); // search | signup
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const { customer, setCustomer } = useCustomer();
  const navigate = useNavigate();

  useEffect(() => {
    // Only bounce already-signed-in users away on first load.
    if (customer?.id) navigate("/app", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (mode !== "search") return undefined;
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
        const validCustomers = (data || []).filter((person) =>
          hasValidName(person.name)
        );
        setCustomers(validCustomers);
        setSelected((prev) =>
          prev && validCustomers.some((c) => c.id === prev.id) ? prev : null
        );
      }

      setLoading(false);
    }

    searchCustomers();
    return () => {
      alive = false;
    };
  }, [debouncedQuery, mode]);

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

  function openSignup() {
    setMode("signup");
    setError("");
    setSelected(null);
  }

  function backToSearch() {
    setMode("search");
    setError("");
    setFirstName("");
    setSurname("");
  }

  async function createNewUser(e) {
    e.preventDefault();
    const first = firstName.trim();
    const last = surname.trim();
    if (!first || !last) {
      setError("Enter your first name and surname.");
      return;
    }
    if (!hasValidName(first) || !hasValidName(last)) {
      setError("Please enter a valid first name and surname.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const res = await api.createCustomer(first, last);
      const person = res.data;
      const ok = await activateCustomer(person);
      if (ok) navigate("/app/profile?setup=1");
    } catch (err) {
      const existing = err.response?.data?.data;
      if (err.response?.status === 409 && existing?.id) {
        setError(err.response.data.message || "Name already exists.");
        setMode("search");
        setQuery(existing.name);
        setSelected(existing);
      } else {
        setError(
          err.response?.data?.message || err.message || "Could not create user"
        );
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="np-page">
      <div className="np-main">
        <section className="np-brand" />

        <section className="np-card">
          <header className="np-card-header">
            <div className="np-card-brand">
              <div className="np-logo-badge">
                <img src="/assets/bitebetter-icon.png" alt="BiteBetter" />
              </div>
              <div>
                <h2>
                  {mode === "signup"
                    ? "Create your BiteBetter profile"
                    : "Welcome Back to BiteBetter"}
                </h2>
                <p>
                  {mode === "signup"
                    ? "Add your name, then finish your details on Profile"
                    : "Search your name to access your dashboard"}
                </p>
              </div>
            </div>
          </header>

          {mode === "search" ? (
            <>
              <label className="np-field">
                <span className="np-label">Your name</span>
                <div className="np-input">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="11"
                      cy="11"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
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

              <div
                className="np-results"
                role="listbox"
                aria-label="Matching customers"
              >
                {loading && <div className="np-status">Searching…</div>}
                {!loading && error && (
                  <div className="np-status np-status-error">{error}</div>
                )}
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

              <p className="np-new-user">
                <button type="button" className="np-link" onClick={openSignup}>
                  New user?
                </button>
              </p>
            </>
          ) : (
            <form className="np-signup" onSubmit={createNewUser}>
              {error && (
                <div className="np-status np-status-error">{error}</div>
              )}

              <label className="np-field">
                <span className="np-label">First name</span>
                <div className="np-input np-input-plain">
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Alex"
                    autoFocus
                    autoComplete="given-name"
                  />
                </div>
              </label>

              <label className="np-field">
                <span className="np-label">Surname</span>
                <div className="np-input np-input-plain">
                  <input
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="e.g. Molefe"
                    autoComplete="family-name"
                  />
                </div>
              </label>

              <button
                type="submit"
                className="np-cta"
                disabled={creating || !firstName.trim() || !surname.trim()}
              >
                {creating ? "Creating…" : "Create profile"}
                {!creating && <span aria-hidden="true">→</span>}
              </button>

              <p className="np-new-user">
                <button type="button" className="np-link" onClick={backToSearch}>
                  ← Back to search
                </button>
              </p>
            </form>
          )}
        </section>
      </div>

      <aside className="np-leafy" aria-label="Leafy welcome">
        <p className="np-leafy-bubble">
          Hi, I&apos;m Leafy! Find your name below and I&apos;ll show you
          what&apos;s in your kitchen 🍃
        </p>
        <img
          className="np-leafy-char"
          src="/assets/bitebetter-leaf.png"
          alt=""
        />
      </aside>

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
