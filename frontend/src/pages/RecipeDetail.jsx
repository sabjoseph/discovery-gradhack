import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function RecipeDetail() {
  const { id } = useParams();
  const { customer } = useCustomer();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/app/recipes" style={{ color: "var(--primary)", fontWeight: 700 }}>
            ← All recipes
          </Link>
          <h1 style={{ marginTop: "0.55rem" }}>{recipe.name}</h1>
          <p>
            {recipe.prepTimeMinutes} min · serves {recipe.servings} ·{" "}
            {recipe.matchPercent}% pantry match · {recipe.source}
          </p>
        </div>
        <div className="stat-card">
          <div className="label">You have</div>
          <div className="value">
            {recipe.matchCount}/{recipe.totalIngredients}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.85rem" }}>You have this</h2>
          {recipe.have?.length ? (
            <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recipe.have.map((ing) => (
                <li key={ing.id} style={{ display: "flex", gap: "0.55rem", alignItems: "start" }}>
                  <span style={{ color: "var(--primary)", fontWeight: 800 }}>✓</span>
                  <span>
                    {ing.name}
                    {ing.quantity != null ? ` — ${ing.quantity} ${ing.unit || ""}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Nothing matched yet — shop for the missing items below.</p>
          )}
        </section>

        <section className="panel">
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.85rem" }}>You still need</h2>
          {recipe.need?.length ? (
            <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recipe.need.map((ing) => (
                <li key={ing.id} style={{ display: "flex", gap: "0.55rem", alignItems: "start" }}>
                  <span style={{ color: "var(--unhealthy)", fontWeight: 800 }}>○</span>
                  <span>
                    {ing.name}
                    {ing.quantity != null ? ` — ${ing.quantity} ${ing.unit || ""}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--primary)", fontWeight: 700 }}>
              You have everything — cook tonight.
            </p>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Method</h2>
        <p style={{ lineHeight: 1.7, color: "var(--text)" }}>{recipe.instructions}</p>
      </section>
    </>
  );
}
