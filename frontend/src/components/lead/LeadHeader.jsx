import { ExternalLink, Sparkles, Pin, Ban, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, PlatformBadge, StageBadge, PriorityBadge } from "@/components/Badges";

export function LeadHeader({ lead, analyzing, onAnalyze, onPin, onOptOut, onDelete }) {
  const dnc = lead.do_not_contact;
  return (
    <div className="fade-up flex flex-col gap-5 rounded-2xl border bg-card p-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar name={lead.name} src={lead.avatar} size="h-14 w-14" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 data-testid="lead-title" className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{lead.name}</h1>
            <StageBadge stage={lead.stage} />
            <PriorityBadge priority={lead.priority} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <PlatformBadge platform={lead.platform} />
            {lead.company && <span>{lead.company}</span>}
            {lead.niche && lead.niche !== "unknown" && <span className="capitalize">· {lead.niche}</span>}
            {lead.handle && <span className="font-mono text-xs">@{lead.handle}</span>}
            {lead.profile_url && <a data-testid="lead-profile-link" href={lead.profile_url.startsWith("http") ? lead.profile_url : `https://${lead.profile_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Profile <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-center"><p data-testid="lead-score" className="font-mono text-3xl font-semibold">{lead.score ?? "—"}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Score</p></div>
        <div className="text-center"><p data-testid="lead-confidence" className="font-mono text-3xl font-semibold">{lead.confidence != null ? `${lead.confidence}%` : "—"}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Confidence</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="analyze-btn" onClick={onAnalyze} disabled={analyzing || dnc} className="rounded-xl">
          {analyzing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />} {lead.analysis ? "Re-analyze" : "AI Analyze"}
        </Button>
        <Button data-testid="pin-btn" variant="outline" size="icon" className="rounded-xl" onClick={onPin} title={lead.pinned ? "Unpin" : "Pin"}>
          <Pin className={`h-4 w-4 ${lead.pinned ? "fill-violet-500 text-violet-500" : ""}`} />
        </Button>
        {!dnc && <Button data-testid="opt-out-btn" variant="outline" size="icon" className="rounded-xl" onClick={onOptOut} title="Opt-out / Do Not Contact"><Ban className="h-4 w-4" /></Button>}
        <Button data-testid="delete-lead-btn" variant="outline" size="icon" className="rounded-xl text-rose-600" onClick={onDelete} title="Delete"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
