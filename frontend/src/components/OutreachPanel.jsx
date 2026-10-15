import { useState } from "react";
import { Copy, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Markdown } from "@/components/Markdown";
import { streamSSE } from "@/lib/api";

const TONES = ["friendly", "professional", "casual", "bold", "witty"];
const LENGTHS = ["short", "medium", "long"];
const SECTIONS = [["dm", "DM"], ["email", "Cold email"], ["followup", "Follow-up"]];

const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

export function OutreachPanel({ lead, onDone, onContacted }) {
  const saved = lead.outreach || {};
  const [tone, setTone] = useState(saved.tone || "friendly");
  const [length, setLength] = useState(saved.length || "short");
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setLive("");
    try {
      await streamSSE(`/leads/${lead.id}/outreach`, { tone, length }, setLive);
      await onDone();
      setLive("");
      toast.success("Outreach ready");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-4">
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger data-testid="outreach-tone-select" className="w-36 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={length} onValueChange={setLength}>
          <SelectTrigger data-testid="outreach-length-select" className="w-32 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>{LENGTHS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
        </Select>
        <Button data-testid="generate-outreach-btn" onClick={run} disabled={busy} className="ml-auto rounded-full">
          <Wand2 className="mr-1 h-4 w-4" /> {busy ? "Writing…" : saved.dm ? "Regenerate" : "Generate outreach"}
        </Button>
      </div>
      {!lead.analysis && <p className="text-xs text-muted-foreground">Tip: run Deep analysis first for sharper, more personal messages.</p>}

      {busy && <div className="rounded-2xl border bg-white p-6"><Markdown testId="outreach-stream" text={live} streaming /></div>}

      {!busy && SECTIONS.map(([k, label]) => saved[k] && (
        <div key={k} className="fade-up rounded-2xl border bg-white p-5" data-testid={`outreach-${k}`}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <Button data-testid={`copy-${k}-btn`} size="sm" variant="outline" className="rounded-full" onClick={() => copy(saved[k])}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{saved[k]}</p>
        </div>
      ))}
      {!busy && saved.dm && lead.stage !== "contacted" && (
        <Button data-testid="mark-contacted-btn" variant="outline" className="rounded-full" onClick={onContacted}><Send className="mr-1 h-4 w-4" /> I sent it — mark as Contacted</Button>
      )}
      {!busy && !saved.dm && <p className="py-8 text-center text-sm text-muted-foreground">Generate a DM, cold email and follow-up written for this lead.</p>}
    </div>
  );
}
