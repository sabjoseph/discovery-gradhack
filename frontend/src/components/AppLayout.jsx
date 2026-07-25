import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { initials } from "../lib/api";

const links = [
  { to: "/app", label: "Home", end: true },
  { to: "/app/pantry", label: "Pantry" },
  { to: "/app/recipes", label: "Recipes" },
  { to: "/app/purchases", label: "Purchases" },
  { to: "/app/rewards", label: "Rewards" },
  { to: "/app/profile", label: "Profile" },
];

export default function AppLayout() {
  const { customer, clearCustomer } = useCustomer();
  const navigate = useNavigate();

  function switchUser() {
    clearCustomer();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <NavLink to="/app" className="brand">
            <img src="/BiteBetter Logo.png" alt="BiteBetter" />
            <div className="brand-text">
              <strong>
                Bite<span>Better</span>
              </strong>
              <small>Smart choices</small>
            </div>
          </NavLink>

          <nav className="nav-links">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="user-chip">
            <div className="avatar">{initials(customer?.name)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                {customer?.name}
              </div>
              <button
                type="button"
                onClick={switchUser}
                className="btn btn-sm btn-outline"
                style={{ marginTop: "0.25rem", padding: "0.2rem 0.55rem" }}
              >
                Switch profile
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container page">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        {links.slice(0, 5).map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
