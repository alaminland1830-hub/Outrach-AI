import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Microscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { STAGES, PlatformBadge, ScoreBadge, fmt } from "@/components/Badges";
import { OutreachPanel } from "@/components/OutreachPanel";
import { LeadChat } from "@/components/LeadChat";
import { api, errMsg, streamSSE } from "@/lib/api";

function AnalysisPanel({ lead, onDone }) {
  const [text, setText] = useState(lead.analysis || "");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setText("");
    try {
      await streamSSE(`/leads/${lead.id}/analyze`, {}, setText);
      toast.success("Deep analysis complete");
      onDone();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Scrapes the profile (IG & X via Apify) and writes a full research report.</p>
        <Button data-testid="deep-analysis-btn" onClick={run} disabled={busy} className="shrink-0 rounded-full">
          <Microscope className="mr-1 h-4 w-4" /> {busy ? "Analysing…" : text ? "Re-run analysis" : "Deep analysis"}
        </Button>
      </div>
      {text ? <Markdown testId="analysis-report" text={text} streaming={busy} />
        : <p className="py-10 text-center text-sm text-muted-foreground">No research yet. One click and the AI does the homework.</p>}
    </div>
  );
}

function LeadSidebar({ lead, onPatch, onDelete }) {
  const [notes, setNotes] = useState(lead.notes || "");
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Stage</p>
        <Select value={lead.stage} onValueChange={(v) => onPatch({ stage: v })}>
          <SelectTrigger data-testid="lead-stage-select"><SelectValue /></SelectTrigger>
          <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <dl className="mt-5 space-y-3 text-sm">
          {[["Followers", fmt(lead.followers)], ["Posts", lead.posts ? fmt(lead.posts) : "–"], ["Website", lead.website || "–"],
            ["Contact", lead.contact ? `${lead.contact} (unverified)` : "–"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right font-medium">{v}</dd></div>
          ))}
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Score</dt><dd><ScoreBadge score={lead.score} /></dd></div>
        </dl>
        {lead.bio && <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{lead.bio}</p>}
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
        <Textarea data-testid="lead-notes-edit" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (lead.notes || "") && onPatch({ notes })} placeholder="Anything the AI should know…" />
      </div>
      <Button data-testid="delete-lead-btn" variant="ghost" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
        <Trash2 className="mr-1 h-4 w-4" /> Delete lead
      </Button>
    </aside>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lead, setLead] = useState(null);
  const load = () => api.get(`/leads/${id}`).then((r) => setLead(r.data)).catch(() => nav("/leads"));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (body) => {
    try {
      const { data } = await api.patch(`/leads/${id}`, body);
      setLead(data);
      toast.success("Saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this lead and its memory?")) return;
    await api.delete(`/leads/${id}`);
    nav("/leads");
  };

  if (!lead) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <button onClick={() => nav("/leads")} data-testid="back-to-leads" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Leads
      </button>
      <div className="fade-up mb-8 flex flex-wrap items-center gap-4">
        {lead.avatar && <img src={lead.avatar} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover" />}
        <div className="min-w-0">
          <h1 data-testid="lead-title" className="truncate text-3xl font-bold tracking-tight sm:text-4xl">{lead.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <PlatformBadge platform={lead.platform} />
            {lead.handle && <span className="font-mono">@{lead.handle}</span>}
            {lead.url && <a href={lead.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Open <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Tabs defaultValue="research" className="min-w-0">
          <TabsList className="mb-4">
            <TabsTrigger data-testid="tab-research" value="research">Research</TabsTrigger>
            <TabsTrigger data-testid="tab-outreach" value="outreach">Outreach</TabsTrigger>
            <TabsTrigger data-testid="tab-memory" value="memory">AI Memory</TabsTrigger>
          </TabsList>
          <TabsContent value="research"><AnalysisPanel lead={lead} onDone={load} /></TabsContent>
          <TabsContent value="outreach"><OutreachPanel lead={lead} onDone={load} onContacted={() => patch({ stage: "contacted" })} /></TabsContent>
          <TabsContent value="memory"><LeadChat lead={lead} /></TabsContent>
        </Tabs>
        <LeadSidebar key={lead.id + lead.updated_at} lead={lead} onPatch={patch} onDelete={remove} />
      </div>
    </div>
  );
}
