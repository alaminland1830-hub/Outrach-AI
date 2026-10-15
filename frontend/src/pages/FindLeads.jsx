import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Instagram, Youtube, Search, Loader2, Download, Wand2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Card } from "@/components/AppLayout";
import { PlatformBadge, fmt } from "@/components/Badges";
import { api, errMsg, streamSSE } from "@/lib/api";

const SOURCES = [
  { id: "instagram", label: "Instagram", icon: Instagram, hint: "One username or profile URL per line\nflowdesk.app\nhttps://instagram.com/garyvee", via: "Composio first (your connected IG Business account), Apify backup" },
  { id: "x", label: "X / Twitter", icon: Search, hint: "One handle or URL per line\n@aliabdaal\nhttps://x.com/levelsio", via: "Composio first (your connected X account), Apify backup" },
  { id: "youtube", label: "YouTube", icon: Youtube, hint: "One channel URL or @handle per line\nhttps://www.youtube.com/@aliabdaal", via: "Apify YouTube channel scraper" },
  { id: "google", label: "Google", icon: Search, hint: "One search per line\n\"SaaS founder\" \"product demo\" site:linkedin.com\npodcast host \"business\" site:instagram.com", via: "Apify Google search scraper" },
];
const DONE = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

export default function FindLeads() {
  const nav = useNavigate();
  const [kind, setKind] = useState("instagram");
  const [targets, setTargets] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState([]);
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [bulk, setBulk] = useState("");

  const run = async () => {
    setBusy(true); setItems([]); setSel({}); setNotes([]); setStatus("STARTING");
    try {
      const { data } = await api.post("/scrape", { kind, targets: targets.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) });
      let found = data.items || [];
      setNotes(data.notes || []);
      if (data.id) {
        let cur = data;
        for (let i = 0; i < 100 && !DONE.includes(cur.status); i++) {
          setStatus(cur.status);
          await new Promise((r) => setTimeout(r, 4000));
          cur = (await api.get(`/scrape/${data.id}`)).data;
        }
        if (cur.status !== "SUCCEEDED") toast.error(cur.error || `Apify run ${cur.status.toLowerCase()}`);
        else found = [...found, ...cur.items];
      }
      found.sort((a, b) => (b.prelim_score || 0) - (a.prelim_score || 0));
      setItems(found);
      setSel(Object.fromEntries(found.map((_, i) => [i, true])));
      setStatus(`DONE · ${found.length} results`);
    } catch (e) {
      toast.error(e.response ? errMsg(e) : e.message);
      setStatus("");
    } finally { setBusy(false); }
  };

  const save = async (analyze) => {
    try {
      const { data } = await api.post("/scrape/import", { items: items.filter((_, i) => sel[i]) });
      toast.success(`Saved ${data.saved} · ${data.duplicates} duplicates skipped · ${data.do_not_contact} on Do Not Contact`);
      if (analyze) {
        for (const [i, id] of data.ids.entries()) {
          setBulk(`AI analyzing ${i + 1}/${data.ids.length}…`);
          try { await streamSSE(`/leads/${id}/analyze`, {}); } catch (e) { toast.error(e.message); }
        }
        setBulk("");
        nav("/leads?stage=qualified");
      }
    } catch (e) { toast.error(errMsg(e)); }
  };

  const suggest = async () => {
    setSuggesting(true);
    try { const { data } = await api.post("/scrape/suggest", { focus }); setKind("google"); setTargets(data.queries.join("\n")); }
    catch (e) { toast.error(errMsg(e)); } finally { setSuggesting(false); }
  };

  const src = SOURCES.find((s) => s.id === kind);
  return (
    <div>
      <PageHeader title="Find Leads" sub={<>Niche-aware discovery from public data. Keys live in <Link to="/api-manager" className="text-violet-600 hover:underline">API Manager</Link>, apps in <Link to="/connections" className="text-violet-600 hover:underline">Connections</Link>.</>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            {SOURCES.map(({ id, label, icon: Icon }) => (
              <button key={id} data-testid={`source-${id}`} onClick={() => setKind(id)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${kind === id ? "border-violet-600 bg-violet-600 text-white" : "hover:bg-muted"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">Source: {src.via}</p>
          <Textarea data-testid="scrape-targets-input" rows={6} value={targets} onChange={(e) => setTargets(e.target.value)} placeholder={src.hint} className="font-mono text-sm" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button data-testid="run-scrape-btn" onClick={run} disabled={busy || !targets.trim()} className="rounded-xl">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />} {busy ? "Collecting…" : "Find leads"}
            </Button>
            {status && <span data-testid="scrape-status" className="font-mono text-xs text-muted-foreground">{status}</span>}
          </div>
          {notes.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted-foreground" data-testid="scrape-notes">{notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-violet-500" /> Suggest searches from my Editor Profile</p>
          <p className="mt-1 text-xs text-muted-foreground">AI writes Google queries aimed at your target clients (SaaS founders, coaches, podcasters…).</p>
          <Input data-testid="suggest-focus-input" className="mt-3" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus, e.g. SaaS founders in the US" />
          <Button data-testid="suggest-queries-btn" variant="outline" className="mt-3 w-full rounded-xl" disabled={suggesting} onClick={suggest}>{suggesting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Suggest queries</Button>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Uses only public data via permitted tools. No login walls, CAPTCHAs or private data. Scraped contacts are marked unverified. Opted-out profiles are never re-imported.</p>
        </Card>
      </div>

      {items.length > 0 && (
        <Card className="mt-6 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <p className="text-sm font-medium">{items.length} results · {Object.values(sel).filter(Boolean).length} selected <span className="text-xs text-muted-foreground">(sorted by quick pre-score; real score comes from AI analysis)</span></p>
            <div className="flex gap-2">
              <Button data-testid="save-selected-btn" size="sm" variant="outline" className="rounded-lg" disabled={!!bulk} onClick={() => save(false)}><Download className="mr-1 h-4 w-4" /> Save</Button>
              <Button data-testid="save-analyze-btn" size="sm" className="rounded-lg" disabled={!!bulk} onClick={() => save(true)}>{bulk ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} {bulk || "Save & AI analyze"}</Button>
            </div>
          </div>
          <div className="divide-y" data-testid="scrape-results">
            {items.map((it, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
                <Checkbox data-testid={`result-check-${i}`} checked={!!sel[i]} onCheckedChange={(v) => setSel({ ...sel, [i]: !!v })} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{it.name} {it.handle && <span className="font-mono text-xs text-muted-foreground">@{it.handle}</span>} <PlatformBadge platform={it.platform} /> <span className="text-[10px] uppercase text-muted-foreground">{it.source}</span></p>
                  {it.bio && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{it.bio}</p>}
                  <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {it.followers > 0 && <span className="font-mono">{fmt(it.followers)} followers</span>}
                    {(it.videos || []).length > 0 && <span>{it.videos.length} recent videos</span>}
                    {it.website && <span className="truncate">{it.website}</span>}
                    {it.email && <span>{it.email} (unverified)</span>}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground" title="Quick pre-score">{it.prelim_score}</span>
              </label>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
