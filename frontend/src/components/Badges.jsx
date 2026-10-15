import { Instagram, Youtube, Globe, Music2, User } from "lucide-react";

export const STAGES = [
  { id: "new", label: "New", color: "bg-zinc-100 text-zinc-700" },
  { id: "researched", label: "Researched", color: "bg-sky-100 text-sky-700" },
  { id: "contacted", label: "Contacted", color: "bg-indigo-100 text-indigo-700" },
  { id: "replied", label: "Replied", color: "bg-amber-100 text-amber-800" },
  { id: "call_booked", label: "Call Booked", color: "bg-violet-100 text-violet-700" },
  { id: "won", label: "Won", color: "bg-emerald-100 text-emerald-700" },
  { id: "lost", label: "Lost", color: "bg-rose-100 text-rose-700" },
];

export const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X / Twitter" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "website", label: "Website" },
  { id: "other", label: "Other" },
];

const XIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M18.9 2H22l-7.4 8.5L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.9-9.1L1 2h7l4.8 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z" /></svg>
);

const ICONS = { instagram: Instagram, x: XIcon, youtube: Youtube, tiktok: Music2, website: Globe, other: User };

export function PlatformBadge({ platform }) {
  const Icon = ICONS[platform] || User;
  const label = PLATFORMS.find((p) => p.id === platform)?.label || platform;
  return (
    <span data-testid="platform-badge" className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 text-xs font-medium">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

export function StageBadge({ stage }) {
  const s = STAGES.find((x) => x.id === stage) || STAGES[0];
  return <span data-testid="stage-badge" className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.label}</span>;
}

export function ScoreBadge({ score = 0 }) {
  const tone = score >= 60 ? "bg-emerald-500" : score >= 30 ? "bg-amber-400" : "bg-zinc-300";
  return (
    <span data-testid="score-badge" title="Lead score: website +30, business keywords +25, followers up to +30, public contact +15"
      className="inline-flex items-center gap-2 font-mono text-xs font-semibold">
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-zinc-200">
        <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${score}%` }} />
      </span>
      {score}
    </span>
  );
}

export const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n || 0}`);
