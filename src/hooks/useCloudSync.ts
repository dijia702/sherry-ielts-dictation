import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchCloudState, mergeCloudState, saveCloudState } from "../lib/cloudSync";
import { saveState } from "../lib/storage";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { PersistedState } from "../types";

export type CloudSyncStatus = "unconfigured" | "signed-out" | "syncing" | "synced" | "offline" | "error";

export function useCloudSync(
  persisted: PersistedState,
  setPersisted: Dispatch<SetStateAction<PersistedState>>,
) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudSyncStatus>(
    isSupabaseConfigured ? "signed-out" : "unconfigured",
  );
  const [message, setMessage] = useState("");
  const stateRef = useRef(persisted);
  const hydratedRef = useRef(false);
  stateRef.current = persisted;

  const applyIfChanged = useCallback(
    (nextState: PersistedState) => {
      const comparable = (state: PersistedState) => {
        const { cloudUpdatedAt: _cloudUpdatedAt, ...content } = state;
        return JSON.stringify(content);
      };
      if (comparable(stateRef.current) !== comparable(nextState)) {
        saveState(nextState);
        setPersisted(nextState);
      }
    },
    [setPersisted],
  );

  const synchronize = useCallback(async (activeSession = session) => {
    if (!supabase || !activeSession) return;
    setStatus("syncing");
    setMessage("");
    try {
      const remote = await fetchCloudState(activeSession.user.id);
      const merged = remote ? mergeCloudState(stateRef.current, remote) : stateRef.current;
      applyIfChanged(merged);
      const synced = await saveCloudState(activeSession.user.id, merged);
      applyIfChanged(synced);
      hydratedRef.current = true;
      setStatus("synced");
    } catch (error) {
      setStatus(navigator.onLine ? "error" : "offline");
      setMessage(error instanceof Error ? error.message : "同步失败，请稍后重试。");
    }
  }, [applyIfChanged, session]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setSession(data.session);
      if (data.session) void synchronize(data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      hydratedRef.current = false;
      if (!nextSession) {
        setStatus("signed-out");
        return;
      }
      void synchronize(nextSession);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [synchronize]);

  useEffect(() => {
    if (!session || !hydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          await saveCloudState(session.user.id, persisted);
          setStatus("synced");
        } catch (error) {
          setStatus(navigator.onLine ? "error" : "offline");
          setMessage(error instanceof Error ? error.message : "同步失败，请稍后重试。");
        }
      })();
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [persisted, session]);

  useEffect(() => {
    const onOnline = () => {
      if (session) void synchronize(session);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [session, synchronize]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: "尚未配置云同步。" };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    setMessage("登录链接已发送，请在同一台设备上打开邮件完成登录。");
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    hydratedRef.current = false;
    setSession(null);
    setStatus("signed-out");
    setMessage("");
  }, []);

  return {
    configured: isSupabaseConfigured,
    email: session?.user.email ?? null,
    status,
    message,
    signInWithEmail,
    signOut,
    synchronize,
  };
}
