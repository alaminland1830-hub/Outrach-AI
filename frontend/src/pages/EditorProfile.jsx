import { useEffect, useState } from "react";
import { Save, Plus, Trash2, Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Card, CardTitle } from "@/components/AppLayout";
import { api, errMsg } from "@/lib/api";

const FIELDS = [["name", "Name", 1], ["niche", "Niche", 1], ["company_type", "Company / Individual", 1], ["services", "Services", 3], ["editing_style", "Editing Style", 3],
  ["target_clients", "Target Clients", 3], ["pricing", "Pricing", 2], ["experience", "Experience", 1], ["positioning", "Positioning", 2], ["tone", "Preferred tone", 1], ["business_goal", "Business goal", 2]];

export default function EditorProfile() {
  const [p, setP] = useState(null);
  const [m, setM] = useState({ category: "", description: "", link: "" });
  useEffect(() => { api.get("/editor-profile").then((r) => setP(r.data)); }, []);
  if (!p) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async (next = p) => { try { setP((await api.put("/editor-profile", next)).data); toast.success("Profile saved — every AI output now uses it"); } catch (e) { toast.error(errMsg(e)); } };
  const addMapping = () => { if (!m.category || !m.link) return toast.error("Category and link are required"); const next = { ...p, portfolio: [...(p.portfolio || []), m] }; setM({ category: "", description: "", link: "" }); save(next); };
  const removeMapping = (i) => save({ ...p, portfolio: p.portfolio.filter((_, j) => j !== i) });
  const LinkRow = ({ label, value }) => value ? (
    <div className="flex items-center gap-3 rounded-xl border p-3"><Link2 className="h-4 w-4 text-violet-500" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><a href={value} target="_blank" rel="noreferrer" className="block truncate text-xs text-violet-600">{value}</a></div>
      <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}><Copy className="h-4 w-4 text-muted-foreground" /></button></div>
  ) : null;

  return (
    <div>
      <PageHeader title="Editor Profile" sub="The single source of truth for all AI outputs. Change it and every analysis and message updates.">
        <Button data-testid="save-profile-btn" className="rounded-xl" onClick={() => save()}><Save className="mr-1.5 h-4 w-4" /> Save Profile</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardTitle>AI Context Fields</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(([k, label, rows]) => (
              <div key={k} className={`space-y-1.5 ${rows > 1 ? "sm:col-span-2" : ""}`}>
                <Label className="text-xs">{label}</Label>
                {rows > 1 ? <Textarea data-testid={`profile-${k}`} rows={rows} value={p[k] || ""} onChange={set(k)} /> : <Input data-testid={`profile-${k}`} value={p[k] || ""} onChange={set(k)} />}
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle>Portfolio Mapping</CardTitle>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">AI auto-selects the best portfolio for each lead's niche.</p>
            <div className="grid gap-2">
              <Input data-testid="mapping-category" value={m.category} onChange={(e) => setM({ ...m, category: e.target.value })} placeholder="Category e.g. Podcast Editing" />
              <Input data-testid="mapping-description" value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} placeholder="Short description (optional)" />
              <Input data-testid="mapping-link" value={m.link} onChange={(e) => setM({ ...m, link: e.target.value })} placeholder="Portfolio link" />
              <Button data-testid="add-mapping-btn" variant="outline" className="rounded-xl" onClick={addMapping}><Plus className="mr-1 h-4 w-4" /> Add Mapping</Button>
            </div>
            <div className="mt-4 space-y-2" data-testid="mapping-list">
              {(p.portfolio || []).map((x, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{x.category}</p><p className="truncate text-xs text-violet-600">{x.link}</p>{x.description && <p className="text-xs text-muted-foreground">{x.description}</p>}</div>
                  <button data-testid={`remove-mapping-${i}`} onClick={() => removeMapping(i)}><Trash2 className="h-4 w-4 text-rose-500" /></button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Universal Portfolio link</Label><Input data-testid="profile-universal_portfolio" value={p.universal_portfolio || ""} onChange={set("universal_portfolio")} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Instagram Profile</Label><Input data-testid="profile-instagram_profile" value={p.instagram_profile || ""} onChange={set("instagram_profile")} /></div>
            <LinkRow label="Universal Portfolio" value={p.universal_portfolio} />
            <LinkRow label="Instagram Profile" value={p.instagram_profile} />
          </Card>
        </div>
      </div>
    </div>
  );
}
