import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

const DIET_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Low sugar",
  "High protein",
];

const GOAL_OPTIONS = [
  "Eat healthier",
  "Reduce sugar",
  "Cook more at home",
  "Stay on budget",
  "Increase fibre",
  "More vegetables",
];

export default function Profile() {
  const { customer } = useCustomer();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    budget_monthly: "",
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
        setForm({
          budget_monthly: profile.budget_monthly ?? "",
          dietary_preferences: Array.isArray(profile.dietary_preferences)
            ? profile.dietary_preferences
            : [],
          health_goals: Array.isArray(profile.health_goals)
            ? profile.health_goals
            : [],
          milestone_alerts: notifications.milestone_alerts ?? true,
          recommendation_nudges: notifications.recommendation_nudges ?? true,
        });
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

  function toggleList(key, value) {
    setForm((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api.updateProfile(customer.id, form);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading profile…" />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile & settings</h1>
          <p>
            Set budget, dietary preferences, health goals, and notification
            toggles for {customer.name}.
          </p>
        </div>
      </div>

      <form className="panel" onSubmit={onSubmit} style={{ maxWidth: 720 }}>
        <label style={{ display: "block", marginBottom: "1.25rem" }}>
          <span style={{ fontWeight: 700, display: "block", marginBottom: "0.45rem" }}>
            Monthly food budget (ZAR)
          </span>
          <input
            type="number"
            min="0"
            step="50"
            value={form.budget_monthly}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, budget_monthly: e.target.value }))
            }
            placeholder="e.g. 3500"
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.8rem 1rem",
              background: "#f8fafc",
            }}
          />
        </label>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.25rem" }}>
          <legend style={{ fontWeight: 700, marginBottom: "0.55rem" }}>
            Dietary preferences
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {DIET_OPTIONS.map((opt) => {
              const active = form.dietary_preferences.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => toggleList("dietary_preferences", opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.25rem" }}>
          <legend style={{ fontWeight: 700, marginBottom: "0.55rem" }}>
            Health goals
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {GOAL_OPTIONS.map((opt) => {
              const active = form.health_goals.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => toggleList("health_goals", opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem" }}>
          <legend style={{ fontWeight: 700, marginBottom: "0.55rem" }}>
            Notifications
          </legend>
          <label style={{ display: "flex", gap: "0.65rem", alignItems: "center", marginBottom: "0.55rem" }}>
            <input
              type="checkbox"
              checked={form.milestone_alerts}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, milestone_alerts: e.target.checked }))
              }
            />
            Milestone alerts
          </label>
          <label style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.recommendation_nudges}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  recommendation_nudges: e.target.checked,
                }))
              }
            />
            Recommendation nudges
          </label>
        </fieldset>

        {error && <div className="error-state" style={{ marginBottom: "1rem" }}>{error}</div>}
        {saved && (
          <div style={{ color: "var(--primary-deep)", fontWeight: 700, marginBottom: "1rem" }}>
            Profile saved.
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </>
  );
}
