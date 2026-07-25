import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { useShoppingList } from "../context/ShoppingListContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";
import "./Recipes.css";

function sourceBadge(source = "") {
  if (/woolworth/i.test(source)) return { label: "Woolies", tone: "woolies" };
  if (/checkers/i.test(source)) return { label: "Checkers", tone: "checkers" };
  return { label: "Catalogue", tone: "neutral" };
}

function ingredientText(ing) {
  const qty =
    ing.quantity != null && ing.quantity !== ""
      ? `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}`
      : "";
  return qty ? `${ing.name} — ${qty}` : ing.name;
}

export default function RecipeDetail() {
  const { id } = useParams();
  const { customer } = useCustomer();
  const { addMissing, items } = useShoppingList();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getRecipe(id, customer.id)
      .then((res) => {
        if (alive) setRecipe(res.data);
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

  if (loading) return <LoadingBlock label="Opening recipe…" />;
  if (error) return <div className="error-state panel">{error}</div>;
  if (!recipe) return null;

  const badge = sourceBadge(recipe.source);

  function handleAddMissing() {
    addMissing(recipe.name, recipe.need || []);
    setAdded(true);
  }

  return (
    <div className="rp rp-detail-page">
      <div className="rp-hero" aria-hidden="true" />
      <div className="rp-detail glass">
        <Link to="/app/recipes" className="rp-back">
          ← Back to recipes
        </Link>

        <header className="rp-detail-head">
          <div>
            <span className={`rp-source ${badge.tone}`}>{badge.label}</span>
            <h1>{recipe.name}</h1>
            <p>
              {recipe.prepTimeMinutes} min · serves {recipe.servings} ·{" "}
              {recipe.matchPercent}% pantry match
            </p>
          </div>
          <div className="rp-detail-stat">
            <span>You have</span>
            <strong>
              {recipe.matchCount}/{recipe.totalIngredients}
            </strong>
          </div>
        </header>

        <div className="rp-detail-grid">
          <section>
            <h2>You have this</h2>
            {recipe.have?.length ? (
              <ul className="rp-ing-list">
                {recipe.have.map((ing) => (
                  <li key={ing.id}>
                    <span className="have">✓</span>
                    <span>{ingredientText(ing)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rp-empty">No pantry matches yet.</p>
            )}
          </section>

          <section>
            <div className="rp-need-head">
              <h2>You still need this</h2>
              {recipe.need?.length > 0 && (
                <button
                  type="button"
                  className="rp-add-missing"
                  onClick={handleAddMissing}
                >
                  {added ? "Added to list" : "Add missing items"}
                </button>
              )}
            </div>
            {recipe.need?.length ? (
              <ul className="rp-ing-list">
                {recipe.need.map((ing) => (
                  <li key={ing.id}>
                    <span className="need">○</span>
                    <span>{ingredientText(ing)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rp-ready">You have everything — cook tonight.</p>
            )}
            {added && (
              <p className="rp-added-note">
                {recipe.need.length} item(s) saved to your shopping list (
                {items.length} total). Open it from the Recipes page.
              </p>
            )}
          </section>
        </div>

        <section className="rp-method">
          <h2>Method</h2>
          <p>{recipe.instructions}</p>
        </section>
      </div>
    </div>
  );
}
