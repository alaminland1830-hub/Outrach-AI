import { useEffect, useState } from "react";
import { Copy, Wand2, Check, Send, Trash2, Mail, MessageSquareQuote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardTitle, Empty } from "@/components/AppLayout";
import { MESSAGE_TYPES } from "@/components/Badges";
import { api, errMsg, streamSSE } from "@/lib/api";

const TONES = ["friendly", "professional", "casual", "confident", "warm"];
const LENGTHS = ["short", "medium", "long"];
const typeLabel = (t) => MESSAGE_TYPES.find(([k]) => k === t)?.[1] || t;
const STATUS = { draft: "bg-muted text-muted-foreground", approved: "bg-teal-500/15 text-teal-700 dark:text-teal-300", sent: "bg-violet-500/15 text-violet-700 dark:text-violet-300" };

function Draft({ d, lead, onChange }) {
  const [content, setContent] = useState(d.content);
  const [subject, setSubject] = useState(d.subject || "");
  const [busy, setBusy] = useState(false);
  const dirty = content !== d.content || subject !== (d.subject || "");
  const run = async (fn, msg) => { setBusy(true); try { await fn(); if (msg) toast.success(msg); onChange(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const copy = () => { navigator.clipboard.writeText(subject ? `Subject: ${subject}\n\n${content}` : content); toast.success("Copied"); };
  const sent = d.status === "sent";

  return (
    <div data-testid={`draft-${d.id}`} className="fade-up rounded-2xl border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{typeLabel(d.type)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS[d.status]}`}>{d.status}{d.channel ? ` · ${d.channel}` : ""}</span>
        {d.portfolio?.label && <span className="text-[11px] text-muted-foreground">Portfolio: {d.portfolio.label}</span>}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
      </div>
      {(subject || d.type === "business_email") && <Input data-testid={`draft-subject-${d.id}`} disabled={sent} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="mb-2" />}
      <Textarea data-testid={`draft-content-${d.id}`} disabled={sent} rows={Math.min(10, content.split("\n").length + 2)} value={content} onChange={(e) => setContent(e.target.value)} className="text-sm leading-relaxed" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-lg" data-testid={`copy-draft-${d.id}`} onClick={copy}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
        {!sent && dirty && <Button size="sm" variant="outline" className="rounded-lg" disabled={busy} data-testid={`save-draft-${d.id}`} onClick={() => run(() => api.patch(`/drafts/${d.id}`, { content, subject }), "Draft saved")}>Save edits</Button>}
        {d.status === "draft" && <Button size="sm" className="rounded-lg" disabled={busy || dirty} data-testid={`approve-draft-${d.id}`} onClick={() => run(() => api.patch(`/drafts/${d.id}`, { status: "approved" }), "Approved")}><Check className="mr-1 h-3.5 w-3.5" /> Approve</Button>}
        {d.status === "approved" && <>
          <Button size="sm" className="rounded-lg" disabled={busy} data-testid={`mark-sent-${d.id}`} onClick={() => run(() => api.post(`/drafts/${d.id}/sent`, { channel: d.type.includes("email") ? "email" : d.type.includes("linkedin") ? "linkedin" : "dm" }), "Marked as sent — follow-up scheduled")}><Send className="mr-1 h-3.5 w-3.5" /> I sent it</Button>
          {lead.email && (d.type === "business_email" || d.type === "follow_up" || subject) && <Button size="sm" variant="outline" className="rounded-lg" disabled={busy} data-testid={`send-gmail-${d.id}`} onClick={() => window.confirm(`Send this email to ${lead.email} via your connected Gmail?`) && run(() => api.post(`/drafts/${d.id}/send-gmail`), "Sent via Gmail")}><Mail className="mr-1 h-3.5 w-3.5" /> Send via Gmail</Button>}
        </>}
        {!sent && <Button size="sm" variant="ghost" className="ml-auto rounded-lg text-rose-600" data-testid={`delete-draft-${d.id}`} onClick={() => run(() => api.delete(`/drafts/${d.id}`))}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  );
}

function ReplyExplainer({ lead, onChange }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const replies = [...(lead.replies || [])].reverse();
  const go = async () => {
    setBusy(true);
    try { await api.post(`/leads/${lead.id}/reply-explain`, { text }); setText(""); onChange(); toast.success("Reply recorded and explained"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardTitle icon={MessageSquareQuote}>Client reply explainer</CardTitle>
      <Textarea data-testid="reply-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the client's reply here…" />
      <Button data-testid="explain-reply-btn" className="mt-2 rounded-xl" disabled={busy || !text.trim()} onClick={go}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Explain & suggest reply</Button>
      <div className="mt-4 space-y-3" data-testid="replies-list">
        {replies.map((r, i) => (
          <div key={i} className="rounded-xl border p-3 text-sm">
            <p className="text-xs text-muted-foreground">“{r.text}”</p>
            <p className="mt-2"><span className="mr-2 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-violet-700 dark:text-violet-300">{r.intent}</span>{r.explanation}</p>
            {r.key_points?.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{r.key_points.map((k, j) => <li key={j}>{k}</li>)}</ul>}
            {r.next_step && <p className="mt-1 text-xs"><span className="font-semibold">Next:</span> {r.next_step}</p>}
            <div className="mt-2 rounded-lg bg-muted p-2.5"><p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Suggested reply (English)</p><p className="whitespace-pre-wrap">{r.suggested_reply}</p></div>
            <Button size="sm" variant="outline" className="mt-2 rounded-lg" onClick={() => { navigator.clipboard.writeText(r.suggested_reply); toast.success("Copied"); }}><Copy className="mr-1 h-3.5 w-3.5" /> Copy reply</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function MessagesTab({ lead, onChange }) {
  const [drafts, setDrafts] = useState([]);
  const [type, setType] = useState(lead.follow_up_at && lead.last_contact_at ? "follow_up" : lead.platform === "linkedin" ? "linkedin_message" : "instagram_dm");
  const [tone, setTone] = useState("friendly");
  const [length, setLength] = useState("short");
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/leads/${lead.id}/drafts`).then((r) => setDrafts(r.data));
  useEffect(() => { load(); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { load(); onChange(); };

  const gen = async () => {
    setBusy(true); setLive("");
    try { await streamSSE(`/leads/${lead.id}/drafts/generate`, { type, tone, length }, { onText: setLive }); refresh(); toast.success("Draft ready — review and approve"); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); setLive(""); }
  };

  if (lead.do_not_contact) return <Card><Empty>This lead is on your Do Not Contact list. Outreach is disabled.</Empty></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger data-testid="message-type-select" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{MESSAGE_TYPES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger data-testid="message-tone-select" className="w-36 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger data-testid="message-length-select" className="w-28 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>{LENGTHS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button data-testid="generate-message-btn" onClick={gen} disabled={busy} className="ml-auto rounded-xl"><Wand2 className="mr-1.5 h-4 w-4" /> {busy ? "Writing…" : "Generate"}</Button>
        </Card>
        {!lead.analysis && <p className="text-xs text-muted-foreground">Tip: run AI Analyze first — messages use the analysis for a specific, honest angle.</p>}
        <p className="text-xs text-muted-foreground">Nothing is sent automatically: draft → approve → send yourself (or via connected Gmail) → mark as sent.</p>
        {busy && <Card><p className="caret whitespace-pre-wrap text-sm" data-testid="message-stream">{live}</p></Card>}
        <div className="space-y-3" data-testid="drafts-list">
          {drafts.map((d) => <Draft key={d.id + d.status} d={d} lead={lead} onChange={refresh} />)}
          {!drafts.length && !busy && <Card><Empty>No messages yet.</Empty></Card>}
        </div>
      </div>
      <ReplyExplainer lead={lead} onChange={onChange} />
    </div>
  );
}
