import { useEffect, useState } from "react";
import { ShieldCheck, Database, Activity, ClipboardList, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardTitle, Empty } from "@/components/AppLayout";
import { Markdown } from "@/components/Markdown";
import { fmt } from "@/components/Badges";
import { api, errMsg } from "@/lib/api";

const FIELDS = [["company", "Company / brand"], ["website", "Website"], ["profile_url", "Profile URL"], ["handle", "Handle"], ["email", "Public business email"],
  ["contact_method", "Contact method"], ["country", "Country"], ["timezone", "Timezone"], ["niche", "Niche"]];

function DataQuality({ lead, onReload }) {
  const [busy, setBusy] = useState(false);
  const dq = lead.data_quality;
  const run = async () => { setBusy(true); try { await api.post(`/leads/${lead.id}/data-quality`); onReload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Card>
      <CardTitle icon={ShieldCheck} right={<Button size="sm" variant="outline" className="rounded-lg" data-testid="data-quality-btn" disabled={busy} onClick={run}>{busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Check</Button>}>Data quality & duplicates</CardTitle>
      {!dq ? <p className="text-sm text-muted-foreground">Checks for missing or inconsistent fields and possible duplicates (never auto-merged).</p> : (
        <div className="space-y-2 text-sm" data-testid="data-quality-result">
          <p>Verdict: <span className="font-semibold capitalize">{dq.verdict.replace("_", " ")}</span></p>
          {dq.issues?.length > 0 && <ul className="list-disc pl-5 text-xs">{dq.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {dq.missing?.length > 0 && <p className="text-xs text-muted-foreground">Missing: {dq.missing.join(", ")}</p>}
          {dq.possible_duplicates?.map((p) => <p key={p.lead_id} className="text-xs">Possible duplicate: <a className="text-violet-600 underline" href={`/leads/${p.lead_id}`}>{p.name}</a> — {p.reasons.join(", ")}</p>)}
          {dq.duplicate_assessment && <p className="text-xs text-muted-foreground">{dq.duplicate_assessment}</p>}
        </div>
      )}
    </Card>
  );
}

export function NotesTab({ lead, onPatch, onReload }) {
  const [f, setF] = useState(() => Object.fromEntries([...FIELDS.map(([k]) => [k, lead[k] || ""]), ["notes", lead.notes || ""], ["manual_observations", lead.manual_observations || ""],
    ["transcript", lead.transcript || ""], ["video_urls", (lead.video_urls || []).join(" ")], ["contact_verified", lead.contact_verified || "none"]]));
  const [acts, setActs] = useState([]);
  const [fu, setFu] = useState(lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : "");
  useEffect(() => { api.get(`/leads/${lead.id}/activity`).then((r) => setActs(r.data)); }, [lead.id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => onPatch({ ...f, video_urls: f.video_urls.split(/[\s,]+/).filter(Boolean) }, "Details saved");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle icon={ClipboardList}>Lead details</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, label]) => <div key={k} className="space-y-1"><Label className="text-xs">{label}</Label><Input data-testid={`detail-${k}`} value={f[k]} onChange={set(k)} /></div>)}
          <div className="space-y-1"><Label className="text-xs">Contact verification</Label>
            <Select value={f.contact_verified} onValueChange={(v) => setF({ ...f, contact_verified: v })}>
              <SelectTrigger data-testid="detail-contact-verified"><SelectValue /></SelectTrigger>
              <SelectContent>{["verified", "unverified", "none"].map((v) => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Video links</Label><Input data-testid="detail-video-urls" value={f.video_urls} onChange={set("video_urls")} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Your observations about their videos</Label><Textarea data-testid="detail-observations" rows={2} value={f.manual_observations} onChange={set("manual_observations")} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Transcript (paste, optional — lets the AI analyze the actual video text)</Label><Textarea data-testid="detail-transcript" rows={3} value={f.transcript} onChange={set("transcript")} /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Notes</Label><Textarea data-testid="lead-notes-edit" rows={3} value={f.notes} onChange={set("notes")} /></div>
        </div>
        <Button data-testid="save-details-btn" className="mt-4 rounded-xl" onClick={save}>Save details</Button>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle icon={CalendarClock}>Follow-up date</CardTitle>
          <div className="flex gap-2">
            <Input data-testid="follow-up-date" type="date" value={fu} onChange={(e) => setFu(e.target.value)} />
            <Button data-testid="set-follow-up-btn" variant="outline" className="rounded-lg" disabled={!fu} onClick={() => onPatch({ follow_up_at: new Date(fu).toISOString() }, "Follow-up set")}>Set</Button>
          </div>
        </Card>
        <DataQuality lead={lead} onReload={onReload} />
        <Card>
          <CardTitle icon={Database}>Evidence sources & compliance</CardTitle>
          <div className="space-y-2" data-testid="sources-list">
            {(lead.sources || []).map((s, i) => (
              <div key={i} className="rounded-xl border p-3 text-xs">
                <p className="font-semibold capitalize">{s.source} · <span className="font-normal text-muted-foreground">{s.method}</span></p>
                <p className="mt-1 text-muted-foreground">Checked {String(s.checked_at).slice(0, 10)} · Limits: {s.access_limits} · Allowed use: {s.allowed_usage} · {s.contact_restrictions}</p>
                {s.fields?.length > 0 && <p className="mt-1">Fields: {s.fields.join(", ")}</p>}
                {s.note && <p className="mt-1 text-muted-foreground">{s.note}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Followers: {fmt(lead.followers)} · Discovered {String(lead.discovered_at).slice(0, 10)} · Last verified {lead.last_verified_at ? String(lead.last_verified_at).slice(0, 10) : "never"} · Opt-out: {lead.opt_out ? "yes" : "no"}</p>
        </Card>
        <Card>
          <CardTitle icon={Activity}>Activity</CardTitle>
          {acts.length === 0 && <Empty>No activity yet.</Empty>}
          <ul className="space-y-2" data-testid="lead-activity">
            {acts.map((a) => <li key={a.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><span className="flex-1">{a.text}</span><span className="font-mono text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span></li>)}
          </ul>
        </Card>
        {lead.legacy_analysis && <Card><CardTitle>Earlier free-text report (v1)</CardTitle><Markdown text={lead.legacy_analysis} /></Card>}
      </div>
    </div>
  );
}
