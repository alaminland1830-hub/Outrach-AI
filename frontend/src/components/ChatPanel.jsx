import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Eraser, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { api, streamSSE } from "@/lib/api";

const ToolChip = ({ t }) => {
  const Icon = t.status === "running" ? Loader2 : t.status === "done" ? CheckCircle2 : XCircle;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
      <Wrench className="h-3 w-3" /> {t.name} <Icon className={`h-3 w-3 ${t.status === "running" ? "animate-spin" : t.status === "done" ? "text-emerald-500" : "text-rose-500"}`} />
    </span>
  );
};

export function ChatPanel({ messagesPath, sendPath, title, prompts = [], placeholder, height = "h-[620px]", testPrefix = "chat" }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { api.get(messagesPath).then((r) => setMsgs(r.data)); }, [messagesPath]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);

  const patchLive = (fn) => setMsgs((m) => m.map((x) => (x.id === "live" ? fn(x) : x)));

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message }, { id: "live", role: "assistant", content: "", tools: [] }]);
    try {
      await streamSSE(sendPath, { message }, {
        onText: (full) => patchLive((x) => ({ ...x, content: full })),
        onEvent: (ev) => patchLive((x) => {
          const tools = [...(x.tools || [])];
          const i = tools.findIndex((t) => t.name === ev.name && t.status === "running");
          if (i >= 0) tools[i] = ev; else tools.push(ev);
          return { ...x, tools };
        }),
      });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setMsgs((m) => m.map((x) => (x.id === "live" ? { ...x, id: `a${Date.now()}` } : x)));
      setBusy(false);
    }
  };

  const clear = async () => { await api.delete(messagesPath); setMsgs([]); };

  return (
    <div className={`flex ${height} flex-col rounded-2xl border bg-card`}>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4 text-violet-500" /> {title}</p>
        {msgs.length > 0 && <button data-testid={`${testPrefix}-clear-btn`} onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Eraser className="h-3.5 w-3.5" /> Clear</button>}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid={`${testPrefix}-messages`}>
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-md text-sm text-muted-foreground">{placeholder}</p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {prompts.map((p) => <button key={p} data-testid={`${testPrefix}-suggestion`} onClick={() => send(p)} className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted">{p}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div data-testid={`${testPrefix}-msg-${m.role}`} className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-violet-600 text-sm text-white" : "bg-muted"}`}>
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : (
                <>
                  {(m.tools || []).length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{m.tools.map((t, i) => <ToolChip key={i} t={t} />)}</div>}
                  <Markdown text={m.content} streaming={m.id === "live"} />
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t p-3">
        <Textarea data-testid={`${testPrefix}-input`} rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message… (Enter to send)"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="min-h-0 resize-none" />
        <Button data-testid={`${testPrefix}-send-btn`} size="icon" disabled={busy || !input.trim()} className="h-10 w-10 shrink-0 rounded-full"><ArrowUp className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
