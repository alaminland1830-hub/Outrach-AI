import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Radar, Activity, Flame, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppLayout";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { STAGES, PlatformBadge, ScoreBadge } from "@/components/Badges";
import { api } from "@/lib/api";

export default function Dashboard() {
  const [s, setS] = useState(null);
  const nav = useNavigate();
  const load = () => api.get("/stats").then((r) => setS(r.data));
  useEffect(() => { load(); }, []);

  const by = s?.by_stage || {};
  const max = Math.max(1, ...Object.values(by));

  return (
    <div>
      <PageHeader title="Dashboard" sub="Your sales cockpit — what to do next.">
        <Button asChild variant="outline" className="rounded-full" data-testid="quick-find-leads">
          <Link to="/find"><Radar className="mr-1 h-4 w-4" /> Find leads</Link>
        </Button>
        <AddLeadDialog onCreated={(l) => nav(`/leads/${l.id}`)} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Total leads", s?.total], ["Contacted", (by.contacted || 0) + (by.replied || 0)], ["Calls booked", by.call_booked], ["Won", by.won]].map(([k, v], i) => (
          <div key={k} className="fade-up rounded-2xl border bg-white p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k}</p>
            <p data-testid={`stat-${k.toLowerCase().replace(" ", "-")}`} className="mt-2 font-mono text-4xl font-semibold">{v ?? "–"}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="rounded-2xl border bg-white p-6 lg:col-span-3">
          <h2 className="mb-5 text-base font-semibold">Pipeline</h2>
          <div className="space-y-3" data-testid="pipeline-summary">
            {STAGES.map((st) => (
              <Link to="/pipeline" key={st.id} className="group flex items-center gap-4">
                <span className="w-24 text-sm text-muted-foreground group-hover:text-foreground">{st.label}</span>
                <span className="relative h-7 flex-1 overflow-hidden rounded-md bg-zinc-100">
                  <span className="absolute inset-y-0 left-0 rounded-md bg-[#0B0B0C] transition-[width] duration-700" style={{ width: `${((by[st.id] || 0) / max) * 100}%` }} />
                </span>
                <span className="w-8 text-right font-mono text-sm font-semibold">{by[st.id] || 0}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4" /> Recent activity</h2>
          <ul className="space-y-3" data-testid="activity-list">
            {(s?.activity || []).length === 0 && <li className="text-sm text-muted-foreground">No activity yet. Add or find your first lead.</li>}
            {(s?.activity || []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span className="flex-1">{a.text}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Hottest leads</h2>
        <div className="divide-y" data-testid="hot-leads">
          {(s?.hot_leads || []).length === 0 && <p className="text-sm text-muted-foreground">Leads with the best score show up here.</p>}
          {(s?.hot_leads || []).map((l) => (
            <Link key={l.id} to={`/leads/${l.id}`} className="group flex items-center gap-4 py-3">
              <span className="flex-1 truncate font-medium">{l.name}</span>
              <PlatformBadge platform={l.platform} />
              <ScoreBadge score={l.score} />
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
