import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Radar, KanbanSquare, Settings, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/find", label: "Find Leads", icon: Radar },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const Logo = ({ light }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 shadow-[0_0_24px_rgba(99,102,241,.5)]">
      <Sparkles className="h-4 w-4 text-white" />
    </span>
    <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : ""}`}>OUTREACH.AI</span>
  </div>
);

export function AppLayout({ children }) {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="noise relative flex shrink-0 flex-col bg-[#0B0B0C] text-zinc-300 md:sticky md:top-0 md:h-screen md:w-60">
        <div className="glow-orb pointer-events-none absolute inset-0" />
        <div className="relative px-5 py-5"><Logo light /></div>
        <nav className="relative flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
              className={({ isActive }) => `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="relative mt-auto hidden border-t border-white/10 p-4 md:block">
          <p className="truncate text-sm font-medium text-white" data-testid="current-user-name">{user?.name}</p>
          <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          <button data-testid="logout-btn" onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">{children}</main>
    </div>
  );
}

export const PageHeader = ({ title, sub, children }) => (
  <div className="fade-up mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);
