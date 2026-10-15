import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Sparkles, MessageSquare, CalendarClock, Coins } from "lucide-react";
import { PageHeader, Card, CardTitle, Empty } from "@/components/AppLayout";
import { api } from "@/lib/api";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6", "#a855f7"];
const axis = { fontSize: 11, fill: "currentColor" };
const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 } };

const Chart = ({ title, data, children, h = 240 }) => (
  <Card><CardTitle>{title}</CardTitle>{data?.length ? <div className="text-muted-foreground" style={{ height: h }}><ResponsiveContainer>{children}</ResponsiveContainer></div> : <Empty>No data yet.</Empty>}</Card>
);

export default function Analytics() {
  const [a, setA] = useState(null);
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/analytics").then((r) => setA(r.data)); api.get("/stats").then((r) => setS(r.data)); }, []);
  if (!a || !s) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const cost = a.usage.reduce((x, u) => x + u.cost, 0);

  return (
    <div>
      <PageHeader title="Analytics" sub="Performance across leads, outreach and AI — from recorded activity only." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Reply rate", `${s.reply_rate}%`], ["Close rate", `${s.close_rate}%`], ["Conversion", `${s.conversion}%`], ["Total leads", s.total]].map(([k, v]) => (
          <Card key={k}><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p><p className="mt-2 font-mono text-3xl font-semibold" data-testid={`analytics-${k.toLowerCase().replace(" ", "-")}`}>{v}</p></Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Chart title="Pipeline distribution" data={a.pipeline}>
          <BarChart data={a.pipeline}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={axis} interval={0} angle={-30} textAnchor="end" height={60} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} /><Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Lead sources (platform)" data={a.platforms}>
          <PieChart><Pie data={a.platforms} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>{a.platforms.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart>
        </Chart>
        <Chart title="Best niches (leads · replied · won)" data={a.niches}>
          <BarChart data={a.niches}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} /><Legend />
            <Bar dataKey="leads" fill="#7c3aed" radius={[6, 6, 0, 0]} /><Bar dataKey="replied" fill="#f59e0b" radius={[6, 6, 0, 0]} /><Bar dataKey="won" fill="#10b981" radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Score distribution" data={a.scores}>
          <BarChart data={a.scores}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} /><Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Portfolio performance (messages using each link)" data={a.portfolio}>
          <BarChart data={a.portfolio}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} /><Bar dataKey="value" fill="#a855f7" radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title={`AI & scraper usage — last 14 days (est. $${cost.toFixed(3)})`} data={a.usage}>
          <LineChart data={a.usage}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="day" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip {...tip} /><Legend />
            <Line dataKey="calls" stroke="#7c3aed" strokeWidth={2} /><Line dataKey="failed" stroke="#ef4444" strokeWidth={2} /></LineChart>
        </Chart>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[[Sparkles, a.analyzed, "Leads analyzed by AI"], [MessageSquare, a.messages_total, "AI messages generated"], [CalendarClock, a.followups_total, "Leads with follow-ups sent"], [Coins, `$${cost.toFixed(3)}`, "Estimated AI cost (14d)"]].map(([Icon, v, k]) => (
          <Card key={k} className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10"><Icon className="h-5 w-5 text-violet-600 dark:text-violet-300" /></span><div><p className="font-mono text-2xl font-semibold">{v}</p><p className="text-xs text-muted-foreground">{k}</p></div></Card>
        ))}
      </div>
      {a.by_task.length > 0 && (
        <Card className="mt-6"><CardTitle>Usage by task</CardTitle>
          <div className="grid gap-2 sm:grid-cols-3">{a.by_task.map((t) => <div key={t.name} className="flex justify-between rounded-xl border px-3 py-2 text-sm"><span className="capitalize">{(t.name || "").replace("_", " ")}</span><span className="font-mono text-xs">{t.calls} calls · ${t.cost}</span></div>)}</div>
        </Card>
      )}
    </div>
  );
}
