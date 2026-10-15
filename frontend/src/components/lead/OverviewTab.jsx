import { Sparkles, Loader2, Target, TrendingUp, AlertTriangle, Lightbulb, Clapperboard, ShieldQuestion, Gauge, Send, CircleDot, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/AppLayout";

const FACTOR_LABELS = { niche_match: "Niche & service match", video_activity: "Active video publishing", editing_opportunity: "Editing opportunities",
  recurring_potential: "Recurring work potential", business_signals: "Business & growth signals", contact_channel: "Verified contact channel" };

const List = ({ items, empty = "unknown" }) => (items?.length ? (
  <ul className="space-y-1.5 text-sm">{items.map((x, i) => <li key={i} className="flex gap-2"><span className="text-violet-500">›</span><span>{x}</span></li>)}</ul>
) : <p className="text-sm text-muted-foreground">{empty}</p>);

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium first-letter:uppercase">{v || "unknown"}</span></div>
);

function ScoreCard({ lead }) {
  const b = lead.score_breakdown || {};
  return (
    <Card data-testid="score-breakdown">
      <CardTitle icon={Gauge} right={<span className="font-mono text-sm font-semibold">{lead.score}/100</span>}>Explainable lead score</CardTitle>
      <div className="space-y-3">
        {Object.entries(FACTOR_LABELS).map(([k, label]) => {
          const f = b[k] || { points: 0, max: 0 };
          return (
            <div key={k}>
              <div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="font-mono">{f.points}/{f.max}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${f.max ? (f.points / f.max) * 100 : 0}%` }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{f.evidence}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">{lead.score_explanation} A high score does not guarantee budget, interest or a reply.</p>
    </Card>
  );
}

function Sequence({ lead, onGoMessages }) {
  const steps = [["Initial outreach", lead.last_contact_at], [`Follow-ups sent: ${lead.follow_up_count || 0}`, null], ["Next follow-up", lead.follow_up_at]];
  return (
    <Card>
      <CardTitle icon={Send} right={<Button size="sm" variant="outline" className="rounded-lg" data-testid="go-messages-btn" onClick={onGoMessages}>Write message</Button>}>Outreach sequence</CardTitle>
      <div className="space-y-2.5">
        {steps.map(([label, date]) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <CircleDot className={`h-4 w-4 ${date ? "text-violet-500" : "text-muted-foreground"}`} />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-xs text-muted-foreground">{date ? new Date(date).toLocaleDateString() : "—"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function OverviewTab({ lead, analyzing, progress, onAnalyze, onGoMessages }) {
  const a = lead.analysis;
  if (analyzing || !a) {
    return (
      <Card className="py-10 text-center" data-testid="analysis-empty">
        {analyzing ? (
          <div className="mx-auto max-w-md space-y-2 text-left" data-testid="analysis-progress">
            {progress.map((p, i) => <p key={i} className="fade-up flex items-start gap-2 text-sm"><Loader2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${i === progress.length - 1 ? "animate-spin text-violet-500" : "text-muted-foreground"}`} /> {p}</p>)}
          </div>
        ) : (
          <>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">No AI analysis yet. The AI checks niche fit, video activity and editing opportunities, then gives an explainable score — using only real data it can access.</p>
            {lead.legacy_analysis && <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">(An older free-text report is kept in Notes & Activity.)</p>}
            <Button data-testid="analyze-empty-btn" className="mt-4 rounded-xl" onClick={onAnalyze} disabled={lead.do_not_contact}><Sparkles className="mr-1.5 h-4 w-4" /> AI Analyze Lead</Button>
          </>
        )}
      </Card>
    );
  }
  const needs = [["SaaS UI animation", a.needs_saas_ui_animation], ["Podcast clips", a.needs_podcast_clips], ["Talking-head", a.needs_talking_head], ["Educational", a.needs_educational]];
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="analysis-overview">
      <Card>
        <CardTitle icon={Target}>Profile summary</CardTitle>
        <p className="text-sm leading-relaxed">{a.what_they_do}</p>
        <p className="mt-2 text-sm text-muted-foreground">{a.relevance_summary}</p>
        <div className="mt-3 divide-y">
          <Row k="Niche" v={a.niche} /><Row k="Business type" v={a.business_type?.replace("_", " ")} /><Row k="Publishes video" v={a.publishes_video} />
          <Row k="Video activity" v={a.video_activity} /><Row k="Recurring potential" v={a.recurring_potential} /><Row k="Contact" v={a.contact_assessment} />
        </div>
      </Card>
      <ScoreCard lead={lead} />
      <Card>
        <CardTitle icon={Lightbulb}>Why contact & opportunity</CardTitle>
        <p className="text-sm"><span className="font-semibold">Recommended service:</span> {a.recommended_service}</p>
        <p className="mt-2 text-sm"><span className="font-semibold">Outreach angle:</span> {a.outreach_angle}</p>
        <p className="mt-2 text-sm"><span className="font-semibold">Why my style fits:</span> {a.why_my_style}</p>
        <p className="mt-3 inline-block rounded-lg bg-violet-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-violet-700 dark:text-violet-300">Budget estimate: {a.budget_estimate}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{needs.map(([k, v]) => <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs ${v === "yes" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{k}: {v}</span>)}</div>
      </Card>
      <Card>
        <CardTitle icon={Clapperboard}>Editing opportunities</CardTitle>
        <div className="space-y-3">
          {(a.opportunities || []).map((o, i) => (
            <div key={i} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold">{o.issue}</p>
              {o.evidence && <p className="mt-1 text-xs text-muted-foreground">Evidence: {o.evidence}</p>}
              {o.suggestion && <p className="mt-1 text-xs">→ {o.suggestion}</p>}
            </div>
          ))}
          {!(a.opportunities || []).length && <p className="text-sm text-muted-foreground">No evidence-based opportunities found in the available data.</p>}
        </div>
        <p className="mt-3 text-sm"><span className="font-semibold">Sample video idea:</span> {a.sample_video_idea}</p>
      </Card>
      <Card><CardTitle icon={CircleDot}>Content observations</CardTitle><List items={a.content_observations} /></Card>
      <Card><CardTitle icon={TrendingUp}>Buying signals</CardTitle><List items={a.buying_signals} empty="None found in the data." /></Card>
      <Card><CardTitle icon={AlertTriangle}>Red flags</CardTitle><List items={a.red_flags} empty="None found." /></Card>
      <Card><CardTitle icon={ShieldQuestion}>Unknowns</CardTitle><List items={a.unknowns} empty="—" /></Card>
      <Card className="lg:col-span-2">
        <CardTitle icon={Database}>What the AI actually analyzed</CardTitle>
        <p className="text-sm">{(a.data_analyzed || []).join(" · ") || "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{a.videos_processed ? "A transcript was processed." : "No video was watched — only text data (bio, captions, titles, notes) was used."} Analyzed {new Date(a.analyzed_at).toLocaleString()}.</p>
        {(a.evidence || []).length > 0 && <div className="mt-3"><p className="mb-1 text-xs font-semibold">Evidence</p><List items={a.evidence} /></div>}
      </Card>
      <div className="lg:col-span-2"><Sequence lead={lead} onGoMessages={onGoMessages} /></div>
    </div>
  );
}
