import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { api, streamSSE } from "@/lib/api";

const PROMPTS = ["What should I reply to this?", "Rewrite my DM more casual", "What price should I quote?", "Give me 3 video ideas for them"];

export function LeadChat({ lead }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { api.get(`/leads/${lead.id}/messages`).then((r) => setMsgs(r.data)); }, [lead.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message }, { id: "live", role: "assistant", content: "" }]);
    try {
      await streamSSE(`/leads/${lead.id}/chat`, { message }, (full) =>
        setMsgs((m) => m.map((x) => (x.id === "live" ? { ...x, content: full } : x))));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setMsgs((m) => m.map((x) => (x.id === "live" ? { ...x, id: `a${Date.now()}` } : x)));
      setBusy(false);
    }
  };

  const clear = async () => { await api.delete(`/leads/${lead.id}/messages`); setMsgs([]); };

  return (
    <div className="flex h-[620px] flex-col rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4 text-indigo-500" /> Remembers research, notes, outreach and this chat</p>
        {msgs.length > 0 && <button data-testid="clear-chat-btn" onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Eraser className="h-3.5 w-3.5" /> Clear</button>}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid="chat-messages">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Ask anything about {lead.name}. Paste their reply to get a suggested answer.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {PROMPTS.map((p) => <button key={p} data-testid="chat-suggestion" onClick={() => send(p)} className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-zinc-100">{p}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div data-testid={`chat-msg-${m.role}`} className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-[#0B0B0C] text-sm text-white" : "bg-zinc-100"}`}>
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} streaming={m.id === "live"} />}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t p-3">
        <Textarea data-testid="chat-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste their reply or ask for a rewrite…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="min-h-0 resize-none" />
        <Button data-testid="chat-send-btn" size="icon" disabled={busy || !input.trim()} className="h-10 w-10 shrink-0 rounded-full"><ArrowUp className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
