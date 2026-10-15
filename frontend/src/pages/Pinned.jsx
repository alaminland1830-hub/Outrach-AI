import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pin } from "lucide-react";
import { PageHeader, Card, Empty } from "@/components/AppLayout";
import { Avatar, StageBadge, PriorityBadge, PlatformBadge } from "@/components/Badges";
import { api } from "@/lib/api";

export default function Pinned() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/leads", { params: { pinned: true, page_size: 200, sort: "score" } }).then((r) => setRows(r.data.items)); }, []);
  return (
    <div>
      <PageHeader title="Pinned Leads" sub="Your shortlist. Pin any lead from its page." />
      {rows.length === 0 && <Card><Empty>No pinned leads yet.</Empty></Card>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="pinned-grid">
        {rows.map((l) => (
          <Link key={l.id} to={`/leads/${l.id}`} className="fade-up rounded-2xl border bg-card p-5 transition-colors hover:border-violet-400/60">
            <div className="flex items-center gap-3">
              <Avatar name={l.name} src={l.avatar} size="h-11 w-11" />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{l.name}</p><p className="truncate text-xs capitalize text-muted-foreground">{l.niche || l.company || l.platform}</p></div>
              <Pin className="h-4 w-4 fill-violet-500 text-violet-500" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><PlatformBadge platform={l.platform} /><StageBadge stage={l.stage} /><PriorityBadge priority={l.priority} /></div>
            <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{l.recommended_service || l.notes || ""}</p>
            <p className="mt-3 font-mono text-2xl font-semibold">{l.score ?? "—"}<span className="text-xs text-muted-foreground">/100</span></p>
          </Link>
        ))}
      </div>
    </div>
  );
}
