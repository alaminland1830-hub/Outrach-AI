import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Save, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg, dupLeadId } from "@/lib/api";
import { PLATFORMS } from "@/components/Badges";

const EMPTY = { name: "", profile_url: "", platform: "instagram", company: "", website: "", email: "", niche_hint: "", country: "", notes: "", video_urls: "", manual_observations: "" };

const F = ({ label, children }) => <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;

export function NewLeadDialog({ onCreated }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (analyze) => {
    if (!f.name.trim()) return toast.error("Lead name is required");
    setBusy(true);
    try {
      const body = { ...f, video_urls: f.video_urls.split(/[\s,]+/).filter(Boolean) };
      const { data } = await api.post("/leads", body);
      toast.success("Lead saved");
      setF(EMPTY);
      setOpen(false);
      onCreated?.(data);
      nav(`/leads/${data.id}${analyze ? "?analyze=1" : ""}`);
    } catch (err) {
      const id = dupLeadId(err);
      toast.error(errMsg(err), id ? { action: { label: "Open", onClick: () => nav(`/leads/${id}`) } } : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-lead-btn" className="rounded-xl"><Sparkles className="mr-1.5 h-4 w-4" /> New Lead</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">New Lead</DialogTitle>
          <DialogDescription>Save the lead, or let AI research and analyze it instantly.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <F label="Lead Name"><Input data-testid="lead-name-input" value={f.name} onChange={set("name")} placeholder="e.g. Alex Creator" /></F>
          <F label="Profile URL"><Input data-testid="lead-url-input" value={f.profile_url} onChange={set("profile_url")} placeholder="https://instagram.com/username" /></F>
          <F label="Platform">
            <Select value={f.platform} onValueChange={(v) => setF({ ...f, platform: v })}>
              <SelectTrigger data-testid="lead-platform-select"><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <button type="button" data-testid="lead-more-toggle" onClick={() => setMore(!more)} className="flex items-center gap-1 text-xs font-medium text-violet-600">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} /> More details (optional — helps the AI)
          </button>
          {more && (
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Company / brand"><Input data-testid="lead-company-input" value={f.company} onChange={set("company")} /></F>
              <F label="Website"><Input data-testid="lead-website-input" value={f.website} onChange={set("website")} /></F>
              <F label="Public business email"><Input data-testid="lead-email-input" value={f.email} onChange={set("email")} /></F>
              <F label="Country"><Input data-testid="lead-country-input" value={f.country} onChange={set("country")} /></F>
              <div className="sm:col-span-2"><F label="Niche (your guess)"><Input data-testid="lead-niche-input" value={f.niche_hint} onChange={set("niche_hint")} placeholder="SaaS founder, podcast host…" /></F></div>
              <div className="sm:col-span-2"><F label="Video links (space separated)"><Input data-testid="lead-videos-input" value={f.video_urls} onChange={set("video_urls")} /></F></div>
              <div className="sm:col-span-2"><F label="What you noticed in their videos"><Textarea data-testid="lead-observations-input" rows={2} value={f.manual_observations} onChange={set("manual_observations")} placeholder="No captions, slow intro…" /></F></div>
              <div className="sm:col-span-2"><F label="Notes"><Textarea data-testid="lead-notes-input" rows={2} value={f.notes} onChange={set("notes")} /></F></div>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button data-testid="save-lead-btn" variant="secondary" disabled={busy} onClick={() => submit(false)} className="rounded-xl"><Save className="mr-1.5 h-4 w-4" /> Save Lead</Button>
            <Button data-testid="ai-analyze-lead-btn" disabled={busy} onClick={() => submit(true)} className="rounded-xl"><Sparkles className="mr-1.5 h-4 w-4" /> AI Analyze Lead</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const NewLeadButtonIcon = Plus;
