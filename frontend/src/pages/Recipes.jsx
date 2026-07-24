import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Recipes() {
  const { customer } = useCustomer();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) return <LoadingBlock label="Matching recipes to your pantry…" />;
  if (error) return <div className="error-state panel">{error}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Recipes</h1>
          <p>
            Ten real Discovery Vitality catalogue recipes, ranked by how much of
            your current pantry already covers the ingredients.
          </p>
        </div>
      </div>

      <div className="grid-2">
        {recipes.map((recipe) => (
          <Link key={recipe.id} to={`/app/recipes/${recipe.id}`} className="panel" style={{ transition: "transform 0.15s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.65rem" }}>
              <h2 style={{ fontSize: "1.1rem", lineHeight: 1.3 }}>{recipe.name}</h2>
              <span className="tag tag-healthy">{recipe.matchPercent}%</span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.45 }}>
              {recipe.matchCount}/{recipe.totalIngredients} ingredients on hand ·{" "}
              {recipe.prepTimeMinutes} min · serves {recipe.servings}
            </p>
            <div className="progress-track" style={{ marginTop: "0.9rem" }}>
              <div className="progress-seg healthy" style={{ width: `${recipe.matchPercent}%` }} />
            </div>
            <p style={{ marginTop: "0.7rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {recipe.source}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
