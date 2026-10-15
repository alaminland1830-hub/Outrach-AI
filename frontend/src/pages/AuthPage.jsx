import { useState } from "react";
import { Logo } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";

const STATS = [["3x", "reply rate"], ["AI", "per lead memory"], ["1 click", "deep analysis"]];

export default function AuthPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(mode, f);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="noise relative flex flex-col overflow-hidden bg-[#0B0B0C] p-8 text-white sm:p-10">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full bg-violet-700/40 blur-[120px]" />
        <div className="relative"><Logo /></div>
        <div className="relative my-16 max-w-2xl lg:my-auto">
          <h1 className="fade-up text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Your personal AI sales employee for video editing.
          </h1>
          <p className="fade-up mt-6 max-w-md text-base text-zinc-400" style={{ animationDelay: "80ms" }}>
            Find leads, research deeply, auto generate outreach that books calls, and let every lead have its own AI memory.
          </p>
          <div className="mt-10 flex gap-8">
            {STATS.map(([big, small], i) => (
              <div key={big} className="fade-up" style={{ animationDelay: `${160 + i * 80}ms` }}>
                <p className="text-2xl font-bold">{big}</p>
                <p className="text-sm text-zinc-400">{small}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-zinc-500">Built for editors, freelancers and agencies.</p>
      </section>

      <section className="flex items-center justify-center bg-background p-8">
        <form onSubmit={submit} className="fade-up w-full max-w-sm space-y-5" data-testid="auth-form">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{mode === "login" ? "Sign in" : "Create account"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? "Welcome back. Enter your details below." : "Start finding clients in minutes."}
            </p>
          </div>
          {mode === "register" && (
            <div className="space-y-1.5"><Label>Name</Label>
              <Input data-testid="auth-name-input" className="h-11 bg-card" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name" />
            </div>
          )}
          <div className="space-y-1.5"><Label>Email</Label>
            <Input data-testid="auth-email-input" type="email" required className="h-11 bg-card" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5"><Label>Password</Label>
            <Input data-testid="auth-password-input" type="password" required minLength={6} className="h-11 bg-card" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" />
          </div>
          {error && <p data-testid="auth-error" className="text-sm text-red-600">{error}</p>}
          <Button data-testid="auth-submit-btn" disabled={busy} className="h-11 w-full rounded-xl">
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "No account? " : "Already have one? "}
            <button type="button" data-testid="auth-toggle-mode" className="font-medium text-violet-600 hover:underline"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
          <button type="button" data-testid="demo-admin-fill" onClick={() => setF({ ...f, email: "admin@outreach.ai", password: "Admin@123" })}
            className="w-full rounded-lg bg-muted py-3 text-xs text-muted-foreground transition-colors hover:bg-secondary">
            Demo admin: <code>admin@outreach.ai</code> / <code>Admin@123</code>
          </button>
        </form>
      </section>
    </div>
  );
}
