import { useState } from "react";
import { Link } from "react-router-dom";
import { Instagram, Youtube, Search, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/AppLayout";
import { ScoreBadge, fmt } from "@/components/Badges";
import { api, errMsg } from "@/lib/api";

const SOURCES = [
  { id: "instagram", label: "Instagram", icon: Instagram, hint: "One username or profile URL per line\nnatgeo\nhttps://instagram.com/fitwithmax" },
  { id: "x", label: "X / Twitter", icon: Search, hint: "One handle or URL per line\n@mkbhd\nhttps://x.com/aliabdaal" },
  { id: "youtube", label: "YouTube", icon: Youtube, hint: "One channel URL or @handle per line\nhttps://www.youtube.com/@aliabdaal" },
  { id: "google", label: "Google", icon: Search, hint: "One search per line\nfitness youtubers needing video editor\nsite:instagram.com real estate agent reels" },
];
const DONE = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

export default function FindLeads() {
  const [kind, setKind] = useState("instagram");
  const [targets, setTargets] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setItems([]); setSel({}); setStatus("STARTING");
    try {
      const { data } = await api.post("/scrape", { kind, targets: targets.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) });
      let cur = data;
      for (let i = 0; i < 100 && !DONE.includes(cur.status); i++) {
        setStatus(cur.status);
        await new Promise((r) => setTimeout(r, 4000));
        cur = (await api.get(`/scrape/${data.id}`)).data;
      }
      setStatus(cur.status);
      if (cur.status !== "SUCCEEDED") throw new Error(cur.error || `Scrape ${cur.status.toLowerCase()}`);
      setItems(cur.items);
      setSel(Object.fromEntries(cur.items.map((_, i) => [i, true])));
      toast.success(`${cur.items.length} results`);
    } catch (e) {
      toast.error(e.response ? errMsg(e) : e.message);
      setStatus("");
    } finally { setBusy(false); }
  };

  const save = async () => {
    const chosen = items.filter((_, i) => sel[i]);
    try {
      const { data } = await api.post("/scrape/import", { items: chosen });
      toast.success(`Saved ${data.saved} leads`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const src = SOURCES.find((s) => s.id === kind);
  return (
    <div>
      <PageHeader title="Find leads" sub={<>Runs Apify scrapers with your own token. <Link to="/settings" className="text-indigo-600 hover:underline">Set token</Link></>} />
      <div className="rounded-2xl border bg-white p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {SOURCES.map(({ id, label, icon: Icon }) => (
            <button key={id} data-testid={`source-${id}`} onClick={() => setKind(id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${kind === id ? "border-[#0B0B0C] bg-[#0B0B0C] text-white" : "hover:bg-zinc-100"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <Textarea data-testid="scrape-targets-input" rows={5} value={targets} onChange={(e) => setTargets(e.target.value)} placeholder={src.hint} className="font-mono text-sm" />
        <div className="mt-4 flex items-center gap-3">
          <Button data-testid="run-scrape-btn" onClick={run} disabled={busy || !targets.trim()} className="rounded-full">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />} {busy ? "Scraping…" : "Run scrape"}
          </Button>
          {status && <span data-testid="scrape-status" className="font-mono text-xs text-muted-foreground">{status}</span>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-6 rounded-2xl border bg-white">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <p className="text-sm font-medium">{items.length} results · {Object.values(sel).filter(Boolean).length} selected</p>
            <Button data-testid="save-selected-btn" size="sm" className="rounded-full" onClick={save}><Download className="mr-1 h-4 w-4" /> Save as leads</Button>
          </div>
          <div className="divide-y" data-testid="scrape-results">
            {items.map((it, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-zinc-50">
                <Checkbox data-testid={`result-check-${i}`} checked={!!sel[i]} onCheckedChange={(v) => setSel({ ...sel, [i]: !!v })} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.name} {it.handle && <span className="font-mono text-xs text-muted-foreground">@{it.handle}</span>}</p>
                  {it.bio && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{it.bio}</p>}
                  <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {it.followers > 0 && <span className="font-mono">{fmt(it.followers)} followers</span>}
                    {it.website && <span className="truncate">{it.website}</span>}
                    {it.contact && <span>{it.contact} (unverified)</span>}
                  </p>
                </div>
                <ScoreBadge score={it.score} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
