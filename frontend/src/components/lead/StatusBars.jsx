import { Check } from "lucide-react";
import { STAGES } from "@/components/Badges";

const OUTCOMES = [["replied", "Replied"], ["positive_reply", "Positive reply"], ["call_booked", "Call booked"], ["hired", "Hired"]];

export function StatusBars({ lead, onStage, onOutcome }) {
  const outcomes = lead.outcomes || {};
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick status</p>
        <div className="flex flex-wrap gap-1.5" data-testid="quick-status">
          {STAGES.map((s) => (
            <button key={s.id} data-testid={`status-${s.id}`} onClick={() => s.id !== lead.stage && onStage(s.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${s.id === lead.stage ? "bg-violet-600 text-white" : `${s.color} hover:opacity-80`}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome tracking</p>
        <div className="flex flex-wrap gap-1.5" data-testid="outcome-tracking">
          {OUTCOMES.map(([k, label]) => {
            const on = !!outcomes[k];
            return (
              <button key={k} data-testid={`outcome-${k}`} onClick={() => onOutcome(k, !on)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted"}`}>
                <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${on ? "border-emerald-500 bg-emerald-500" : ""}`}>{on && <Check className="h-2.5 w-2.5 text-white" />}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
