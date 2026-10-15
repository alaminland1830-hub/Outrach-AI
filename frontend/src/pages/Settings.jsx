import { useEffect, useState } from "react";
import { Bot, KeyRound, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppLayout";
import { api, errMsg } from "@/lib/api";

const BYOK = {
  openai: { label: "OpenAI", models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"] },
  anthropic: { label: "Anthropic (Claude)", models: ["claude-sonnet-4-5-20250929", "claude-opus-4-5-20251101", "claude-haiku-4-5-20251001"] },
  gemini: { label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  xai: { label: "xAI Grok", models: ["grok-4", "grok-3-mini"] },
};
const TASKS = [["research", "Deep research"], ["outreach", "Outreach writing"], ["chat", "Lead AI memory chat"]];

const Card = ({ icon: Icon, title, sub, children }) => (
  <section className="fade-up rounded-2xl border bg-white p-6">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5" /> {title}</h2>
    <p className="mb-5 mt-1 text-sm text-muted-foreground">{sub}</p>
    {children}
  </section>
);

function SecretField({ label, saved, value, onChange, testId, placeholder }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between">{label} {saved && <span className="font-mono text-[11px] font-normal text-emerald-600">saved {saved}</span>}</Label>
      <Input data-testid={testId} type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={saved ? "Enter a new value to replace" : placeholder} />
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState(null);
  const [models, setModels] = useState({});
  const [keys, setKeys] = useState({});
  const [custom, setCustom] = useState({ base_url: "", model: "", api_key: "" });
  const [apify, setApify] = useState("");

  const apply = (d) => { setS(d); setModels(d.models); setCustom({ base_url: d.custom.base_url, model: d.custom.model, api_key: "" }); setKeys({}); setApify(""); };
  useEffect(() => { api.get("/settings").then((r) => apply(r.data)); }, []);

  const save = async (body, msg) => {
    try { apply((await api.put("/settings", body)).data); toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const options = (
    <SelectContent>
      <SelectGroup><SelectLabel>Built-in (no key needed)</SelectLabel>
        {s.builtin_models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
      </SelectGroup>
      {Object.entries(BYOK).map(([p, cfg]) => (
        <SelectGroup key={p}><SelectLabel>{cfg.label} — your key {s.keys[p] ? "✓" : "(not set)"}</SelectLabel>
          {cfg.models.map((m) => <SelectItem key={m} value={`byok:${p}:${m}`}>{m}</SelectItem>)}
        </SelectGroup>
      ))}
      <SelectGroup><SelectLabel>OpenAI-compatible {s.custom.api_key ? "✓" : "(not set)"}</SelectLabel>
        <SelectItem value={`byok:custom:${s.custom.model || "custom"}`}>Custom: {s.custom.model || "configure below"}</SelectItem>
      </SelectGroup>
    </SelectContent>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" sub="Connect scrapers and choose which AI does the work." />

      <Card icon={Radar} title="Scrapers" sub="Apify powers Instagram, X, YouTube and Google lead finding. Usage is billed by Apify on your account.">
        <SecretField label="Apify API token" saved={s.apify_token} value={apify} onChange={setApify} testId="apify-token-input" placeholder="apify_api_…" />
        <p className="mt-2 text-xs text-muted-foreground">Apify Console → Settings → Integrations → API tokens.</p>
        <Button data-testid="save-apify-btn" className="mt-4 rounded-full" disabled={!apify} onClick={() => save({ apify_token: apify }, "Apify token saved")}>Save token</Button>
      </Card>

      <Card icon={Bot} title="AI models" sub="Pick a model for each job. Built-in models use your Emergent Universal Key balance.">
        <div className="space-y-4">
          {TASKS.map(([t, label]) => (
            <div key={t} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
              <Label>{label}</Label>
              <Select value={models[t]} onValueChange={(v) => setModels({ ...models, [t]: v })}>
                <SelectTrigger data-testid={`model-select-${t}`}><SelectValue /></SelectTrigger>
                {options}
              </Select>
            </div>
          ))}
        </div>
        <Button data-testid="save-models-btn" className="mt-5 rounded-full" onClick={() => save({ models }, "Models saved")}>Save models</Button>
      </Card>

      <Card icon={KeyRound} title="Your own API keys" sub="Optional. Keys are stored on the server for your account and never shown back in full.">
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(BYOK).map(([p, cfg]) => (
            <SecretField key={p} label={cfg.label} saved={s.keys[p]} value={keys[p] || ""} onChange={(v) => setKeys({ ...keys, [p]: v })} testId={`key-input-${p}`} placeholder="sk-…" />
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-dashed p-4">
          <p className="mb-3 text-sm font-medium">OpenAI-compatible provider <span className="font-normal text-muted-foreground">(OpenRouter, Groq, DeepSeek…)</span></p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Base URL</Label><Input data-testid="custom-base-url-input" value={custom.base_url} onChange={(e) => setCustom({ ...custom, base_url: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></div>
            <div className="space-y-1.5"><Label>Model name</Label><Input data-testid="custom-model-input" value={custom.model} onChange={(e) => setCustom({ ...custom, model: e.target.value })} placeholder="deepseek/deepseek-chat" /></div>
            <div className="sm:col-span-2"><SecretField label="API key" saved={s.custom.api_key} value={custom.api_key} onChange={(v) => setCustom({ ...custom, api_key: v })} testId="custom-api-key-input" placeholder="sk-or-…" /></div>
          </div>
        </div>
        <Button data-testid="save-keys-btn" className="mt-5 rounded-full"
          onClick={() => save({ keys, custom: { base_url: custom.base_url, model: custom.model, api_key: custom.api_key || null } }, "Keys saved")}>Save keys</Button>
      </Card>
    </div>
  );
}
