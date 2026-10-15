import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { STAGES, PlatformBadge, ScoreBadge } from "@/components/Badges";
import { api, errMsg } from "@/lib/api";

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  useEffect(() => { api.get("/leads").then((r) => setLeads(r.data)); }, []);

  const onDragEnd = async ({ draggableId, destination, source }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const stage = destination.droppableId;
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === draggableId ? { ...l, stage } : l)));
    try {
      await api.patch(`/leads/${draggableId}`, { stage });
    } catch (e) {
      setLeads(prev);
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader title="Pipeline" sub="Drag leads between stages." />
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="pipeline-board">
          {STAGES.map((st) => {
            const col = leads.filter((l) => l.stage === st.id);
            return (
              <Droppable droppableId={st.id} key={st.id}>
                {(p, snap) => (
                  <div ref={p.innerRef} {...p.droppableProps} data-testid={`column-${st.id}`}
                    className={`flex w-64 shrink-0 flex-col rounded-2xl border p-3 transition-colors ${snap.isDraggingOver ? "border-indigo-300 bg-indigo-50" : "bg-zinc-100/70"}`}>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.color}`}>{st.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{col.length}</span>
                    </div>
                    <div className="min-h-[120px] flex-1 space-y-2">
                      {col.map((l, i) => (
                        <Draggable draggableId={l.id} index={i} key={l.id}>
                          {(dp, ds) => (
                            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} data-testid={`card-${l.id}`}
                              className={`rounded-xl border bg-white p-3 ${ds.isDragging ? "rotate-1 shadow-xl" : "shadow-sm"}`}>
                              <Link to={`/leads/${l.id}`} className="block truncate text-sm font-semibold hover:underline">{l.name}</Link>
                              {l.handle && <p className="truncate font-mono text-[11px] text-muted-foreground">@{l.handle}</p>}
                              <div className="mt-2 flex items-center justify-between"><PlatformBadge platform={l.platform} /><ScoreBadge score={l.score} /></div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {p.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
