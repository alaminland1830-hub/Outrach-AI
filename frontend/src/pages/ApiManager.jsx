import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, ArrowUp, ArrowDown, Trash2, ScanSearch, ShieldCheck, Save, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Card, CardTitle, Empty } from "@/components/AppLayout";
import { api, errMsg } from "@/lib/api";

const STATUS = { active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", rate_limited: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  invalid: "bg-rose-500/15 text-rose-700 dark:text-rose-300", error: "bg-rose-500/10 text-rose-600", unverified: "bg-muted text-muted-foreground" };
const EMPTY = { api_key: "", provider: "auto", model: "", label: "", base_url: "" };

function AddKey({ providers, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const run = async (what) => {
    setBusy(what);
    try {
      if (what === "detect") { const { data } = await api.post("/keys/detect", f); if (data.provider) { setF({ ...f, provider: data.provider }); setMsg(`Detected: ${data.label}`); } else setMsg("Could not detect — pick the provider"); }
      if (what === "validate") { const { data } = await api.post("/keys/validate", f); setMsg(data.ok ? `Valid ✓ ${data.provider} · ${data.latency_ms}ms${data.model_count ? ` · ${data.model_count} models` : ""}${data.rate_limited ? " · rate limited right now" : ""}${data.unverified ? " · can't be verified, saved as-is" : ""}` : `Invalid: ${data.error}`); }
      if (what === "save") { await api.post("/keys", f); toast.success("Key validated and saved (encrypted)"); setF(EMPTY); setMsg(""); onSaved(); }
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <Card>
      <CardTitle>Add a Provider Key</CardTitle>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label className="text-xs">API Key</Label>
          <Input data-testid="key-input" type="password" autoComplete="off" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} placeholder="Paste an API key (sk-…, sk-ant-…, AIza…, gsk_…, fc-…, apify_api_…, ak_…)" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs">Provider</Label>
            <Select value={f.provider} onValueChange={(v) => setF({ ...f, provider: v })}>
              <SelectTrigger data-testid="key-provider-select"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="auto">Auto-detect</SelectItem>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.label} · {p.kind}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Model (optional)</Label><Input data-testid="key-model-input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="auto" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Label (optional)</Label><Input data-testid="key-label-input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="My key" /></div>
        </div>
        {f.provider === "custom" && <div className="space-y-1.5"><Label className="text-xs">Base URL (OpenAI-compatible)</Label><Input data-testid="key-base-url-input" value={f.base_url} onChange={(e) => setF({ ...f, base_url: e.target.value })} placeholder="https://api.example.com/v1" /></div>}
        <div className="flex flex-wrap gap-2">
          <Button data-testid="key-detect-btn" variant="outline" className="rounded-xl" disabled={!f.api_key || !!busy} onClick={() => run("detect")}><ScanSearch className="mr-1.5 h-4 w-4" /> Auto Detect</Button>
          <Button data-testid="key-validate-btn" variant="outline" className="rounded-xl" disabled={!f.api_key || !!busy} onClick={() => run("validate")}>{busy === "validate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />} Validate</Button>
          <Button data-testid="key-save-btn" className="rounded-xl" disabled={!f.api_key || !!busy} onClick={() => run("save")}>{busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save Key</Button>
        </div>
        {msg && <p data-testid="key-message" className="text-sm">{msg}</p>}
        <p className="text-xs text-muted-foreground">Auto-detect maps key prefixes (sk-ant- Anthropic, AIza Gemini, gsk_ Groq, pplx- Perplexity, fc- Firecrawl, xai- Grok, sk-or- OpenRouter, apify_api_ Apify, ak_ Composio, sk- OpenAI). Validation runs only when you click Validate or Save. Keys are encrypted on the server and never shown again.</p>
      </div>
    </Card>
  );
}

function KeyRow({ k, i, n, onMove, onChange }) {
  const act = async (fn, msg) => { try { await fn(); if (msg) toast.success(msg); onChange(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-2.5">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col"><button disabled={i === 0} onClick={() => onMove(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button><button disabled={i === n - 1} onClick={() => onMove(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button></div>
      <div className="min-w-[180px] flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold capitalize">{k.provider}{k.label && <span className="font-normal normal-case text-muted-foreground">· {k.label}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold normal-case ${STATUS[k.status] || STATUS.unverified}`}>{(k.status || "").replace("_", " ")}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] normal-case text-muted-foreground">{k.kind}</span></p>
        <p className="font-mono text-[11px] text-muted-foreground">{k.masked}{k.latency_ms != null ? ` · ${k.latency_ms}ms` : ""}{k.model_count ? ` · ${k.model_count} models` : ""}{k.model ? ` · ${k.model}` : ""}{k.last_error ? ` · ${k.last_error}` : ""}</p>
      </div>
      <Switch data-testid={`key-enabled-${k.id}`} checked={k.enabled !== false} onCheckedChange={(v) => act(() => api.patch(`/keys/${k.id}`, { enabled: v }))} />
      <Button data-testid={`key-check-${k.id}`} size="icon" variant="ghost" title="Re-check health" onClick={() => act(() => api.post(`/keys/${k.id}/check`), "Health checked")}><RefreshCw className="h-4 w-4" /></Button>
      <Button data-testid={`key-delete-${k.id}`} size="icon" variant="ghost" className="text-rose-600" onClick={() => window.confirm("Delete this key?") && act(() => api.delete(`/keys/${k.id}`), "Key deleted")}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

export default function ApiManager() {
  const [data, setData] = useState({ keys: [], providers: [] });
  const [usage, setUsage] = useState({ summary: [], recent: [] });
  const load = () => { api.get("/keys").then((r) => setData(r.data)); api.get("/keys/usage").then((r) => setUsage(r.data)); };
  useEffect(() => { load(); }, []);

  const saveOrder = async (keys) => { setData({ ...data, keys }); await api.put("/keys/order", { ids: keys.map((k) => k.id) }); };
  const move = (i, d) => { const ks = [...data.keys]; [ks[i], ks[i + d]] = [ks[i + d], ks[i]]; saveOrder(ks); };
  const onDragEnd = ({ source, destination }) => { if (!destination) return; const ks = [...data.keys]; const [m] = ks.splice(source.index, 1); ks.splice(destination.index, 0, m); saveOrder(ks); };

  return (
    <div>
      <PageHeader title="API Manager" sub="Paste a key, auto-detect or pick a provider, validate once, then save. Drag to set priority with automatic failover." />
      <div className="grid gap-6 xl:grid-cols-2">
        <AddKey providers={data.providers} onSaved={load} />
        <Card>
          <CardTitle>Priority, Health & Failover</CardTitle>
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">Drag or use the arrows to reorder. For each AI task the model chosen in Settings runs first, then the next active LLM key, then the built-in Universal Key (if enabled). Scraper/connector keys use the top active key per provider.</p>
          {data.keys.length === 0 && <Empty>No keys yet. Built-in AI models work without any key.</Empty>}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="keys">
              {(p) => (
                <div ref={p.innerRef} {...p.droppableProps} className="divide-y" data-testid="keys-list">
                  {data.keys.map((k, i) => (
                    <Draggable key={k.id} draggableId={k.id} index={i}>
                      {(dp) => <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} data-testid={`key-row-${k.id}`}><KeyRow k={k} i={i} n={data.keys.length} onMove={move} onChange={load} /></div>}
                    </Draggable>
                  ))}
                  {p.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </Card>
      </div>
      <Card className="mt-6">
        <CardTitle>API usage & cost monitoring</CardTitle>
        {usage.summary.length === 0 ? <Empty>No API calls yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="usage-table">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Provider</th><th>Type</th><th>Calls</th><th>Failed</th><th>Tokens</th><th>Est. cost</th></tr></thead>
              <tbody className="divide-y">{usage.summary.map((u, i) => <tr key={i}><td className="py-2 capitalize">{u.provider}{u.builtin ? " (built-in)" : ""}</td><td>{u.kind}</td><td className="font-mono">{u.calls}</td><td className="font-mono">{u.failed}</td><td className="font-mono">{u.tokens}</td><td className="font-mono">${u.cost}</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">Costs are estimates from public list prices. Built-in model usage is deducted from your Emergent Universal Key balance; your own keys are billed by each provider. Apify/Firecrawl usage is billed on your accounts.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
