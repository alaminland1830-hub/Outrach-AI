import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Download, Pin, ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppLayout";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { PLATFORMS, STAGES, PlatformBadge, StageBadge, ScoreBadge, PriorityBadge, Avatar, fmtDate } from "@/components/Badges";
import { api, download, streamSSE } from "@/lib/api";

const Filter = ({ value, onChange, options, all, testId, w = "sm:w-40" }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger data-testid={testId} className={`bg-card ${w}`}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="all">{all}</SelectItem>{options.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
  </Select>
);

export default function Leads() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [stage, setStage] = useState(params.get("stage") || "all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState({});
  const [bulk, setBulk] = useState("");
  const size = 25;

  const filters = () => ({ q, platform: platform === "all" ? "" : platform, stage: stage === "all" ? "" : stage, priority: priority === "all" ? "" : priority });
  const load = () => api.get("/leads", { params: { ...filters(), sort, page, page_size: size } }).then((r) => setData(r.data));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, platform, stage, priority, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPage(1), [q, platform, stage, priority, sort]);

  const exportCsv = () => download(`/leads/export.csv?${new URLSearchParams(filters())}`, "leads.csv").then(() => toast.success("CSV exported"));
  const chosen = data.items.filter((l) => sel[l.id]);
  const analyzeSelected = async () => {
    for (const [i, l] of chosen.entries()) {
      setBulk(`Analyzing ${i + 1}/${chosen.length}: ${l.name}`);
      try { await streamSSE(`/leads/${l.id}/analyze`, {}); } catch (e) { toast.error(`${l.name}: ${e.message}`); }
    }
    setBulk(""); setSel({}); load(); toast.success("Bulk analysis finished");
  };
  const pages = Math.max(1, Math.ceil(data.total / size));

  return (
    <div>
      <PageHeader title="Leads" sub={`${data.total} leads in your workspace`}>
        <Button data-testid="export-csv-btn" variant="outline" className="rounded-xl" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        <NewLeadDialog onCreated={load} />
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="leads-search-input" className="bg-card pl-9" placeholder="Search leads, niche, platform…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Filter testId="leads-platform-filter" value={platform} onChange={setPlatform} all="All platforms" options={PLATFORMS.map((p) => [p.id, p.label])} />
        <Filter testId="leads-stage-filter" value={stage} onChange={setStage} all="All stages" options={STAGES.map((s) => [s.id, s.label])} />
        <Filter testId="leads-priority-filter" value={priority} onChange={setPriority} all="Any priority" options={[["high", "High"], ["medium", "Medium"], ["low", "Low"], ["reject", "Review / reject"], ["unscored", "Not scored"]]} w="sm:w-36" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger data-testid="leads-sort" className="bg-card sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{[["updated", "Recently updated"], ["score", "Highest score"], ["newest", "Newest"], ["name", "Name"], ["follow_up", "Follow-up date"]].map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {chosen.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-2 text-sm">
          <span>{chosen.length} selected</span>
          <Button data-testid="bulk-analyze-btn" size="sm" className="rounded-lg" disabled={!!bulk} onClick={analyzeSelected}>
            {bulk ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} {bulk || "AI analyze selected"}
          </Button>
        </div>
      )}

      <div className="space-y-2" data-testid="leads-list">
        {data.items.length === 0 && <div className="rounded-2xl border bg-card py-14 text-center text-sm text-muted-foreground">No leads match. Add one or run discovery in Find Leads.</div>}
        {data.items.map((l) => (
          <div key={l.id} data-testid={`lead-row-${l.id}`} onClick={() => nav(`/leads/${l.id}`)}
            className="group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:border-violet-400/60">
            <span onClick={(e) => e.stopPropagation()}><Checkbox data-testid={`lead-select-${l.id}`} checked={!!sel[l.id]} onCheckedChange={(v) => setSel({ ...sel, [l.id]: !!v })} /></span>
            <Avatar name={l.name} src={l.avatar} />
            <div className="min-w-[180px] flex-1">
              <p className="flex items-center gap-1.5 font-medium">{l.name} {l.pinned && <Pin className="h-3 w-3 fill-violet-500 text-violet-500" />}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{[l.company, l.niche || l.niche_hint].filter(Boolean).join(" · ") || (l.handle ? `@${l.handle}` : "—")}</p>
            </div>
            <PlatformBadge platform={l.platform} />
            <PriorityBadge priority={l.priority} />
            <ScoreBadge score={l.score} />
            <StageBadge stage={l.stage} />
            <span className="w-16 text-right font-mono text-[11px] text-muted-foreground" title="Follow-up">{l.follow_up_at ? fmtDate(l.follow_up_at) : ""}</span>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button data-testid="page-prev" size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-mono text-xs">{page} / {pages}</span>
          <Button data-testid="page-next" size="icon" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
