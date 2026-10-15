import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/AppLayout";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { PLATFORMS, STAGES, PlatformBadge, StageBadge, ScoreBadge, fmt } from "@/components/Badges";
import { api } from "@/lib/api";

export default function Leads() {
  const nav = useNavigate();
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [stage, setStage] = useState("all");
  const [minScore, setMinScore] = useState("0");

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/leads", { params: { q, platform: platform === "all" ? "" : platform, stage: stage === "all" ? "" : stage, min_score: minScore } })
        .then((r) => setLeads(r.data));
    }, 200);
    return () => clearTimeout(t);
  }, [q, platform, stage, minScore]);

  return (
    <div>
      <PageHeader title="Leads" sub={`${leads.length} leads`}>
        <AddLeadDialog onCreated={(l) => nav(`/leads/${l.id}`)} />
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="leads-search-input" className="bg-white pl-9" placeholder="Search name, handle, bio, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger data-testid="leads-platform-filter" className="bg-white sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All platforms</SelectItem>{PLATFORMS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger data-testid="leads-stage-filter" className="bg-white sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={minScore} onValueChange={setMinScore}>
          <SelectTrigger data-testid="leads-score-filter" className="bg-white sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{["0", "30", "60"].map((v) => <SelectItem key={v} value={v}>{v === "0" ? "Any score" : `Score ${v}+`}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="leads-table">
          <TableHeader>
            <TableRow><TableHead>Lead</TableHead><TableHead>Platform</TableHead><TableHead>Followers</TableHead><TableHead>Stage</TableHead><TableHead>Score</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No leads match. Add one or run a scrape in Find Leads.</TableCell></TableRow>
            )}
            {leads.map((l) => (
              <TableRow key={l.id} data-testid={`lead-row-${l.id}`} onClick={() => nav(`/leads/${l.id}`)} className="cursor-pointer transition-colors">
                <TableCell>
                  <p className="font-medium">{l.name}</p>
                  {l.handle && <p className="font-mono text-xs text-muted-foreground">@{l.handle}</p>}
                </TableCell>
                <TableCell><PlatformBadge platform={l.platform} /></TableCell>
                <TableCell className="font-mono text-sm">{fmt(l.followers)}</TableCell>
                <TableCell><StageBadge stage={l.stage} /></TableCell>
                <TableCell><ScoreBadge score={l.score} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
