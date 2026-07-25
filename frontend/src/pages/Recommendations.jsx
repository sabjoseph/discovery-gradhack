import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import LoadingBlock from "../components/LoadingBlock";

export default function Recommendations() {
  const { customer } = useCustomer();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getRecommendations(customer.id)
      .then((res) => {
        if (alive) setPayload(res);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Failed to load recommendations");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customer.id]);

  if (loading) return <LoadingBlock label="Finding what fits you…" />;
  if (error) return <div className="error-state panel">{error}</div>;

  const items = payload?.data || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>For you</h1>
          <p>
            Personalised recipe picks based on your pantry.{" "}
            {payload?.source === "pantry_match"
              ? "Live pantry-match scoring is active while the recommendations table fills up."
              : "Saved recommendations from your profile."}
          </p>
        </div>
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty-state panel">No recommendations yet.</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
                <div>
                  <span className="tag tag-healthy" style={{ marginBottom: "0.55rem" }}>
                    {item.type}
                  </span>
                  <h2 style={{ fontSize: "1.15rem" }}>
                    {item.recipe?.name || item.product?.name || "Suggestion"}
                  </h2>
                  <p style={{ color: "var(--text-muted)", marginTop: "0.45rem", lineHeight: 1.5 }}>
                    {item.reason}
                  </p>
                </div>
                {item.recipe?.id && (
                  <Link to={`/app/recipes/${item.recipe.id}`} className="btn btn-sm btn-primary">
                    View
                  </Link>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
