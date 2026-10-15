import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, MessageSquareReply, Target, Trophy, CalendarClock, ArrowRight, Activity, Flame, Eye, PenLine, Send, Smile, PhoneCall, Briefcase } from "lucide-react";
import { PageHeader, Card, CardTitle, Empty } from "@/components/AppLayout";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { Avatar, StageBadge, PriorityBadge, fmtDate } from "@/components/Badges";
import { api } from "@/lib/api";

const Metric = ({ icon: Icon, label, value, sub, testId, i }) => (
  <Card className="fade-up" style={{ animationDelay: `${i * 50}ms` }}>
    <div className="flex items-start justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/10"><Icon className="h-4 w-4 text-violet-600 dark:text-violet-300" /></span>
    </div>
    <p data-testid={testId} className="mt-2 font-mono text-3xl font-semibold">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
  </Card>
);

const Mini = ({ icon: Icon, label, value, testId }) => (
  <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
    <Icon className="h-4 w-4 text-muted-foreground" />
    <span className="flex-1 text-xs text-muted-foreground">{label}</span>
    <span data-testid={testId} className="font-mono text-lg font-semibold">{value}</span>
  </div>
);

const Bars = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>No data yet — analyze some leads.</Empty>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3 text-sm">
          <span className="w-32 truncate capitalize text-muted-foreground">{r.name}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 left-0 rounded-full bg-violet-500 transition-[width] duration-700" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-6 text-right font-mono text-xs font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/stats").then((r) => setS(r.data)); }, []);
  const v = (k) => (s ? s[k] : "–");

  return (
    <div>
      <PageHeader title="Dashboard" sub="Your AI sales command center — real recorded activity only."><NewLeadDialog /></PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric i={0} icon={Users} label="Total leads" value={v("total")} sub={`${v("qualified")} qualified · ${v("contacted")} contacted`} testId="stat-total" />
        <Metric i={1} icon={MessageSquareReply} label="Reply rate" value={`${v("reply_rate")}%`} sub={`${v("replied")} replied of ${v("contacted")} contacted`} testId="stat-reply-rate" />
        <Metric i={2} icon={Target} label="Close rate" value={`${v("close_rate")}%`} sub={`${v("won")} hired`} testId="stat-close-rate" />
        <Metric i={3} icon={Trophy} label="Conversion" value={`${v("conversion")}%`} sub="of all leads" testId="stat-conversion" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini icon={Flame} label="High priority" value={v("high_priority")} testId="stat-high" />
        <Mini icon={Eye} label="Awaiting review" value={v("awaiting_review")} testId="stat-review" />
        <Mini icon={PenLine} label="Drafts" value={v("drafted")} testId="stat-drafted" />
        <Mini icon={Send} label="Messages sent" value={v("sent")} testId="stat-sent" />
        <Mini icon={Smile} label="Positive replies" value={v("positive")} testId="stat-positive" />
        <Mini icon={PhoneCall} label="Calls booked" value={v("calls")} testId="stat-calls" />
        <Mini icon={Briefcase} label="Clients won" value={v("won")} testId="stat-won" />
        <Mini icon={CalendarClock} label="Follow-ups due" value={v("followups_due")} testId="stat-followups" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Users} right={<Link to="/leads" data-testid="view-all-leads" className="flex items-center gap-1 text-xs font-medium text-violet-600">View all <ArrowRight className="h-3 w-3" /></Link>}>Recent Leads</CardTitle>
          {(s?.recent_leads || []).length === 0 && <Empty>No leads yet.</Empty>}
          <div className="divide-y">
            {(s?.recent_leads || []).map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:text-violet-600">
                <Avatar name={l.name} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.name}</span><span className="block truncate text-xs capitalize text-muted-foreground">{l.niche || l.platform}</span></span>
                <PriorityBadge priority={l.priority} />
                <span className="font-mono text-xs">{l.score ?? "—"}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle icon={CalendarClock} right={<Link to="/follow-ups" className="text-xs font-medium text-violet-600">All</Link>}>Follow-Ups Due</CardTitle>
          {(s?.upcoming_followups || []).length === 0 && <Empty>No pending follow-ups.</Empty>}
          <div className="divide-y">
            {(s?.upcoming_followups || []).map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 truncate font-medium">{l.name}</span>
                <StageBadge stage={l.stage} />
                <span className="font-mono text-xs text-muted-foreground">{fmtDate(l.follow_up_at)}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card><CardTitle>Leads by niche</CardTitle><Bars rows={s?.by_niche || []} /></Card>
        <Card><CardTitle>Leads by platform</CardTitle><Bars rows={s?.by_platform || []} /></Card>
      </div>

      <Card className="mt-6">
        <CardTitle icon={Activity}>Recent activity</CardTitle>
        <ul className="space-y-2.5" data-testid="activity-list">
          {(s?.activity || []).length === 0 && <Empty>No activity yet.</Empty>}
          {(s?.activity || []).map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
              <span className="flex-1">{a.text}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{fmtDate(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
