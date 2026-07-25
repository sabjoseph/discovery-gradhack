import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { useShoppingList } from "../context/ShoppingListContext";
import { DAYS, MEALS, useMealPlan } from "../context/MealPlanContext";
import { api } from "../lib/api";
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

export default function Recipes() {
  const { customer } = useCustomer();
  const { items: shoppingItems, clear } = useShoppingList();
  const { plan, assignRecipe, clearSlot, clearWeek } = useMealPlan();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [cookFromPantry, setCookFromPantry] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[0]);
  const [assignTarget, setAssignTarget] = useState(null);

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

  const filtered = useMemo(() => {
    let list = [...recipes];

    if (sourceFilter === "checkers") {
      list = list.filter((r) => /checkers/i.test(r.source || ""));
    } else if (sourceFilter === "woolies") {
      list = list.filter((r) => /woolworth/i.test(r.source || ""));
    }

    if (cookFromPantry) {
      list.sort(
        (a, b) =>
          b.matchPercent - a.matchPercent || b.matchCount - a.matchCount
      );
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [recipes, sourceFilter, cookFromPantry]);

  function handleAssign(recipe) {
    if (!assignTarget) return;
    assignRecipe(assignTarget.day, assignTarget.meal, recipe);
    setAssignTarget(null);
  }

  if (loading) return <LoadingBlock label="Loading recipes…" />;
  if (error) return <div className="error-state panel">{error}</div>;

  return (
    <div className="rp">
      <header className="rp-page-header">
        <div>
          <h1>Recipes</h1>
          <p>
            Plan meals for the week, then browse catalogue recipes ranked by your
            pantry match.
          </p>
        </div>
        <div className="rp-header-actions">
          <button type="button" className="btn btn-outline" onClick={clearWeek}>
            Clear week
          </button>
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
          <div className="rp-day-tabs">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={activeDay === day ? "is-active" : ""}
                onClick={() => setActiveDay(day)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
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
                assignTarget?.day === activeDay && assignTarget?.meal === meal;

              return (
                <article key={meal} className={`rp-meal-slot ${selecting ? "is-selecting" : ""}`}>
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
                        onClick={() => setAssignTarget({ day: activeDay, meal })}
                      >
                        Change recipe
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rp-slot-empty"
                      onClick={() => setAssignTarget({ day: activeDay, meal })}
                    >
                      + Add recipe
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {assignTarget && (
          <div className="rp-assign-banner">
            <p>
              Choosing a recipe for{" "}
              <strong>
                {assignTarget.day} · {assignTarget.meal}
              </strong>
              . Pick one below.
            </p>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </button>
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
            <label className="rp-toggle">
              <input
                type="checkbox"
                checked={cookFromPantry}
                onChange={(e) => setCookFromPantry(e.target.checked)}
              />
              Cook from pantry
            </label>
          </div>
        </div>

        <div className="rp-recipe-grid">
          {filtered.map((recipe) => {
            const badge = sourceBadge(recipe.source);
            return (
              <article key={recipe.id} className="panel rp-recipe-card">
                <div className="rp-card-top">
                  <h3>{recipe.name}</h3>
                  <span className={`rp-source ${badge.tone}`}>{badge.label}</span>
                </div>
                <p className="rp-card-meta">
                  {recipe.prepTimeMinutes} min · serves {recipe.servings} ·{" "}
                  {recipe.matchPercent}% pantry match
                </p>
                <div className="rp-match">
                  <div style={{ width: `${recipe.matchPercent}%` }} />
                </div>
                <div className="rp-card-actions">
                  <Link to={`/app/recipes/${recipe.id}`} className="btn btn-sm btn-outline">
                    View
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      if (assignTarget) {
                        handleAssign(recipe);
                      } else {
                        assignRecipe(activeDay, "Dinner", recipe);
                      }
                    }}
                  >
                    {assignTarget
                      ? `Add to ${assignTarget.day.slice(0, 3)} ${assignTarget.meal}`
                      : `Add to ${activeDay.slice(0, 3)} dinner`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
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
    </div>
  );
}
