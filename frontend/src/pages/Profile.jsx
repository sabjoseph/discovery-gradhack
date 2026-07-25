import { useEffect, useMemo, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, initials } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Profile.css";

const DIET_SUGGESTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Low sugar",
  "High protein",
  "Peanuts",
  "Shellfish",
];

const GOAL_SUGGESTIONS = [
  "Eat healthier",
  "Weight Loss",
  "Plant Based",
  "Reduce sugar",
  "Cook more at home",
  "Stay on budget",
  "Increase fibre",
  "More vegetables",
];

const SETTINGS_TABS = [
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications" },
];

function calcBmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!w || !h || h <= 0) return null;
  const heightM = h / 100;
  return Math.round((w / (heightM * heightM)) * 10) / 10;
}

function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { key: "under", label: "Underweight" };
  if (bmi < 25) return { key: "normal", label: "Healthy" };
  if (bmi < 30) return { key: "over", label: "Overweight" };
  return { key: "obese", label: "Obese" };
}

// Map BMI onto a 15–40 visual scale for the marker position.
function bmiMarkerPct(bmi) {
  if (bmi == null) return null;
  const clamped = Math.min(40, Math.max(15, bmi));
  return ((clamped - 15) / 25) * 100;
}

function ChipField({
  label,
  values,
  suggestions,
  onToggle,
  onAdd,
  onRemove,
  placeholder,
  tone = "green",
}) {
  const [draft, setDraft] = useState("");

  function submitDraft(e) {
    e.preventDefault();
    const next = draft.trim();
    if (!next) return;
    onAdd(next);
    setDraft("");
  }

  return (
    <div className="pf-chip-field">
      <div className="pf-label">{label}</div>
      <div className="pf-chips">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`pf-chip is-on tone-${tone}`}
            onClick={() => onRemove(value)}
          >
            {value}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        {suggestions
          .filter((opt) => !values.includes(opt))
          .slice(0, 4)
          .map((opt) => (
            <button
              key={opt}
              type="button"
              className="pf-chip"
              onClick={() => onToggle(opt)}
            >
              + {opt}
            </button>
          ))}
      </div>
      <form className="pf-chip-add" onSubmit={submitDraft}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" className="btn btn-sm btn-outline">
          Add
        </button>
      </form>
    </div>
  );
}

export default function Profile() {
  const { customer } = useCustomer();
  const [tab, setTab] = useState("account");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [form, setForm] = useState({
    budget_monthly: "",
    age: "",
    weight_kg: "",
    height_cm: "",
    dietary_preferences: [],
    health_goals: [],
    milestone_alerts: true,
    recommendation_nudges: true,
  });

  useEffect(() => {
    let alive = true;
    api
      .getProfile(customer.id)
      .then((res) => {
        if (!alive) return;
        const profile = res.data.profile || {};
        const notifications = res.data.notifications || {};
        const next = {
          budget_monthly:
            profile.budget_monthly == null ? "" : String(profile.budget_monthly),
          age: profile.age == null ? "" : String(profile.age),
          weight_kg: profile.weight_kg == null ? "" : String(profile.weight_kg),
          height_cm: profile.height_cm == null ? "" : String(profile.height_cm),
          dietary_preferences: Array.isArray(profile.dietary_preferences)
            ? profile.dietary_preferences
            : [],
          health_goals: Array.isArray(profile.health_goals)
            ? profile.health_goals
            : [],
          milestone_alerts: notifications.milestone_alerts ?? true,
          recommendation_nudges: notifications.recommendation_nudges ?? true,
        };
        setForm(next);
        setBaseline(next);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load profile");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  const bmi = useMemo(
    () => calcBmi(form.weight_kg, form.height_cm),
    [form.weight_kg, form.height_cm]
  );
  const category = bmiCategory(bmi);
  const markerPct = bmiMarkerPct(bmi);

  const profileStrength = useMemo(() => {
    let score = 15;
    if (form.budget_monthly !== "" && Number(form.budget_monthly) >= 0) score += 20;
    if (form.age !== "") score += 10;
    if (form.weight_kg !== "" && form.height_cm !== "") score += 15;
    if (form.dietary_preferences.length) score += 15;
    if (form.health_goals.length) score += 15;
    if (form.milestone_alerts || form.recommendation_nudges) score += 10;
    return Math.min(100, score);
  }, [form]);

  function updateField(key, value) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleList(key, value) {
    setSaved(false);
    setForm((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function addToList(key, value) {
    setSaved(false);
    setForm((prev) => {
      if (prev[key].includes(value)) return prev;
      return { ...prev, [key]: [...prev[key], value] };
    });
  }

  function removeFromList(key, value) {
    setSaved(false);
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].filter((v) => v !== value),
    }));
  }

  function validateBudget(raw) {
    if (raw === "" || raw == null) {
      setBudgetError("");
      return true;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) {
      setBudgetError("Enter a valid amount");
      return false;
    }
    if (n < 0) {
      setBudgetError("Budget cannot be negative");
      return false;
    }
    setBudgetError("");
    return true;
  }

  function onCancel() {
    if (baseline) setForm(baseline);
    setBudgetError("");
    setError("");
    setSaved(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validateBudget(form.budget_monthly)) return;

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const payload = {
        ...form,
        budget_monthly:
          form.budget_monthly === "" ? null : Number(form.budget_monthly),
        age: form.age === "" ? null : Number(form.age),
        weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg),
        height_cm: form.height_cm === "" ? null : Number(form.height_cm),
      };
      await api.updateProfile(customer.id, payload);
      setBaseline({
        ...form,
        budget_monthly:
          form.budget_monthly === "" ? "" : String(Number(form.budget_monthly)),
        age: form.age === "" ? "" : String(Number(form.age)),
        weight_kg:
          form.weight_kg === "" ? "" : String(Number(form.weight_kg)),
        height_cm:
          form.height_cm === "" ? "" : String(Number(form.height_cm)),
      });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading profile…" />;

  const nameParts = (customer.name || "").split(" ");
  const firstName = nameParts[0] || customer.name;
  const lastName = nameParts.slice(1).join(" ") || "—";

  return (
    <div className="pf">
      <div className="pf-hero" aria-hidden="true" />

      <div className="pf-shell">
        <aside className="glass pf-side">
          <p className="pf-kicker">Settings</p>
          <nav className="pf-tabs">
            {SETTINGS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "is-active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="pf-overview">
            <div className="pf-avatar">{initials(customer.name)}</div>
            <h2>{customer.name}</h2>
            <p className="pf-id">{customer.id}</p>

            <div className="pf-strength">
              <div className="pf-strength-top">
                <span>Profile strength</span>
                <strong>{profileStrength}%</strong>
              </div>
              <div className="pf-strength-bar">
                <div style={{ width: `${profileStrength}%` }} />
              </div>
            </div>
          </div>

          {(form.health_goals.length > 0 ||
            form.dietary_preferences.length > 0) && (
            <div className="pf-focus">
              <p className="pf-kicker">Current focus</p>
              <div className="pf-chips">
                {[...form.health_goals, ...form.dietary_preferences]
                  .slice(0, 4)
                  .map((tag) => (
                    <span key={tag} className="pf-chip is-on tone-green">
                      {tag}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </aside>

        <form className="glass pf-main" onSubmit={onSubmit}>
          <div className="pf-main-head">
            <div>
              <h1>{tab === "account" ? "Edit Profile" : "Notifications"}</h1>
              <p>
                {tab === "account"
                  ? "Update your budget, dietary preferences, and wellness targets."
                  : "Choose which BiteBetter nudges reach you."}
              </p>
            </div>
            <div className="pf-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={onCancel}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {saved && (
            <div className="pf-toast" role="status">
              Profile saved — your preferences are up to date.
            </div>
          )}
          {error && <div className="error-state pf-banner">{error}</div>}

          {tab === "account" ? (
            <>
              <section className="pf-section">
                <h3>Identity</h3>
                <div className="pf-grid-2">
                  <label>
                    <span>First name</span>
                    <input value={firstName} readOnly />
                  </label>
                  <label>
                    <span>Surname</span>
                    <input value={lastName} readOnly />
                  </label>
                </div>
                <p className="pf-hint">
                  Name comes from your customer record — use Switch profile to
                  change who&apos;s signed in.
                </p>
              </section>

              <section className="pf-section">
                <h3>Body metrics</h3>
                <div className="pf-metrics-cards">
                  <div>
                    <span>Weight</span>
                    <strong>
                      {form.weight_kg !== "" ? `${form.weight_kg} kg` : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Height</span>
                    <strong>
                      {form.height_cm !== "" ? `${form.height_cm} cm` : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Age</span>
                    <strong>{form.age !== "" ? form.age : "—"}</strong>
                  </div>
                  <div>
                    <span>BMI</span>
                    <strong className={category ? `bmi-${category.key}` : ""}>
                      {bmi != null ? bmi.toFixed(1) : "—"}
                    </strong>
                  </div>
                </div>

                <div className="pf-grid-3">
                  <label>
                    <span>Age</span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={form.age}
                      onChange={(e) => updateField("age", e.target.value)}
                      placeholder="e.g. 28"
                    />
                  </label>
                  <label>
                    <span>Weight (kg)</span>
                    <input
                      type="number"
                      min="20"
                      max="400"
                      step="0.1"
                      value={form.weight_kg}
                      onChange={(e) => updateField("weight_kg", e.target.value)}
                      placeholder="e.g. 72"
                    />
                  </label>
                  <label>
                    <span>Height (cm)</span>
                    <input
                      type="number"
                      min="80"
                      max="250"
                      step="0.1"
                      value={form.height_cm}
                      onChange={(e) => updateField("height_cm", e.target.value)}
                      placeholder="e.g. 178"
                    />
                  </label>
                </div>

                <div className="pf-bmi">
                  <div className="pf-bmi-head">
                    <strong>BMI scale</strong>
                    <span>
                      {bmi != null
                        ? `${bmi.toFixed(1)} · ${category.label}`
                        : "Enter weight and height to calculate"}
                    </span>
                  </div>
                  <div className="pf-bmi-track" aria-hidden="true">
                    <div className="seg under" />
                    <div className="seg normal" />
                    <div className="seg over" />
                    <div className="seg obese" />
                    {markerPct != null && (
                      <div
                        className="pf-bmi-marker"
                        style={{ left: `${markerPct}%` }}
                      />
                    )}
                  </div>
                  <div className="pf-bmi-labels">
                    <span>Under</span>
                    <span>Healthy</span>
                    <span>Over</span>
                    <span>Obese</span>
                  </div>
                </div>
              </section>

              <section className="pf-section">
                <h3>Monthly budget</h3>
                <label className="pf-budget">
                  <span>Food budget (ZAR)</span>
                  <div className="pf-budget-input">
                    <span>R</span>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={form.budget_monthly}
                      onChange={(e) => {
                        setSaved(false);
                        setForm((prev) => ({
                          ...prev,
                          budget_monthly: e.target.value,
                        }));
                        validateBudget(e.target.value);
                      }}
                      placeholder="e.g. 3500"
                    />
                  </div>
                </label>
                {budgetError ? (
                  <p className="pf-field-error">{budgetError}</p>
                ) : form.budget_monthly !== "" && !Number.isNaN(Number(form.budget_monthly)) ? (
                  <p className="pf-hint">
                    About {formatCurrency(form.budget_monthly)} per month for
                    groceries.
                  </p>
                ) : (
                  <p className="pf-hint">
                    Optional — leave blank to skip budget-aware recommendations.
                  </p>
                )}
              </section>

              <section className="pf-section">
                <h3>Dietary preferences</h3>
                <ChipField
                  label="Allergies & preferences"
                  values={form.dietary_preferences}
                  suggestions={DIET_SUGGESTIONS}
                  tone="coral"
                  placeholder="Add a preference or allergy…"
                  onToggle={(v) => toggleList("dietary_preferences", v)}
                  onAdd={(v) => addToList("dietary_preferences", v)}
                  onRemove={(v) => removeFromList("dietary_preferences", v)}
                />
              </section>

              <section className="pf-section">
                <h3>Health goals</h3>
                <ChipField
                  label="What you're working toward"
                  values={form.health_goals}
                  suggestions={GOAL_SUGGESTIONS}
                  tone="green"
                  placeholder="Add a health goal…"
                  onToggle={(v) => toggleList("health_goals", v)}
                  onAdd={(v) => addToList("health_goals", v)}
                  onRemove={(v) => removeFromList("health_goals", v)}
                />
              </section>

              <div className="pf-tip">
                <strong>Pro tip</strong>
                <span>
                  Keep your budget and goals current — recommendations and
                  milestone filters use them on every visit.
                </span>
              </div>
            </>
          ) : (
            <section className="pf-section">
              <h3>Alert preferences</h3>
              <div className="pf-toggles">
                <label className="pf-toggle">
                  <div>
                    <strong>Milestone alerts</strong>
                    <p>Get notified when you unlock a rewards milestone.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.milestone_alerts}
                    className={`pf-switch ${form.milestone_alerts ? "is-on" : ""}`}
                    onClick={() => {
                      setSaved(false);
                      setForm((prev) => ({
                        ...prev,
                        milestone_alerts: !prev.milestone_alerts,
                      }));
                    }}
                  >
                    <span />
                  </button>
                </label>

                <label className="pf-toggle">
                  <div>
                    <strong>Recommendation nudges</strong>
                    <p>Occasional suggestions based on your pantry matches.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.recommendation_nudges}
                    className={`pf-switch ${form.recommendation_nudges ? "is-on" : ""}`}
                    onClick={() => {
                      setSaved(false);
                      setForm((prev) => ({
                        ...prev,
                        recommendation_nudges: !prev.recommendation_nudges,
                      }));
                    }}
                  >
                    <span />
                  </button>
                </label>
              </div>
            </section>
          )}
        </form>
      </div>
    </div>
  );
}
