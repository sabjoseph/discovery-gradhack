import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { DAYS, MEALS, useMealPlan } from "../context/MealPlanContext";
import { resolveAssignSlot } from "../lib/mealPlanSlot";
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

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customer } = useCustomer();
  const { pendingSlot, setPendingSlot, assignRecipe } = useMealPlan();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [desiredServings, setDesiredServings] = useState(MIN_SERVINGS);
  const [servingsInput, setServingsInput] = useState(String(MIN_SERVINGS));
  const [planNote, setPlanNote] = useState("");
  const [planDay, setPlanDay] = useState(pendingSlot?.day ?? DAYS[0]);
  const [planMeal, setPlanMeal] = useState(pendingSlot?.meal ?? "Dinner");

  useEffect(() => {
    if (pendingSlot?.day && pendingSlot?.meal) {
      setPlanDay(pendingSlot.day);
      setPlanMeal(pendingSlot.meal);
    }
  }, [pendingSlot]);

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

  const swapByIngredient = useMemo(() => {
    const map = new Map();
    for (const group of recipe?.substitutions?.groups || []) {
      map.set(String(group.ingredientName || "").toLowerCase(), group);
    }
    return map;
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
    const slot = resolveAssignSlot(
      { day: planDay, meal: planMeal },
      planDay,
      planMeal
    );
    assignRecipe(slot.day, slot.meal, {
      id: recipe.id,
      name: recipe.name,
      prepTimeMinutes: recipe.prepTimeMinutes,
      servings: desiredServings,
      matchPercent: recipe.matchPercent,
      source: recipe.source,
    });
    setPendingSlot(null);
    setPlanNote(`Added to ${slot.day} · ${slot.meal}`);
  }

  function handlePlanDayChange(event) {
    const day = event.target.value;
    setPlanDay(day);
    setPendingSlot({ day, meal: planMeal });
  }

  function handlePlanMealChange(event) {
    const meal = event.target.value;
    setPlanMeal(meal);
    setPendingSlot({ day: planDay, meal });
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
            {recipe.preferences?.badges?.length > 0 && (
              <ul className="rp-detail-pref-badges">
                {recipe.preferences.badges.map((label) => (
                  <li
                    key={label}
                    className={
                      recipe.preferences.matched?.some((m) => m.label === label)
                        ? "is-matched"
                        : ""
                    }
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rp-detail-stat">
            <span>You have</span>
            <strong>
              {recipe.matchCount}/{recipe.totalIngredients}
            </strong>
          </div>
        </header>

        {recipe.allergen?.hasAllergen && (
          <section className="rp-allergen-banner" role="alert">
            <h2>
              <span aria-hidden="true">⚠</span> Allergy warning
            </h2>
            <p>{recipe.allergen.warning}</p>
            <ul>
              {recipe.allergen.matches.map((m, i) => (
                <li key={`${m.ingredientName}-${i}`}>
                  <strong>{m.ingredientName}</strong> contains{" "}
                  {m.allergenLabel}
                </li>
              ))}
            </ul>
            {recipe.allergen.needsReview?.length > 0 && (
              <p className="rp-allergen-review">
                We could not confidently classify{" "}
                {recipe.allergen.needsReview
                  .map((n) => n.ingredientName)
                  .join(", ")}
                . Check these ingredients yourself.
              </p>
            )}
            {recipe.allergen.unrecognisedAllergies?.length > 0 && (
              <p className="rp-allergen-review">
                We cannot yet check for{" "}
                {recipe.allergen.unrecognisedAllergies.join(", ")}. Review the
                ingredients yourself.
              </p>
            )}
          </section>
        )}

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
              {ingredients.map((ing) => {
                const swapGroup = swapByIngredient.get(
                  String(ing.name || "").toLowerCase()
                );
                const topSwap = swapGroup?.options?.[0] || null;
                return (
                  <li
                    key={ing.id}
                    className={ing.allergenLabel ? "is-allergen" : ""}
                  >
                    <span className={ing.have ? "have" : "need"}>
                      {ing.have ? "✓" : "○"}
                    </span>
                    <span className="rp-ing-body">
                      <span>
                        {formatScaledIngredient(
                          ing,
                          desiredServings,
                          originalServings
                        )}
                        {ing.allergenLabel ? (
                          <small className="rp-ing-allergen">
                            {" "}
                            · {ing.allergenLabel} allergen
                          </small>
                        ) : null}
                        {ing.category ? (
                          <small className="rp-ing-cat"> · {ing.category}</small>
                        ) : null}
                      </span>
                      {topSwap ? (
                        <span className="rp-ing-swap">
                          Swap for{" "}
                          <strong>{topSwap.substitute}</strong>
                          {topSwap.adjustedQuantity != null
                            ? ` (${topSwap.adjustedQuantity}${
                                topSwap.unit ? ` ${topSwap.unit}` : ""
                              })`
                            : ""}
                          {swapGroup.options.length > 1
                            ? ` · +${swapGroup.options.length - 1} more below`
                            : ""}
                        </span>
                      ) : null}
                      {swapGroup && !topSwap && swapGroup.message ? (
                        <span className="rp-ing-swap is-missing">
                          {swapGroup.message}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rp-empty">No ingredients listed for this recipe.</p>
          )}
        </section>

        {recipe.substitutions?.groups?.length > 0 && (
          <section
            className="rp-detail-section rp-subs"
            aria-labelledby="rp-subs-heading"
          >
            <h2 id="rp-subs-heading">Allergen-friendly alternatives</h2>
            <p className="rp-subs-intro">
              Optional swaps for the ingredients flagged above. The original
              recipe is left unchanged.
            </p>
            {recipe.substitutions.groups.map((group) => (
              <article key={group.ingredientName} className="rp-subs-group">
                <h3>
                  Instead of {group.ingredientName}
                  <small> · {group.allergenLabel}</small>
                </h3>
                {group.message ? (
                  <p className="rp-empty">{group.message}</p>
                ) : (
                  <ul className="rp-subs-options">
                    {group.options.map((opt) => (
                      <li key={opt.id}>
                        <div className="rp-subs-option-head">
                          <strong>{opt.substitute}</strong>
                          <span className="rp-subs-context">
                            {opt.cookingContext}
                          </span>
                        </div>
                        {opt.adjustedQuantity != null && (
                          <p className="rp-subs-qty">
                            Use {opt.adjustedQuantity}
                            {opt.unit ? ` ${opt.unit}` : ""} in place of{" "}
                            {opt.originalQuantity}
                            {opt.unit ? ` ${opt.unit}` : ""}
                          </p>
                        )}
                        <table className="rp-subs-table">
                          <caption>
                            Nutritional comparison, {opt.comparison.basis}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Nutrient</th>
                              <th scope="col">Original</th>
                              <th scope="col">Alternative</th>
                              <th scope="col">Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opt.comparison.rows.map((row) => (
                              <tr key={row.label}>
                                <th scope="row">{row.label}</th>
                                <td>
                                  {row.available
                                    ? `${row.original} ${row.unit}`
                                    : "Not available"}
                                </td>
                                <td>
                                  {row.available
                                    ? `${row.substitute} ${row.unit}`
                                    : "Not available"}
                                </td>
                                <td>
                                  {row.deltaPercent == null
                                    ? "—"
                                    : `${row.deltaPercent > 0 ? "+" : ""}${
                                        row.deltaPercent
                                      }%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p
                          className={`rp-subs-summary ${
                            opt.comparison.broadlyComparable ? "is-close" : ""
                          }`}
                        >
                          {opt.comparison.summary}
                        </p>
                        {opt.caveat && (
                          <p className="rp-subs-caveat">{opt.caveat}</p>
                        )}
                        <p className="rp-subs-source">Source: {opt.source}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            <p className="rp-subs-notice">{recipe.substitutions.notice}</p>
          </section>
        )}

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

        <div className="rp-detail-plan-picker">
          <label>
            <span>Day</span>
            <select value={planDay} onChange={handlePlanDayChange}>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Meal</span>
            <select value={planMeal} onChange={handlePlanMealChange}>
              {MEALS.map((meal) => (
                <option key={meal} value={meal}>
                  {meal}
                </option>
              ))}
            </select>
          </label>
        </div>

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
            Add to {planDay.slice(0, 3)} {planMeal.toLowerCase()}
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
