import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Card, Empty } from "@/components/AppLayout";
import { Avatar, StageBadge, fmtDate } from "@/components/Badges";
import { api, errMsg } from "@/lib/api";

const BUCKETS = [["overdue", "Overdue", "text-rose-600"], ["today", "Due today", "text-amber-600"], ["upcoming", "Upcoming", "text-muted-foreground"]];

export default function FollowUps() {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/followups").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const act = async (id, body, msg) => { try { await api.post(`/leads/${id}/followup`, body); toast.success(msg); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div>
      <PageHeader title="Follow-Ups" sub="Scheduled automatically when you mark a message as sent. Replies clear them." />
      {rows.length === 0 && <Card><Empty>No pending follow-ups.</Empty></Card>}
      <div className="space-y-6">
        {BUCKETS.map(([b, label, color]) => {
          const list = rows.filter((r) => r.bucket === b);
          if (!list.length) return null;
          return (
            <div key={b} data-testid={`followups-${b}`}>
              <p className={`mb-2 flex items-center gap-2 text-sm font-semibold ${color}`}><CalendarClock className="h-4 w-4" /> {label} · {list.length}</p>
              <div className="space-y-2">
                {list.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                    <Avatar name={l.name} src={l.avatar} />
                    <Link to={`/leads/${l.id}`} className="min-w-[160px] flex-1"><p className="font-medium hover:underline">{l.name}</p><p className="text-xs text-muted-foreground">Follow-up #{(l.follow_up_count || 0) + 1} · last contact {fmtDate(l.last_contact_at)}</p></Link>
                    <StageBadge stage={l.stage} />
                    <span className="font-mono text-xs">{fmtDate(l.follow_up_at)}</span>
                    <Button asChild size="sm" className="rounded-lg" data-testid={`write-followup-${l.id}`}><Link to={`/leads/${l.id}`}>Write follow-up</Link></Button>
                    <Button size="sm" variant="outline" className="rounded-lg" data-testid={`snooze-${l.id}`} onClick={() => act(l.id, { action: "snooze", days: 2 }, "Snoozed 2 days")}><Clock className="mr-1 h-3.5 w-3.5" /> +2d</Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" data-testid={`done-${l.id}`} onClick={() => act(l.id, { action: "done" }, "Follow-up cleared")}><Check className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
