import { useEffect, useState } from "react";
import { Languages, Bot, Gauge, CalendarClock, ShieldAlert, Sun, Moon, Save, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Card, CardTitle } from "@/components/AppLayout";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

const Num = ({ label, value, onChange, testId }) => (
  <div className="space-y-1.5"><Label className="text-xs">{label}</Label><Input data-testid={testId} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>
);

export default function Settings() {
  const { user, theme, setTheme } = useAuth();
  const [s, setS] = useState(null);
  const [keys, setKeys] = useState([]);
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); api.get("/keys").then((r) => setKeys(r.data.keys.filter((k) => k.kind === "llm"))); }, []);
  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const save = async (body, msg = "Saved") => { try { setS((await api.put("/settings", body)).data); toast.success(msg); } catch (e) { toast.error(errMsg(e)); } };
  const up = (k, v) => setS({ ...s, [k]: v });
  const options = (
    <SelectContent>
      <SelectGroup><SelectLabel>Built-in (Universal Key, no setup)</SelectLabel>{s.builtin_models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectGroup>
      {keys.length > 0 && <SelectGroup><SelectLabel>Your keys (API Manager)</SelectLabel>{keys.map((k) => <SelectItem key={k.id} value={`key:${k.id}:${k.model || ""}`}>{k.provider} {k.label && `· ${k.label}`} ({k.model || "default model"})</SelectItem>)}</SelectGroup>}
    </SelectContent>
  );

  return (
    <div>
      <PageHeader title="Settings" sub="Workspace preferences" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardTitle icon={Languages}>Language & AI</CardTitle>
            <Label className="text-xs">Client Message Explanation Language</Label>
            <Select value={s.language} onValueChange={(v) => up("language", v)}>
              <SelectTrigger data-testid="language-select" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{s.languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">Used when the AI explains client messages. Outreach always stays in English.</p>
            <Button data-testid="save-language-btn" className="mt-4 rounded-xl" onClick={() => save({ language: s.language }, "Language saved")}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          </Card>
          <Card>
            <CardTitle icon={Bot}>AI model per task</CardTitle>
            <div className="space-y-3">
              {Object.entries(s.tasks).map(([t, label]) => (
                <div key={t} className="grid items-center gap-2 sm:grid-cols-[190px_1fr]">
                  <Label className="text-xs">{label}</Label>
                  <Select value={s.models[t]} onValueChange={(v) => setS({ ...s, models: { ...s.models, [t]: v } })}>
                    <SelectTrigger data-testid={`model-select-${t}`}><SelectValue /></SelectTrigger>{options}
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-center justify-between text-sm">Automatic failover to other keys <Switch data-testid="failover-switch" checked={s.failover} onCheckedChange={(v) => up("failover", v)} /></label>
              <label className="flex items-center justify-between text-sm">Fall back to built-in Universal Key <Switch data-testid="builtin-fallback-switch" checked={s.builtin_fallback} onCheckedChange={(v) => up("builtin_fallback", v)} /></label>
            </div>
            <Button data-testid="save-models-btn" className="mt-4 rounded-xl" onClick={() => save({ models: s.models, failover: s.failover, builtin_fallback: s.builtin_fallback }, "AI settings saved")}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          </Card>
          <Card>
            <CardTitle icon={Gauge}>Lead score thresholds</CardTitle>
            <div className="grid grid-cols-3 gap-3">
              <Num testId="threshold-high" label="High priority ≥" value={s.thresholds.high} onChange={(v) => up("thresholds", { ...s.thresholds, high: v })} />
              <Num testId="threshold-medium" label="Medium ≥" value={s.thresholds.medium} onChange={(v) => up("thresholds", { ...s.thresholds, medium: v })} />
              <Num testId="threshold-low" label="Low ≥" value={s.thresholds.low} onChange={(v) => up("thresholds", { ...s.thresholds, low: v })} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Below Low = review / usually reject. Medium and above count as Qualified. Applies to new analyses.</p>
            <Button data-testid="save-thresholds-btn" className="mt-4 rounded-xl" onClick={() => save({ thresholds: s.thresholds }, "Thresholds saved")}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>Appearance</CardTitle>
            <div className="grid grid-cols-2 gap-2">
              {[["light", "Light", Sun], ["night", "Night", Moon]].map(([k, l, Icon]) => (
                <button key={k} data-testid={`theme-${k}`} onClick={() => setTheme(k)} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-colors ${theme === k ? "border-violet-600 bg-violet-600 text-white" : "hover:bg-muted"}`}><Icon className="h-4 w-4" /> {l}</button>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle icon={CalendarClock}>Follow-ups</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <Num testId="follow-up-days" label="Days until follow-up" value={s.follow_up_days} onChange={(v) => up("follow_up_days", v)} />
              <Num testId="max-follow-ups" label="Max follow-ups per lead" value={s.max_follow_ups} onChange={(v) => up("max_follow_ups", v)} />
            </div>
            <Button data-testid="save-followups-btn" className="mt-4 rounded-xl" onClick={() => save({ follow_up_days: s.follow_up_days, max_follow_ups: s.max_follow_ups }, "Follow-up rules saved")}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          </Card>
          <Card>
            <CardTitle icon={ShieldAlert}>Data retention & privacy</CardTitle>
            <Num testId="retention-days" label="Auto-delete Rejected/Lost leads after (days, 0 = keep)" value={s.retention_days} onChange={(v) => up("retention_days", v)} />
            <p className="mt-2 text-xs text-muted-foreground">Do Not Contact leads are kept as a minimal suppression record so they're never re-imported.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button data-testid="save-retention-btn" className="rounded-xl" onClick={() => save({ retention_days: s.retention_days }, "Retention saved")}>Save</Button>
              <Button data-testid="run-retention-btn" variant="outline" className="rounded-xl" onClick={async () => { const { data } = await api.post("/settings/retention/run"); toast.success(`Deleted ${data.deleted} old leads`); }}>Apply now</Button>
              <Button data-testid="delete-all-data-btn" variant="outline" className="rounded-xl text-rose-600" onClick={async () => { if (window.prompt("Type DELETE to remove all your leads, messages and activity") === "DELETE") { await api.delete("/account/data"); toast.success("All CRM data deleted"); } }}>Delete all my data</Button>
            </div>
          </Card>
          <Card>
            <CardTitle icon={User}>Account</CardTitle>
            <div className="space-y-1 text-sm" data-testid="account-info"><p><span className="text-muted-foreground">Name:</span> {user.name}</p><p><span className="text-muted-foreground">Email:</span> {user.email}</p><p className="capitalize"><span className="text-muted-foreground">Role:</span> {user.role}</p></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
