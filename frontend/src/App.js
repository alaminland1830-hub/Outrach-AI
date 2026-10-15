import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import FindLeads from "@/pages/FindLeads";
import Pipeline from "@/pages/Pipeline";
import FollowUps from "@/pages/FollowUps";
import Pinned from "@/pages/Pinned";
import Assistant from "@/pages/Assistant";
import EditorProfile from "@/pages/EditorProfile";
import Analytics from "@/pages/Analytics";
import Connections from "@/pages/Connections";
import ApiManager from "@/pages/ApiManager";
import Settings from "@/pages/Settings";
import AdminPanel from "@/pages/AdminPanel";

function Protected({ children, admin }) {
  const { user } = useAuth();
  if (user === null) return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return children;
}

const PAGES = [
  ["/", Dashboard], ["/leads", Leads], ["/leads/:id", LeadDetail], ["/find", FindLeads], ["/pipeline", Pipeline],
  ["/follow-ups", FollowUps], ["/pinned", Pinned], ["/assistant", Assistant], ["/editor-profile", EditorProfile],
  ["/analytics", Analytics], ["/connections", Connections], ["/api-manager", ApiManager], ["/settings", Settings],
];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><AuthPage /></PublicOnly>} />
          {PAGES.map(([path, Page]) => <Route key={path} path={path} element={<Protected><Page /></Protected>} />)}
          <Route path="/admin" element={<Protected admin><AdminPanel /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </AuthProvider>
  );
}
