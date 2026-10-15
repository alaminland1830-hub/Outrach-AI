import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  const signIn = async (mode, payload) => {
    const { data } = await api.post(`/auth/${mode}`, payload);
    localStorage.setItem("oa_token", data.token);
    setUser(data.user);
  };

  const signOut = async () => {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("oa_token");
    setUser(false);
  };

  return <AuthCtx.Provider value={{ user, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
