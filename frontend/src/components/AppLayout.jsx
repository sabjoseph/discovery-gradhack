import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";
import { initials } from "../lib/api";

const links = [
  { to: "/app", label: "Home", end: true },
  { to: "/app/pantry", label: "Pantry" },
  { to: "/app/recipes", label: "Recipes" },
  { to: "/app/recommendations", label: "For you" },
  { to: "/app/purchases", label: "Purchases" },
  { to: "/app/rewards", label: "Rewards" },
  { to: "/app/analytics", label: "Analytics" },
];

export default function AppLayout() {
  const { customer, clearCustomer } = useCustomer();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function signOut() {
    setMenuOpen(false);
    clearCustomer();
    navigate("/");
  }

  function goToProfile() {
    setMenuOpen(false);
    navigate("/app/profile");
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

          <div className="user-menu" ref={menuRef}>
            <button
              type="button"
              className={`avatar avatar-btn${menuOpen ? " is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {initials(customer?.name)}
            </button>

            {menuOpen && (
              <div className="user-dropdown" role="menu">
                <div className="user-dropdown-head">
                  <div className="avatar avatar-sm">{initials(customer?.name)}</div>
                  <div>
                    <strong>{customer?.name}</strong>
                    <span>Signed in</span>
                  </div>
                </div>

                <div className="user-dropdown-actions">
                  <button
                    type="button"
                    role="menuitem"
                    className="user-dropdown-item"
                    onClick={goToProfile}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="user-dropdown-item is-danger"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
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
