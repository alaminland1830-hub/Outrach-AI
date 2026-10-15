import { useEffect, useState } from "react";
import { Users, Briefcase, UserRound, MessageSquare, ScrollText, ShieldCheck, Trash2, UserCog, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Card } from "@/components/AppLayout";
import { Avatar } from "@/components/Badges";
import { useAuth } from "@/context/AuthContext";
import { api, errMsg } from "@/lib/api";

export default function AdminPanel() {
  const { user: me } = useAuth();
  const [o, setO] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState({ items: [], total: 0 });
  const load = () => { api.get("/admin/overview").then((r) => setO(r.data)); api.get("/admin/users").then((r) => setUsers(r.data)); api.get("/admin/audit").then((r) => setAudit(r.data)); };
  useEffect(() => { load(); }, []);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div>
      <PageHeader title="Admin Panel" sub="System-wide control" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[[Users, o?.users, "Users"], [UserRound, o?.leads, "Leads"], [Briefcase, o?.ai_calls, "AI calls"], [MessageSquare, o?.messages, "AI messages"]].map(([Icon, v, k]) => (
          <Card key={k} className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10"><Icon className="h-5 w-5 text-violet-600 dark:text-violet-300" /></span><div><p data-testid={`admin-${k.toLowerCase().replace(" ", "-")}`} className="font-mono text-2xl font-semibold">{v ?? "–"}</p><p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p></div></Card>
        ))}
      </div>
      <Tabs defaultValue="users" className="mt-6">
        <TabsList><TabsTrigger data-testid="admin-tab-users" value="users"><Users className="mr-1.5 h-3.5 w-3.5" /> Users</TabsTrigger><TabsTrigger data-testid="admin-tab-audit" value="audit"><ScrollText className="mr-1.5 h-3.5 w-3.5" /> Audit Logs</TabsTrigger></TabsList>
        <TabsContent value="users">
          <div className="space-y-2" data-testid="admin-users">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                <Avatar name={u.name} />
                <div className="min-w-[180px] flex-1"><p className="flex items-center gap-2 font-medium">{u.name} {u.role === "admin" && <ShieldCheck className="h-4 w-4 text-violet-500" />}</p><p className="text-xs text-muted-foreground">{u.email} · {u.leads} leads · <span className="capitalize">{u.role}</span>{u.active === false ? " · disabled" : ""}</p></div>
                {u.id !== me.id && <>
                  <Button size="sm" variant="outline" className="rounded-lg" data-testid={`role-${u.id}`} onClick={() => act(() => api.patch(`/admin/users/${u.id}`, { role: u.role === "admin" ? "user" : "admin" }), "Role updated")}><UserCog className="mr-1 h-3.5 w-3.5" /> Make {u.role === "admin" ? "User" : "Admin"}</Button>
                  <Button size="sm" variant="outline" className="rounded-lg" data-testid={`active-${u.id}`} onClick={() => act(() => api.patch(`/admin/users/${u.id}`, { active: u.active === false }), u.active === false ? "Enabled" : "Disabled")}>{u.active === false ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Enable</> : <><Ban className="mr-1 h-3.5 w-3.5" /> Disable</>}</Button>
                  <Button size="icon" variant="ghost" className="text-rose-600" data-testid={`delete-user-${u.id}`} onClick={() => window.confirm(`Delete ${u.email} and all their data?`) && act(() => api.delete(`/admin/users/${u.id}`), "User deleted")}><Trash2 className="h-4 w-4" /></Button>
                </>}
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <Card className="p-0">
            <div className="divide-y" data-testid="audit-list">
              {audit.items.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-40 font-mono text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]">{a.action}</span>
                  <span className="text-muted-foreground">{a.email}</span>
                  <span className="flex-1 truncate">{a.detail}</span>
                </div>
              ))}
            </div>
            <p className="px-4 py-2 text-xs text-muted-foreground">{audit.total} events (latest 50 shown)</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
