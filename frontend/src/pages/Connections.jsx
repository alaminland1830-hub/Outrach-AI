import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plug, CheckCircle2, Loader2, KeyRound, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Card } from "@/components/AppLayout";
import { api, errMsg } from "@/lib/api";

export default function Connections() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => api.get("/connections").then((r) => { setData(r.data); setError(""); }).catch((e) => setError(errMsg(e)));
  useEffect(() => {
    load();
    if (params.get("status") || params.get("connected")) { toast.success("Connection updated"); setParams({}, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (slug) => {
    setBusy(slug);
    try {
      const { data: r } = await api.post(`/connections/${slug}/connect`, { callback_url: `${window.location.origin}/connections?connected=1` });
      window.location.assign(r.redirect_url);
    } catch (e) { toast.error(errMsg(e)); setBusy(""); }
  };
  const disconnect = async (slug) => {
    if (!window.confirm(`Disconnect ${slug}?`)) return;
    setBusy(slug);
    try { await api.delete(`/connections/${slug}`); toast.success("Disconnected"); await load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };

  const rows = data?.connectors || [];
  const cats = [...new Set(rows.map((r) => r.cat))];
  return (
    <div>
      <PageHeader title="Connections" sub="Connect your apps through Composio — like Claude connectors. The AI Assistant and lead chat can then use them (and always ask before sending).">
        <Button data-testid="refresh-connections" variant="outline" className="rounded-xl" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button>
      </PageHeader>
      {data && !data.has_key && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 border-violet-500/40 bg-violet-500/5" data-testid="composio-key-banner">
          <KeyRound className="h-5 w-5 text-violet-500" />
          <p className="flex-1 text-sm">Add your <b>Composio API key</b> in API Manager to enable connections (dashboard.composio.dev → Settings → API Keys).</p>
          <Button asChild className="rounded-xl"><Link to="/api-manager">Open API Manager</Link></Button>
        </Card>
      )}
      {error && <Card className="mb-6 border-rose-500/40 text-sm text-rose-600" data-testid="connections-error">{error}</Card>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {cats.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.filter((r) => r.cat === cat).map((c) => (
              <div key={c.slug} data-testid={`connector-${c.slug}`} className="fade-up flex items-start gap-3 rounded-2xl border bg-card p-4">
                {c.logo ? <img src={c.logo} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1.5" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted"><Plug className="h-5 w-5" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">{c.name} {c.connected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                  {c.status && !c.connected && <p className="mt-1 text-[11px] text-amber-600">Status: {c.status}</p>}
                </div>
                {c.connected ? (
                  <Button data-testid={`disconnect-${c.slug}`} size="sm" variant="outline" className="rounded-lg" disabled={busy === c.slug} onClick={() => disconnect(c.slug)}><Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect</Button>
                ) : (
                  <Button data-testid={`connect-${c.slug}`} size="sm" className="rounded-lg" disabled={!data.has_key || busy === c.slug} onClick={() => connect(c.slug)}>{busy === c.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Instagram lookups work for Business/Creator accounts via your connected IG Business account; X lookups depend on your X API tier. When Composio can't fetch a profile, Apify is used as backup.</p>
    </div>
  );
}
