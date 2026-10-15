import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";
import { PLATFORMS } from "@/components/Badges";

const EMPTY = { name: "", handle: "", url: "", platform: "instagram", followers: "", bio: "", notes: "" };

export function AddLeadDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/leads", { ...f, followers: Number(f.followers) || 0 });
      toast.success("Lead added");
      setF(EMPTY);
      setOpen(false);
      onCreated?.(data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-lead-btn" className="rounded-full"><Plus className="mr-1 h-4 w-4" /> Add lead</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add a lead</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1"><Label>Name</Label><Input data-testid="lead-name-input" required value={f.name} onChange={set("name")} placeholder="Alex Fitness" /></div>
            <div className="col-span-2 sm:col-span-1"><Label>Platform</Label>
              <Select value={f.platform} onValueChange={(v) => setF({ ...f, platform: v })}>
                <SelectTrigger data-testid="lead-platform-select"><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Handle</Label><Input data-testid="lead-handle-input" value={f.handle} onChange={set("handle")} placeholder="@alexfit" /></div>
            <div><Label>Followers</Label><Input data-testid="lead-followers-input" type="number" value={f.followers} onChange={set("followers")} placeholder="45000" /></div>
          </div>
          <div><Label>Profile URL</Label><Input data-testid="lead-url-input" value={f.url} onChange={set("url")} placeholder="https://instagram.com/alexfit" /></div>
          <div><Label>Bio / description</Label><Textarea data-testid="lead-bio-input" rows={2} value={f.bio} onChange={set("bio")} /></div>
          <div><Label>Notes</Label><Textarea data-testid="lead-notes-input" rows={2} value={f.notes} onChange={set("notes")} placeholder="Posts 3 reels/week, editing is basic" /></div>
          <Button data-testid="lead-submit-btn" disabled={busy} className="rounded-full">{busy ? "Saving…" : "Save lead"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
