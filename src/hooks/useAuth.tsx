import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Participant = Tables<"participants">;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  participant: Participant | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: part }, { data: roles }] = await Promise.all([
      supabase.from("participants").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setParticipant(part ?? null);
    setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          loadProfile(sess.user.id);
        }, 0);
      } else {
        setParticipant(null);
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setParticipant(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, participant, isAdmin, loading, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
