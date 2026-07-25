import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api, formatCurrency, formatDate, initials } from "../lib/api";
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
  { id: "rewards", label: "Rewards" },
  { id: "notifications", label: "Notifications" },
];

const ACCOUNT_PANELS = [
  {
    id: "basics",
    label: "Basics",
    title: "Basics",
    blurb: "Who's signed in and your monthly food budget.",
  },
  {
    id: "wellness",
    label: "Wellness",
    title: "Wellness",
    blurb: "Age and body metrics used for your BMI readout.",
  },
  {
    id: "preferences",
    label: "Preferences",
    title: "Preferences",
    blurb: "Dietary needs and health goals that personalise BiteBetter.",
  },
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

function resizeImageFile(file, { maxSize = 256, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
  emptyHint,
}) {
  const [draft, setDraft] = useState("");
  const [showMore, setShowMore] = useState(false);

  const available = suggestions.filter((opt) => !values.includes(opt));
  const visible = showMore ? available : available.slice(0, 3);
  const hiddenCount = Math.max(0, available.length - visible.length);

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
      {values.length === 0 && emptyHint ? (
        <p className="pf-hint pf-chip-empty">{emptyHint}</p>
      ) : null}
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
        {visible.map((opt) => (
          <button
            key={opt}
            type="button"
            className="pf-chip"
            onClick={() => onToggle(opt)}
          >
            + {opt}
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            className="pf-chip pf-chip-more"
            onClick={() => setShowMore(true)}
          >
            +{hiddenCount} more
          </button>
        )}
        {showMore && available.length > 3 && (
          <button
            type="button"
            className="pf-chip pf-chip-more"
            onClick={() => setShowMore(false)}
          >
            Show less
          </button>
        )}
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
  const { customer, setCustomer } = useCustomer();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const initialTab = SETTINGS_TABS.some((t) => t.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "account";
  const [tab, setTab] = useState(initialTab);
  const [accountPanel, setAccountPanel] = useState("basics");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [form, setForm] = useState({
    budget_monthly: "",
    age: "",
    weight_kg: "",
    height_cm: "",
    dietary_preferences: [],
    health_goals: [],
    milestone_alerts: true,
    recommendation_nudges: true,
    avatar_url: null,
  });

  useEffect(() => {
    const next = searchParams.get("tab");
    if (SETTINGS_TABS.some((t) => t.id === next) && next !== tab) {
      setTab(next);
    }
  }, [searchParams]);

  function selectTab(nextTab) {
    setTab(nextTab);
    if (nextTab === "account") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: nextTab }, { replace: true });
    }
  }

  useEffect(() => {
    let alive = true;
    api
      .getProfile(customer.id)
      .then((profileRes) => {
        if (!alive) return;
        const profile = profileRes.data.profile || {};
        const notifications = profileRes.data.notifications || {};
        const avatarUrl = profile.avatar_url || null;
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
          avatar_url: avatarUrl,
        };
        setForm(next);
        setBaseline(next);
        setVouchers(Array.isArray(profile.vouchers) ? profile.vouchers : []);
        if (avatarUrl !== customer.avatarUrl) {
          setCustomer({ ...customer, avatarUrl });
        }
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
    let score = 10;
    if (form.avatar_url) score += 10;
    if (form.budget_monthly !== "" && Number(form.budget_monthly) >= 0) score += 20;
    if (form.age !== "") score += 10;
    if (form.weight_kg !== "" && form.height_cm !== "") score += 15;
    if (form.dietary_preferences.length) score += 15;
    if (form.health_goals.length) score += 15;
    if (form.milestone_alerts || form.recommendation_nudges) score += 5;
    return Math.min(100, score);
  }, [form]);

  const activeAccountPanel =
    ACCOUNT_PANELS.find((p) => p.id === accountPanel) || ACCOUNT_PANELS[0];

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

  async function onPickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const dataUrl = await resizeImageFile(file);
      setSaved(false);
      setForm((prev) => ({ ...prev, avatar_url: dataUrl }));
    } catch (err) {
      setError(err.message || "Could not use that photo");
    }
  }

  function onRemoveAvatar() {
    setSaved(false);
    setForm((prev) => ({ ...prev, avatar_url: null }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validateBudget(form.budget_monthly)) {
      if (tab === "account") setAccountPanel("basics");
      return;
    }

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
        avatar_url: form.avatar_url || null,
      };
      const res = await api.updateProfile(customer.id, payload);
      const savedAvatar = res.data?.profile?.avatar_url ?? form.avatar_url ?? null;
      const nextForm = {
        ...form,
        budget_monthly:
          form.budget_monthly === "" ? "" : String(Number(form.budget_monthly)),
        age: form.age === "" ? "" : String(Number(form.age)),
        weight_kg:
          form.weight_kg === "" ? "" : String(Number(form.weight_kg)),
        height_cm:
          form.height_cm === "" ? "" : String(Number(form.height_cm)),
        avatar_url: savedAvatar,
      };
      setBaseline(nextForm);
      setForm(nextForm);
      setCustomer({ ...customer, avatarUrl: savedAvatar });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading profile…" />;

  const headTitle =
    tab === "account"
      ? activeAccountPanel.title
      : tab === "rewards"
        ? "Rewards"
        : "Notifications";
  const headBlurb =
    tab === "account"
      ? activeAccountPanel.blurb
      : tab === "rewards"
        ? "Vouchers you’ve claimed with milestone points."
        : "Choose which BiteBetter nudges reach you.";

  return (
    <div className="pf">
      <div className="pf-hero" aria-hidden="true" />

      <div className="pf-shell">
        <aside className="glass pf-side">
          <p className="pf-kicker">Settings</p>
          <nav className="pf-tabs" aria-label="Settings sections">
            {SETTINGS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "is-active" : ""}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
                {item.id === "rewards" && vouchers.length > 0
                  ? ` (${vouchers.length})`
                  : ""}
              </button>
            ))}
          </nav>
        </aside>

        <form className="glass pf-main" onSubmit={onSubmit}>
          <div className="pf-main-head">
            <div>
              <h1>{headTitle}</h1>
              <p>{headBlurb}</p>
            </div>
          </div>

          {tab === "account" && (
            <nav className="pf-subtabs" aria-label="Account sections">
              {ACCOUNT_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  className={accountPanel === panel.id ? "is-active" : ""}
                  onClick={() => setAccountPanel(panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </nav>
          )}

          {saved && tab !== "rewards" && (
            <div className="pf-toast" role="status">
              Profile saved — your preferences are up to date.
            </div>
          )}
          {error && <div className="error-state pf-banner">{error}</div>}

          <div className="pf-body">
            {tab === "account" && accountPanel === "basics" && (
              <>
                <section className="pf-section">
                  <h3>Signed in</h3>
                  <div className="pf-identity">
                    <div className="pf-photo-row">
                      <div className="pf-photo">
                        {form.avatar_url ? (
                          <img src={form.avatar_url} alt="" />
                        ) : (
                          <span>{initials(customer.name)}</span>
                        )}
                      </div>
                      <div className="pf-photo-actions">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={onPickAvatar}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {form.avatar_url ? "Change photo" : "Add photo"}
                        </button>
                        {form.avatar_url ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={onRemoveAvatar}
                          >
                            Remove
                          </button>
                        ) : null}
                        <p className="pf-hint">
                          Shown in the top-right avatar. Save Changes to keep it.
                        </p>
                      </div>
                    </div>
                    <div className="pf-identity-row">
                      <strong>{customer.name}</strong>
                      <div className="pf-strength">
                        <div className="pf-strength-top">
                          <span>Profile completeness</span>
                          <strong>{profileStrength}%</strong>
                        </div>
                        <div className="pf-strength-bar">
                          <div style={{ width: `${profileStrength}%` }} />
                        </div>
                      </div>
                    </div>
                    <span className="pf-identity-hint">
                      Name comes from your customer record — use Sign out in the
                      avatar menu to choose a different profile.
                    </span>
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
                  ) : form.budget_monthly !== "" &&
                    !Number.isNaN(Number(form.budget_monthly)) ? (
                    <p className="pf-hint">
                      About {formatCurrency(form.budget_monthly)} per month for
                      groceries.
                    </p>
                  ) : (
                    <p className="pf-hint">
                      Optional — leave blank to skip budget-aware
                      recommendations.
                    </p>
                  )}
                </section>
              </>
            )}

            {tab === "account" && accountPanel === "wellness" && (
              <section className="pf-section">
                <h3>Body metrics</h3>
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
            )}

            {tab === "account" && accountPanel === "preferences" && (
              <>
                <section className="pf-section">
                  <h3>Dietary preferences</h3>
                  <ChipField
                    label="Allergies & preferences"
                    values={form.dietary_preferences}
                    suggestions={DIET_SUGGESTIONS}
                    tone="coral"
                    placeholder="Add a preference or allergy…"
                    emptyHint="Add a preference to personalise recommendations."
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
                    emptyHint="Add a goal so recommendations stay on target."
                    onToggle={(v) => toggleList("health_goals", v)}
                    onAdd={(v) => addToList("health_goals", v)}
                    onRemove={(v) => removeFromList("health_goals", v)}
                  />
                </section>
              </>
            )}

            {tab === "rewards" && (
              <section className="pf-section">
                <h3>Your vouchers</h3>
                {vouchers.length === 0 ? (
                  <div className="pf-voucher-empty">
                    <p>
                      No vouchers yet. Earn points from milestones, then claim a
                      reward on the Rewards page.
                    </p>
                    <Link to="/app/rewards" className="btn btn-primary btn-sm">
                      Go to Rewards
                    </Link>
                  </div>
                ) : (
                  <div className="pf-voucher-list">
                    {vouchers.map((v) => (
                      <article key={v.id} className="pf-voucher-card">
                        <div className="pf-voucher-top">
                          <div>
                            <span className="pf-voucher-status">
                              {v.status === "active" ? "Active" : v.status}
                            </span>
                            <h4>{v.name}</h4>
                            <p>{v.detail}</p>
                          </div>
                          <strong className="pf-voucher-value">
                            {formatCurrency(v.valueZar)}
                          </strong>
                        </div>
                        <div className="pf-voucher-code">
                          <span>Code</span>
                          <code>{v.code}</code>
                        </div>
                        <div className="pf-voucher-meta">
                          <span>{v.pointsCost} pts</span>
                          <span>Issued {formatDate(v.issuedAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "notifications" && (
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
          </div>

          {tab !== "rewards" && (
            <div className="pf-actions-bar">
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
          )}
        </form>
      </div>
    </div>
  );
}
