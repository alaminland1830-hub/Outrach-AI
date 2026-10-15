import { Instagram, Youtube, Globe, Music2, User, Linkedin } from "lucide-react";

export const STAGES = [
  { id: "discovered", label: "Discovered", color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
  { id: "ai_analyzed", label: "AI Analyzed", color: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  { id: "qualified", label: "Qualified", color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  { id: "approved", label: "Approved", color: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  { id: "outreach_drafted", label: "Outreach Drafted", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  { id: "contacted", label: "Contacted", color: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  { id: "replied", label: "Replied", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { id: "won", label: "Won", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { id: "lost", label: "Lost", color: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  { id: "rejected", label: "Rejected", color: "bg-stone-500/15 text-stone-600 dark:text-stone-300" },
  { id: "do_not_contact", label: "Do Not Contact", color: "bg-red-600/15 text-red-700 dark:text-red-300" },
];
export const MAIN_STAGES = STAGES.slice(0, 9);

export const PLATFORMS = [
  { id: "instagram", label: "Instagram" }, { id: "x", label: "X / Twitter" }, { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" }, { id: "tiktok", label: "TikTok" }, { id: "website", label: "Website" }, { id: "other", label: "Other" },
];

export const MESSAGE_TYPES = [
  ["instagram_dm", "Instagram DM"], ["linkedin_message", "LinkedIn message"], ["business_email", "Business email"],
  ["follow_up", "Follow-up"], ["free_sample", "Free sample offer"], ["saas_ui_pitch", "SaaS UI animation pitch"],
  ["podcast_pitch", "Podcast editing pitch"], ["talking_head_pitch", "Talking-head pitch"], ["educational_pitch", "Educational creator pitch"],
];

const XIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M18.9 2H22l-7.4 8.5L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.9-9.1L1 2h7l4.8 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z" /></svg>
);
const ICONS = { instagram: Instagram, x: XIcon, youtube: Youtube, tiktok: Music2, website: Globe, linkedin: Linkedin, other: User };

export function PlatformBadge({ platform }) {
  const Icon = ICONS[platform] || User;
  const label = PLATFORMS.find((p) => p.id === platform)?.label || platform;
  return (
    <span data-testid="platform-badge" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-xs font-medium">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;

export function StageBadge({ stage }) {
  const s = STAGES.find((x) => x.id === stage) || STAGES[0];
  return <span data-testid="stage-badge" className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.label}</span>;
}

const PRI = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300", reject: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  unscored: "bg-muted text-muted-foreground",
};

export function PriorityBadge({ priority = "unscored" }) {
  const label = priority === "reject" ? "Review / reject" : priority === "unscored" ? "Not scored" : priority;
  return <span data-testid="priority-badge" className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${PRI[priority] || PRI.unscored}`}>{label}</span>;
}

export function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span data-testid="score-badge" className="font-mono text-xs text-muted-foreground">—</span>;
  const tone = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : score >= 40 ? "bg-zinc-400" : "bg-rose-400";
  return (
    <span data-testid="score-badge" className="inline-flex items-center gap-2 font-mono text-xs font-semibold">
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${score}%` }} />
      </span>
      {score}
    </span>
  );
}

export const Avatar = ({ name = "?", src, size = "h-9 w-9" }) =>
  src ? <img src={src} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full object-cover`} />
    : <span className={`${size} grid shrink-0 place-items-center rounded-full bg-violet-500/15 text-sm font-bold text-violet-700 dark:text-violet-300`}>{name[0]?.toUpperCase()}</span>;

export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n || 0}`);
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
