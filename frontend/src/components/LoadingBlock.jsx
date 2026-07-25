export default function LoadingBlock({ label = "Loading..." }) {
  return (
    <div className="loading-state panel">
      <div className="skeleton" style={{ width: "40%", margin: "0 auto 1rem" }} />
      <div className="skeleton" style={{ width: "70%", margin: "0 auto 0.5rem" }} />
      <div className="skeleton" style={{ width: "55%", margin: "0 auto" }} />
      <p style={{ marginTop: "1rem" }}>{label}</p>
    </div>
  );
}
