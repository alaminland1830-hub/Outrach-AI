import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Radar, KanbanSquare, CalendarClock, Pin, Bot, UserCog, BarChart3, Plug, KeyRound,
  Settings, ShieldCheck, LogOut, Sparkles, Moon, Sun,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  ["/", "Dashboard", LayoutDashboard], ["/leads", "Leads", Users], ["/find", "Find Leads", Radar], ["/pipeline", "Pipeline", KanbanSquare],
  ["/follow-ups", "Follow-Ups", CalendarClock], ["/pinned", "Pinned Leads", Pin], ["/assistant", "AI Assistant", Bot],
  ["/editor-profile", "Editor Profile", UserCog], ["/analytics", "Analytics", BarChart3], ["/connections", "Connections", Plug],
  ["/api-manager", "API Manager", KeyRound], ["/settings", "Settings", Settings],
];

export const Logo = ({ sub = true }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 shadow-[0_0_24px_rgba(124,58,237,.55)]">
      <Sparkles className="h-4 w-4 text-white" />
    </span>
    <span className="leading-tight">
      <span className="block text-[17px] font-bold tracking-tight text-white">OUTREACH.AI</span>
      {sub && <span className="block text-[10px] font-semibold tracking-[0.2em] text-zinc-500">EDITORCRM AI</span>}
    </span>
  </div>
);

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

function NavItem({ to, label, Icon }) {
  return (
    <NavLink to={to} end={to === "/"} data-testid={`nav-${slug(label)}`}
      className={({ isActive }) => `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-200 ${isActive ? "bg-violet-600 text-white shadow-[0_4px_18px_rgba(124,58,237,.35)]" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </NavLink>
  );
}

export function AppLayout({ children }) {
  const { user, signOut, theme, setTheme } = useAuth();
  const initials = (user?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="noise relative flex shrink-0 flex-col bg-[#0B0B10] md:sticky md:top-0 md:h-screen md:w-60">
        <div className="glow-orb pointer-events-none absolute inset-0" />
        <div className="relative flex items-center justify-between px-5 py-5"><Logo />
          <div className="flex gap-3 text-zinc-400 md:hidden">
            <button data-testid="night-mode-toggle-mobile" onClick={() => setTheme(theme === "night" ? "light" : "night")}>{theme === "night" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button data-testid="logout-btn-mobile" onClick={signOut}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <nav className="relative flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:pb-0">
          {NAV.map(([to, label, Icon]) => <NavItem key={to} to={to} label={label} Icon={Icon} />)}
          {user?.role === "admin" && <NavItem to="/admin" label="Admin Panel" Icon={ShieldCheck} />}
        </nav>
        <div className="relative hidden space-y-3 border-t border-white/10 p-3 md:block">
          <button data-testid="night-mode-toggle" onClick={() => setTheme(theme === "night" ? "light" : "night")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white">
            {theme === "night" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {theme === "night" ? "Light Mode" : "Night Mode"}
          </button>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-600 text-xs font-bold text-white">{initials}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white" data-testid="current-user-name">{user?.name}</p>
              <p className="truncate text-[11px] capitalize text-zinc-500">{user?.role}</p>
            </div>
            <button data-testid="logout-btn" onClick={signOut} title="Sign out" className="text-zinc-500 transition-colors hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}

export const PageHeader = ({ title, sub, children }) => (
  <div className="fade-up mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,16,24,.04)] ${className}`} {...rest}>{children}</div>
);

export const CardTitle = ({ icon: Icon, children, right }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h2 className="flex items-center gap-2 text-[15px] font-semibold">{Icon && <Icon className="h-4 w-4 text-violet-500" />} {children}</h2>
    {right}
  </div>
);

export const Empty = ({ children }) => <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
