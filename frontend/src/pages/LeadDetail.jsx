import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageSquare, Brain, ListChecks } from "lucide-react";
import { LeadHeader } from "@/components/lead/LeadHeader";
import { StatusBars } from "@/components/lead/StatusBars";
import { OverviewTab } from "@/components/lead/OverviewTab";
import { MessagesTab } from "@/components/lead/MessagesTab";
import { NotesTab } from "@/components/lead/NotesTab";
import { ChatPanel } from "@/components/ChatPanel";
import { api, errMsg, streamSSE } from "@/lib/api";

const LEAD_PROMPTS = ["What should I reply to their last message?", "Rewrite my latest DM more casual", "What price should I quote them?", "Give me 3 sample video ideas for them"];

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [lead, setLead] = useState(null);
  const [progress, setProgress] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState("overview");

  const load = () => api.get(`/leads/${id}`).then((r) => setLead(r.data)).catch(() => nav("/leads"));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = async () => {
    setAnalyzing(true);
    setProgress([]);
    try {
      const { final } = await streamSSE(`/leads/${id}/analyze`, {}, { onEvent: (ev) => setProgress((p) => [...p, ev.msg]) });
      if (final?.lead) setLead(final.lead);
      toast.success("AI analysis complete");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAnalyzing(false);
    }
  };
  useEffect(() => {
    if (params.get("analyze") && lead && !analyzing) { setParams({}, { replace: true }); analyze(); }
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (body, msg = "Saved") => {
    try { const { data } = await api.patch(`/leads/${id}`, body); setLead(data); toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const action = async (path, body, msg) => {
    try { const { data } = await api.post(`/leads/${id}/${path}`, body); setLead(data); if (msg) toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };

  if (!lead) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <button onClick={() => nav("/leads")} data-testid="back-to-leads" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Leads</button>
      <LeadHeader lead={lead} analyzing={analyzing} onAnalyze={analyze} onPin={() => action("pin", {}, lead.pinned ? "Unpinned" : "Pinned")}
        onOptOut={() => window.confirm("Mark as opted out / Do Not Contact? Unsent drafts and scraped details will be removed.") && action("opt-out", {}, "Marked Do Not Contact")}
        onDelete={async () => { if (window.confirm("Delete this lead and all its data?")) { await api.delete(`/leads/${id}`); nav("/leads"); } }} />
      <StatusBars lead={lead} onStage={(stage) => patch({ stage }, "Stage updated")} onOutcome={(key, value) => action("outcome", { key, value })} />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger data-testid="tab-overview" value="overview"><FileText className="mr-1.5 h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger data-testid="tab-messages" value="messages"><MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Messages</TabsTrigger>
          <TabsTrigger data-testid="tab-memory" value="memory"><Brain className="mr-1.5 h-3.5 w-3.5" /> AI Memory</TabsTrigger>
          <TabsTrigger data-testid="tab-notes" value="notes"><ListChecks className="mr-1.5 h-3.5 w-3.5" /> Notes & Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab lead={lead} analyzing={analyzing} progress={progress} onAnalyze={analyze} onGoMessages={() => setTab("messages")} /></TabsContent>
        <TabsContent value="messages"><MessagesTab lead={lead} onChange={load} /></TabsContent>
        <TabsContent value="memory">
          <ChatPanel messagesPath={`/leads/${id}/messages`} sendPath={`/leads/${id}/chat`} title="Remembers research, notes, drafts, replies and this chat · can use connected apps"
            placeholder={`Ask anything about ${lead.name}. Paste their reply for a suggested answer.`} prompts={LEAD_PROMPTS} testPrefix="lead-chat" />
        </TabsContent>
        <TabsContent value="notes"><NotesTab key={lead.updated_at} lead={lead} onPatch={patch} onReload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}
