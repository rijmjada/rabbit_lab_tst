import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  color: string;
  end?: boolean;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ to: "/", label: "Inicio", end: true, icon: "🏠", color: "#64748b" }],
  },
  {
    label: "Tipos de Exchange",
    items: [
      { to: "/fanout", label: "Fanout", icon: "🔀", color: MODULE_ACCENTS.fanout },
      { to: "/direct", label: "Direct", icon: "🎯", color: MODULE_ACCENTS.direct },
      { to: "/topic", label: "Topic", icon: "🌐", color: MODULE_ACCENTS.topic },
      { to: "/headers", label: "Headers", icon: "🏷️", color: MODULE_ACCENTS.headers },
      { to: "/default", label: "Default Exchange", icon: "📦", color: MODULE_ACCENTS.default },
    ],
  },
  {
    // Estos tres no son "más tipos de exchange": son patrones que combinan
    // los tipos de arriba para resolver otro problema (reenvío entre
    // exchanges, fallback, mensajes rechazados) — van en su propio grupo.
    label: "Patrones y arquitecturas",
    items: [
      { to: "/exchange-to-exchange", label: "Exchange ↔ Exchange", icon: "🔗", color: MODULE_ACCENTS.bridge },
      { to: "/alternate-exchange", label: "Alternate Exchange", icon: "🛟", color: MODULE_ACCENTS.alternate },
      { to: "/dead-letter", label: "Dead Letter Exchange", icon: "💀", color: MODULE_ACCENTS.dlx },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "rabbitmq-playground:sidebar-collapsed";
const THEME_STORAGE_KEY = "rabbitmq-playground:theme";

type Theme = "light" | "dark";

/** El script inline en index.html ya fijó data-theme antes del primer render (evita flash del tema equivocado); acá solo lo leemos. */
function getInitialTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function Shell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <aside className={"app-sidebar" + (collapsed ? " collapsed" : "")}>
        <div className="app-brand">
          <div className="app-brand-mark">R</div>
          <div className="app-brand-info">
            <div className="app-brand-text">RabbitMQ Playground</div>
            <div className="app-brand-sub">Aprendé enrutando de verdad</div>
          </div>
        </div>
        <nav className="app-nav">
          {NAV_GROUPS.map((group, i) => (
            <div className="app-nav-group" key={group.label ?? `group-${i}`}>
              {group.label && <div className="app-nav-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => "app-nav-link" + (isActive ? " active" : "")}
                  style={{ "--nav-color": item.color } as React.CSSProperties}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="app-nav-icon">{item.icon}</span>
                  <span className="app-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="app-sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
      <button
        type="button"
        className="app-theme-toggle-float"
        onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
