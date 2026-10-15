import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { STAGES, Avatar, ScoreBadge } from "@/components/Badges";
import { api, errMsg } from "@/lib/api";

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  useEffect(() => { api.get("/leads", { params: { page_size: 500 } }).then((r) => setLeads(r.data.items)); }, []);

  const onDragEnd = async ({ draggableId, destination, source }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const stage = destination.droppableId;
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === draggableId ? { ...l, stage } : l)));
    try { await api.patch(`/leads/${draggableId}`, { stage }); } catch (e) { setLeads(prev); toast.error(errMsg(e)); }
  };

  return (
    <div>
      <PageHeader title="Pipeline" sub="Drag leads to update stages: Discovered → AI Analyzed → Qualified → Approved → Drafted → Contacted → Replied → Negotiation → Won" />
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="pipeline-board">
          {STAGES.map((st) => {
            const col = leads.filter((l) => l.stage === st.id);
            return (
              <Droppable droppableId={st.id} key={st.id}>
                {(p, snap) => (
                  <div ref={p.innerRef} {...p.droppableProps} data-testid={`column-${st.id}`}
                    className={`flex w-60 shrink-0 flex-col rounded-2xl border p-2.5 transition-colors ${snap.isDraggingOver ? "border-violet-400 bg-violet-500/5" : "bg-muted/50"}`}>
                    <div className="mb-2.5 flex items-center justify-between px-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${st.color}`}>{st.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{col.length}</span>
                    </div>
                    <div className="min-h-[120px] flex-1 space-y-2">
                      {col.map((l, i) => (
                        <Draggable draggableId={l.id} index={i} key={l.id}>
                          {(dp, ds) => (
                            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} data-testid={`card-${l.id}`}
                              className={`rounded-xl border bg-card p-3 ${ds.isDragging ? "rotate-1 shadow-xl" : "shadow-sm"}`}>
                              <div className="flex items-center gap-2">
                                <Avatar name={l.name} src={l.avatar} size="h-7 w-7" />
                                <div className="min-w-0">
                                  <Link to={`/leads/${l.id}`} className="block truncate text-sm font-semibold hover:underline">{l.name}</Link>
                                  <p className="truncate text-[11px] capitalize text-muted-foreground">{l.niche || l.platform}</p>
                                </div>
                              </div>
                              <div className="mt-2"><ScoreBadge score={l.score} /></div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {p.placeholder}
                      {col.length === 0 && <p className="rounded-xl border border-dashed py-6 text-center text-[11px] text-muted-foreground">Drop here</p>}
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
