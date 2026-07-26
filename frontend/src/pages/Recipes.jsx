import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { useShoppingList } from "../context/ShoppingListContext";
import { DAYS, MEALS, useMealPlan } from "../context/MealPlanContext";
import { resolveAssignSlot } from "../lib/mealPlanSlot";
import { api, formatCurrency } from "../lib/api";
import {
  FOOD_CATEGORIES,
  UNCATEGORISED,
  normalizeFoodCategory,
} from "../lib/foodCategories";
import LoadingBlock from "../components/LoadingBlock";
import "./Recipes.css";

function sourceBadge(source = "") {
  if (/woolworth/i.test(source)) return { label: "Woolies", tone: "woolies" };
  if (/checkers/i.test(source)) return { label: "Checkers", tone: "checkers" };
  return { label: "Catalogue", tone: "neutral" };
}

function formatIngredientLine(ing) {
  const qty =
    ing.quantity != null && ing.quantity !== ""
      ? `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}`
      : "";
  return qty ? `${ing.name} (${qty})` : ing.name;
}

function toMealPlanRecipe(item) {
  const recipe = item.recipe;
  if (!recipe?.id) return null;
  return {
    id: recipe.id,
    name: recipe.name,
    prepTimeMinutes: recipe.prep_time_minutes,
    servings: recipe.servings,
    matchPercent: item.matchPercent,
    source: recipe.source,
  };
}

export default function Recipes() {
  const { customer } = useCustomer();
  const { items: shoppingItems, clear, pruneClearedRecipes } = useShoppingList();
  const { plan, pendingSlot, setPendingSlot, assignRecipe, clearSlot, clearDay, clearWeek } =
    useMealPlan();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cookFromPantry, setCookFromPantry] = useState(true);
  const [preferencesOnly, setPreferencesOnly] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[0]);
  const [activeMeal, setActiveMeal] = useState("Dinner");
  const [confirmDay, setConfirmDay] = useState(null);

  const [recs, setRecs] = useState([]);
  const [budget, setBudget] = useState(null);
  const [recsLoading, setRecsLoading] = useState(true);
  const [recsError, setRecsError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const [acceptedSlots, setAcceptedSlots] = useState({});

  useEffect(() => {
    let alive = true;
    api
      .getRecipes(customer.id)
      .then((res) => {
        if (alive) setRecipes(res.data || []);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load recipes");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  useEffect(() => {
    let alive = true;
    setRecsLoading(true);
    api
      .getRecommendations(customer.id)
      .then((res) => {
        if (!alive) return;
        setRecs(res.data || []);
        setBudget(res.budget || null);
      })
      .catch((err) => {
        if (alive) setRecsError(err.message || "Failed to load recommendations");
      })
      .finally(() => {
        if (alive) setRecsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  useEffect(() => {
    if (window.location.hash === "#for-you") {
      document.getElementById("for-you")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, recsLoading]);

  const hasSavedPreferences = recipes.some(
    (r) => (r.preferences?.selectedCount ?? 0) > 0
  );

  const filtered = useMemo(() => {
    let list = [...recipes];

    if (sourceFilter === "checkers") {
      list = list.filter((r) => /checkers/i.test(r.source || ""));
    } else if (sourceFilter === "woolies") {
      list = list.filter((r) => /woolworth/i.test(r.source || ""));
    }

    if (categoryFilter !== "all") {
      list = list.filter((r) => {
        const cats =
          Array.isArray(r.categories) && r.categories.length > 0
            ? r.categories.map(normalizeFoodCategory)
            : [UNCATEGORISED];
        return cats.includes(categoryFilter);
      });
    }

    // Gated on hasSavedPreferences: without it, clearing every preference would
    // leave this filter stuck on with no visible control to switch it off.
    if (preferencesOnly && hasSavedPreferences) {
      // Keep recipes we could confirm satisfy every saved preference. Recipes we
      // cannot decide from stored data are kept out rather than assumed to match.
      list = list.filter(
        (r) => r.preferences?.matchPercent === 100 && r.preferences.unmet?.length === 0
      );
    }

    // Recipes containing a saved allergen always sink below safe recipes,
    // whichever sort the user has chosen.
    const bySafety = (a, b) =>
      Number(a.isSafe === false) - Number(b.isSafe === false);

    if (cookFromPantry) {
      list.sort(
        (a, b) =>
          bySafety(a, b) ||
          b.matchPercent - a.matchPercent ||
          // Preference alignment breaks pantry ties.
          (b.personalScore ?? 0) - (a.personalScore ?? 0) ||
          b.matchCount - a.matchCount
      );
    } else {
      list.sort((a, b) => bySafety(a, b) || a.name.localeCompare(b.name));
    }

    return list;
  }, [
    recipes,
    sourceFilter,
    categoryFilter,
    cookFromPantry,
    preferencesOnly,
    hasSavedPreferences,
  ]);

  function selectPlannerSlot(day, meal) {
    setActiveDay(day);
    setActiveMeal(meal);
    setPendingSlot({ day, meal });
  }

  function handleAssign(recipe, slot = pendingSlot) {
    const target = slot ?? resolveAssignSlot(null, activeDay, activeMeal);
    assignRecipe(target.day, target.meal, recipe);
    setPendingSlot(null);
  }

  const activeDayMealCount = MEALS.filter(
    (meal) => plan[activeDay]?.[meal]
  ).length;

  function syncShoppingListAfterClearDay(day, nextPlan) {
    const clearedNames = MEALS.map((meal) => plan[day]?.[meal]?.name).filter(
      Boolean
    );

    const remainingNames = [];
    const remainingIds = new Set();

    for (const planDay of DAYS) {
      for (const meal of MEALS) {
        const slot = nextPlan[planDay]?.[meal];
        if (!slot) continue;
        remainingIds.add(slot.id);
        if (slot.name) remainingNames.push(slot.name);
      }
    }

    const neededKeys = [];
    for (const recipe of recipes) {
      if (!remainingIds.has(recipe.id)) continue;
      for (const ing of recipe.need || []) {
        neededKeys.push(
          `${ing.name}|${ing.quantity ?? ""}|${ing.unit ?? ""}`
        );
      }
    }

    pruneClearedRecipes(clearedNames, remainingNames, neededKeys);
  }

  function handleClearDay() {
    if (activeDayMealCount === 0) return;
    setConfirmDay(activeDay);
  }

  function confirmClearDay() {
    const day = confirmDay;
    if (!day) return;

    const nextPlan = {
      ...plan,
      [day]: Object.fromEntries(MEALS.map((meal) => [meal, null])),
    };
    clearDay(day);
    syncShoppingListAfterClearDay(day, nextPlan);
    if (pendingSlot?.day === day) setPendingSlot(null);
    setConfirmDay(null);
  }

  async function handleRecAction(item, action) {
    setBusyId(item.id);
    setRecsError("");
    try {
      await api.actOnRecommendation(customer.id, item.id, action);
      if (action === "dismissed") {
        setRecs((prev) => prev.filter((row) => row.id !== item.id));
      } else {
        const mealRecipe = toMealPlanRecipe(item);
        if (mealRecipe) {
          const slot = resolveAssignSlot(pendingSlot, activeDay, activeMeal);
          assignRecipe(slot.day, slot.meal, mealRecipe);
          setActiveDay(slot.day);
          setActiveMeal(slot.meal);
          setAcceptedSlots((prev) => ({
            ...prev,
            [item.id]: `${slot.day} · ${slot.meal}`,
          }));
        }
        setAcceptedIds((prev) => new Set(prev).add(item.id));
      }
    } catch (err) {
      setRecsError(err.message || "Could not save your response");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingBlock label="Loading recipes…" />;
  if (error) return <div className="error-state panel">{error}</div>;

  return (
    <div className="rp">
      <header className="rp-page-header">
        <div>
          <h1>Recipes</h1>
          <p>
            Personalised picks based on what you already have, a weekly meal
            plan, and the full recipe catalogue.
          </p>
        </div>
        <div className="rp-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setListOpen(true)}
          >
            Shopping list ({shoppingItems.length})
          </button>
        </div>
      </header>

      <section className="rp-planner panel">
        <div className="rp-planner-top">
          <h2>Weekly meal planner</h2>
          <div className="rp-planner-actions">
            <button type="button" className="btn btn-outline" onClick={clearWeek}>
              Clear week
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClearDay}
              disabled={activeDayMealCount === 0}
            >
              Clear {activeDay}
            </button>
          </div>
        </div>

        <div className="rp-week-strip">
          {DAYS.map((day) => {
            const filled = MEALS.filter((meal) => plan[day]?.[meal]).length;
            return (
              <button
                key={day}
                type="button"
                className={`rp-week-chip ${activeDay === day ? "is-active" : ""}`}
                onClick={() => setActiveDay(day)}
              >
                <strong>{day}</strong>
                <span>
                  {filled}/{MEALS.length} meals
                </span>
              </button>
            );
          })}
        </div>

        <div className="rp-day-meals">
          <h3>{activeDay}</h3>
          <div className="rp-meal-grid">
            {MEALS.map((meal) => {
              const slot = plan[activeDay]?.[meal];
              const selecting =
                pendingSlot?.day === activeDay && pendingSlot?.meal === meal;

              return (
                <article
                  key={meal}
                  className={`rp-meal-slot ${selecting ? "is-selecting" : ""}`}
                >
                  <header>
                    <span>{meal}</span>
                    {slot && (
                      <button
                        type="button"
                        className="rp-slot-clear"
                        onClick={() => clearSlot(activeDay, meal)}
                      >
                        Remove
                      </button>
                    )}
                  </header>

                  {slot ? (
                    <div className="rp-slot-filled">
                      <Link to={`/app/recipes/${slot.id}`}>
                        <strong>{slot.name}</strong>
                      </Link>
                      <p>
                        {slot.prepTimeMinutes} min · serves {slot.servings}
                        {slot.matchPercent != null
                          ? ` · ${slot.matchPercent}% match`
                          : ""}
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => selectPlannerSlot(activeDay, meal)}
                      >
                        Change recipe
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rp-slot-empty"
                      onClick={() => selectPlannerSlot(activeDay, meal)}
                    >
                      + Add recipe
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {pendingSlot && (
          <div className="rp-assign-banner">
            <p>
              Choosing a recipe for{" "}
              <strong>
                {pendingSlot.day} · {pendingSlot.meal}
              </strong>
              . Pick one below.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setPendingSlot(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section id="for-you" className="rp-foryou panel">
        <div className="rp-foryou-head">
          <div>
            <p className="rp-foryou-kicker">For you</p>
            <h2>Recommendations</h2>
            <p>
              Suggestions matched to your pantry. Accept one to add it to your
              meal plan.
            </p>
          </div>
          {budget && (
            <div className="rp-budget">
              <span>Left of your monthly budget</span>
              <strong className={budget.remaining < 0 ? "is-over" : ""}>
                {formatCurrency(budget.remaining)}
              </strong>
              <small>
                {formatCurrency(budget.monthSpend)} spent of{" "}
                {formatCurrency(budget.budgetMonthly)} — pricier picks are filtered
                out
              </small>
            </div>
          )}
        </div>

        {recsError && <div className="error-state rp-foryou-error">{recsError}</div>}

        {recsLoading ? (
          <LoadingBlock label="Finding what fits you…" />
        ) : recs.length === 0 ? (
          <div className="rp-foryou-empty">
            No recommendations right now — check back after your next shop.
          </div>
        ) : (
          <div className="rp-foryou-feed">
            {recs.map((item) => {
              const accepted = acceptedIds.has(item.id);
              return (
                <article
                  key={item.id}
                  className={`rp-foryou-card ${accepted ? "is-accepted" : ""} ${
                    item.isSafe === false ? "has-allergen" : ""
                  }`}
                >
                  <div className="rp-foryou-card-main">
                    <div className="rp-foryou-tags">
                      <span className="rp-foryou-type">{item.type}</span>
                      {item.matchPercent != null && (
                        <span className="rp-foryou-match-pill">
                          {item.matchPercent}% pantry match
                        </span>
                      )}
                      {item.preferences?.matched?.map((pref) => (
                        <span key={pref.id} className="rp-foryou-pref-pill">
                          {pref.label}
                        </span>
                      ))}
                    </div>
                    <h3>
                      {item.recipe?.name || item.product?.name || "Suggestion"}
                    </h3>
                    {item.isSafe === false && (
                      <p className="rp-allergen-flag" role="alert">
                        <span aria-hidden="true">⚠</span> Contains{" "}
                        {item.allergen.labels.join(", ")} — see alternatives
                      </p>
                    )}
                    <p className="rp-foryou-reason">{item.reason}</p>
                    <p className="rp-foryou-meta">
                      {item.recipe?.prep_time_minutes != null &&
                        `${item.recipe.prep_time_minutes} min · serves ${item.recipe.servings}`}
                      {item.estimatedMissingCost != null &&
                        ` · ~${formatCurrency(item.estimatedMissingCost)} to complete`}
                    </p>
                    {item.matchPercent != null && (
                      <div className="rp-match">
                        <div style={{ width: `${item.matchPercent}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="rp-foryou-actions">
                    {item.recipe?.id && (
                      <Link
                        to={`/app/recipes/${item.recipe.id}`}
                        className="btn btn-sm btn-outline"
                      >
                        View recipe
                      </Link>
                    )}
                    {accepted ? (
                      <span className="rp-foryou-accepted">
                        Added to {acceptedSlots[item.id] || "your plan"} ✓
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busyId === item.id}
                          onClick={() => handleRecAction(item, "accepted")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          disabled={busyId === item.id}
                          onClick={() => handleRecAction(item, "dismissed")}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rp-catalogue">
        <div className="rp-catalogue-head">
          <div>
            <h2>Recipe catalogue</h2>
            <p>10 Discovery Vitality recipes from Checkers & Woolworths.</p>
          </div>
          <div className="rp-filters">
            <label>
              Source
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">All catalogues</option>
                <option value="checkers">Checkers</option>
                <option value="woolies">Woolworths</option>
              </select>
            </label>
            <label>
              Food category
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {FOOD_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value={UNCATEGORISED}>{UNCATEGORISED}</option>
              </select>
            </label>
            <label className="rp-toggle">
              <input
                type="checkbox"
                checked={cookFromPantry}
                onChange={(e) => setCookFromPantry(e.target.checked)}
              />
              Cook from pantry
            </label>
            {hasSavedPreferences && (
              <label className="rp-toggle">
                <input
                  type="checkbox"
                  checked={preferencesOnly}
                  onChange={(e) => setPreferencesOnly(e.target.checked)}
                />
                Matches my dietary preferences
              </label>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="panel rp-empty-filters">
            No recipes match the selected filters.
          </div>
        ) : (
          <div className="rp-recipe-grid">
            {filtered.map((recipe) => {
              const badge = sourceBadge(recipe.source);
              return (
                <article
                  key={recipe.id}
                  className={`panel rp-recipe-card ${
                    recipe.isSafe === false ? "has-allergen" : ""
                  }`}
                >
                  <div className="rp-card-top">
                    <h3>{recipe.name}</h3>
                    <span className={`rp-source ${badge.tone}`}>{badge.label}</span>
                  </div>
                  {recipe.isSafe === false && (
                    <p className="rp-allergen-flag" role="alert">
                      <span aria-hidden="true">⚠</span> Contains{" "}
                      {recipe.allergen.labels.join(", ")} — see alternatives
                    </p>
                  )}
                  {recipe.preferences?.badges?.length > 0 && (
                    <ul className="rp-pref-badges">
                      {recipe.preferences.badges.map((label) => (
                        <li
                          key={label}
                          className={
                            recipe.preferences.matched?.some(
                              (m) => m.label === label
                            )
                              ? "is-matched"
                              : ""
                          }
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="rp-card-meta">
                    {recipe.prepTimeMinutes} min · serves {recipe.servings} ·{" "}
                    {recipe.matchPercent}% pantry match
                  </p>
                  <div className="rp-match">
                    <div style={{ width: `${recipe.matchPercent}%` }} />
                  </div>
                  <div className="rp-card-actions">
                    <Link
                      to={`/app/recipes/${recipe.id}`}
                      className="btn btn-sm btn-outline"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        if (pendingSlot) {
                          handleAssign(recipe, pendingSlot);
                        } else {
                          const slot = resolveAssignSlot(null, activeDay, activeMeal);
                          assignRecipe(slot.day, slot.meal, recipe);
                        }
                      }}
                    >
                      {pendingSlot
                        ? `Add to ${pendingSlot.day.slice(0, 3)} ${pendingSlot.meal}`
                        : `Add to ${activeDay.slice(0, 3)} ${activeMeal.toLowerCase()}`}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {listOpen && (
        <div className="rp-drawer-backdrop" onClick={() => setListOpen(false)}>
          <aside
            className="rp-drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Shopping list"
          >
            <header>
              <h2>Shopping list</h2>
              <button type="button" onClick={() => setListOpen(false)}>
                Close
              </button>
            </header>
            {shoppingItems.length === 0 ? (
              <p className="rp-empty">
                Add missing ingredients from a recipe detail page.
              </p>
            ) : (
              <ul>
                {shoppingItems.map((item) => (
                  <li key={item.key}>
                    <div>
                      <strong>{formatIngredientLine(item)}</strong>
                      <small>From {item.recipeName}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {shoppingItems.length > 0 && (
              <button type="button" className="rp-clear" onClick={clear}>
                Clear list
              </button>
            )}
          </aside>
        </div>
      )}

      {confirmDay && (
        <div
          className="rp-confirm-backdrop"
          onClick={() => setConfirmDay(null)}
        >
          <div
            className="rp-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rp-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rp-confirm-title">Clear {confirmDay}?</h3>
            <p>
              Clear all meals planned for <strong>{confirmDay}</strong>? This
              removes its breakfast, lunch and dinner from your plan.
            </p>
            <div className="rp-confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmDay(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmClearDay}
              >
                Clear {confirmDay}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
