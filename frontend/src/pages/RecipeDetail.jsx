import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { DAYS, MEALS, useMealPlan } from "../context/MealPlanContext";
import { api } from "../lib/api";
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  clampServings,
  formatScaledIngredient,
  servingsAdjustmentMessage,
} from "../lib/scaleServings";
import { buildNutritionPanels } from "../lib/recipeNutrition";
import { RETAILERS } from "../lib/retailers";
import LoadingBlock from "../components/LoadingBlock";
import "./Recipes.css";

function ExternalLinkIcon() {
  return (
    <svg
      className="rp-external-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function sourceBadge(source = "") {
  if (/woolworth/i.test(source)) return { label: "Woolies", tone: "woolies" };
  if (/checkers/i.test(source)) return { label: "Checkers", tone: "checkers" };
  return { label: "Catalogue", tone: "neutral" };
}

function findNextEmptySlot(plan) {
  for (const day of DAYS) {
    for (const meal of MEALS) {
      if (!plan[day]?.[meal]) return { day, meal };
    }
  }
  return { day: DAYS[0], meal: "Dinner" };
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customer } = useCustomer();
  const { plan, assignRecipe } = useMealPlan();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [desiredServings, setDesiredServings] = useState(MIN_SERVINGS);
  const [servingsInput, setServingsInput] = useState(String(MIN_SERVINGS));
  const [planNote, setPlanNote] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPlanNote("");
    api
      .getRecipe(id, customer.id)
      .then((res) => {
        if (!alive) return;
        const data = res.data;
        const original = clampServings(data.servings || MIN_SERVINGS);
        setRecipe(data);
        setDesiredServings(original);
        setServingsInput(String(original));
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load recipe");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, customer.id]);

  const originalServings = clampServings(recipe?.servings || MIN_SERVINGS);

  const ingredients = useMemo(() => {
    if (!recipe) return [];
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
      return recipe.ingredients;
    }
    return [...(recipe.have || []), ...(recipe.need || [])];
  }, [recipe]);

  const adjustmentMessage = servingsAdjustmentMessage(
    desiredServings,
    originalServings
  );

  const nutrition = useMemo(
    () => buildNutritionPanels(recipe, desiredServings),
    [recipe, desiredServings]
  );

  if (loading) return <LoadingBlock label="Opening recipe…" />;
  if (error) return <div className="error-state panel">{error}</div>;
  if (!recipe) return null;

  const badge = sourceBadge(recipe.source);
  const cookTimeMinutes =
    recipe.cookTimeMinutes ?? recipe.cook_time_minutes ?? null;

  function setServings(next) {
    const clamped = clampServings(next);
    setDesiredServings(clamped);
    setServingsInput(String(clamped));
  }

  function handleServingsInputChange(event) {
    const raw = event.target.value;
    setServingsInput(raw);
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (Number.isFinite(n)) {
      setDesiredServings(clampServings(n));
    }
  }

  function handleServingsInputBlur() {
    setServings(servingsInput);
  }

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/app/recipes");
    }
  }

  function handleAddToMealPlan() {
    const slot = findNextEmptySlot(plan);
    assignRecipe(slot.day, slot.meal, {
      id: recipe.id,
      name: recipe.name,
      prepTimeMinutes: recipe.prepTimeMinutes,
      servings: desiredServings,
      matchPercent: recipe.matchPercent,
      source: recipe.source,
    });
    setPlanNote(`Added to ${slot.day} · ${slot.meal}`);
  }

  return (
    <div className="rp rp-detail-page">
      <div className="rp-hero" aria-hidden="true" />
      <div className="rp-detail glass">
        <button type="button" className="rp-back" onClick={handleBack}>
          ← Back
        </button>

        <header className="rp-detail-head">
          <div>
            <span className={`rp-source ${badge.tone}`}>{badge.label}</span>
            <h1>{recipe.name}</h1>
            {recipe.matchPercent != null && (
              <p>{recipe.matchPercent}% pantry match</p>
            )}
          </div>
          <div className="rp-detail-stat">
            <span>You have</span>
            <strong>
              {recipe.matchCount}/{recipe.totalIngredients}
            </strong>
          </div>
        </header>

        <div className="rp-detail-meta">
          <div className="rp-meta-card">
            <span>Preparation</span>
            <strong>
              {recipe.prepTimeMinutes != null
                ? `${recipe.prepTimeMinutes} min`
                : "Not listed"}
            </strong>
          </div>
          <div className="rp-meta-card">
            <span>Cooking</span>
            <strong>
              {cookTimeMinutes != null ? `${cookTimeMinutes} min` : "Not listed"}
            </strong>
          </div>
          <div className="rp-meta-card">
            <span id="rp-original-servings-label">Original servings</span>
            <strong aria-labelledby="rp-original-servings-label">
              {originalServings}
            </strong>
          </div>
          <div className="rp-meta-card rp-servings-control">
            <label htmlFor="desired-servings-input">Desired servings</label>
            <div
              className="rp-servings-stepper"
              role="group"
              aria-label="Desired servings"
            >
              <button
                type="button"
                aria-label="Decrease desired servings"
                onClick={() => setServings(desiredServings - 1)}
                disabled={desiredServings <= MIN_SERVINGS}
              >
                −
              </button>
              <input
                id="desired-servings-input"
                type="number"
                inputMode="numeric"
                min={MIN_SERVINGS}
                max={MAX_SERVINGS}
                value={servingsInput}
                onChange={handleServingsInputChange}
                onBlur={handleServingsInputBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                aria-valuemin={MIN_SERVINGS}
                aria-valuemax={MAX_SERVINGS}
                aria-valuenow={desiredServings}
                aria-describedby="desired-servings-help"
              />
              <button
                type="button"
                aria-label="Increase desired servings"
                onClick={() => setServings(desiredServings + 1)}
                disabled={desiredServings >= MAX_SERVINGS}
              >
                +
              </button>
            </div>
            <p id="desired-servings-help" className="sr-only">
              Choose between {MIN_SERVINGS} and {MAX_SERVINGS} servings. Ingredient
              amounts and nutrition scale with this value.
            </p>
          </div>
        </div>

        <section className="rp-detail-section">
          <div className="rp-need-head">
            <h2>Ingredients</h2>
          </div>
          {adjustmentMessage ? (
            <p className="rp-scale-note" role="status">
              {adjustmentMessage}
            </p>
          ) : null}
          {ingredients.length ? (
            <ul className="rp-ing-list">
              {ingredients.map((ing) => (
                <li key={ing.id}>
                  <span className={ing.have ? "have" : "need"}>
                    {ing.have ? "✓" : "○"}
                  </span>
                  <span>
                    {formatScaledIngredient(
                      ing,
                      desiredServings,
                      originalServings
                    )}
                    {ing.category ? (
                      <small className="rp-ing-cat"> · {ing.category}</small>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rp-empty">No ingredients listed for this recipe.</p>
          )}
        </section>

        <section className="rp-detail-section rp-method">
          <h2>Cooking instructions</h2>
          {recipe.instructions ? (
            <p>{recipe.instructions}</p>
          ) : (
            <p className="rp-empty">No cooking instructions listed.</p>
          )}
        </section>

        <section className="rp-detail-section" aria-labelledby="rp-nutrition-heading">
          <h2 id="rp-nutrition-heading">Nutrition information</h2>

          <div className="rp-nutrition-panels">
            <div className="rp-nutrition-panel">
              <h3>{nutrition.perServingLabel}</h3>
              <dl className="rp-nutrition-grid">
                {nutrition.perServingRows.map((row) => (
                  <div key={`per-${row.key}`} className="rp-nutrition-row">
                    <dt>{row.label}</dt>
                    <dd className={row.available ? "" : "is-missing"}>
                      {row.display}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rp-nutrition-panel">
              <h3>{nutrition.totalLabel}</h3>
              <dl className="rp-nutrition-grid">
                {nutrition.totalRows.map((row) => (
                  <div key={`total-${row.key}`} className="rp-nutrition-row">
                    <dt>{row.label}</dt>
                    <dd className={row.available ? "" : "is-missing"}>
                      {row.display}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {!nutrition.hasVerifiedData && (
            <p className="rp-empty rp-nutrition-empty">
              Verified per-serving nutrition data is not stored for this recipe
              yet.
            </p>
          )}

          <p className="rp-nutrition-disclaimer">{nutrition.disclaimer}</p>
        </section>

        <div className="rp-detail-actions">
          <a
            className="btn rp-retailer-link rp-retailer-checkers"
            href={RETAILERS.checkers.fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${RETAILERS.checkers.buttonLabel} in a new tab`}
          >
            {RETAILERS.checkers.buttonLabel}
            <ExternalLinkIcon />
          </a>
          <a
            className="btn rp-retailer-link rp-retailer-woolies"
            href={RETAILERS.woolworths.fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${RETAILERS.woolworths.buttonLabel} in a new tab`}
          >
            {RETAILERS.woolworths.buttonLabel}
            <ExternalLinkIcon />
          </a>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleAddToMealPlan}
          >
            Add to meal plan
          </button>
          <Link to="/app/recipes" className="btn btn-secondary">
            Back to recipes
          </Link>
        </div>

        {planNote && <p className="rp-added-note">{planNote}</p>}
      </div>
    </div>
  );
}
