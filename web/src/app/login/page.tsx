"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" focusable="false">
      <rect x="0" y="0" width="7" height="7" fill="#f25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7fba00" />
      <rect x="0" y="9" width="7" height="7" fill="#00a4ef" />
      <rect x="9" y="9" width="7" height="7" fill="#ffb900" />
    </svg>
  );
}

function prettyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Falha ao entrar";
  if (raw.includes("SUPABASE_CLIENT_NOT_CONFIGURED")) {
    return "Configuracao ausente: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const hasProcessedSupabaseSession = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);

  async function onMicrosoftLogin() {
    setLoadingMicrosoft(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/login`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { redirectTo }
      });
      if (signInError) throw signInError;
    } catch (err) {
      setError(prettyError(err));
      setLoadingMicrosoft(false);
    }
  }

  useEffect(() => {
    if (hasProcessedSupabaseSession.current) return;
    hasProcessedSupabaseSession.current = true;

    async function finalizeSupabaseLogin() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.access_token) return;

        setLoadingMicrosoft(true);
        const accessToken = data.session.access_token;
        const userEmail = data.session.user?.email ?? "";

        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "SUPABASE_AZURE",
            access_token: accessToken,
            email: userEmail
          })
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }

        await supabase.auth.signOut();
        router.push("/unidade");
      } catch (err) {
        setError(prettyError(err));
      } finally {
        setLoadingMicrosoft(false);
      }
    }

    void finalizeSupabaseLogin();
  }, [router]);

  return (
    <div className="authPage">
      <div className="container">
        <div className="card authCard">
          <h1>Login</h1>
          <p>
            <small className="muted">Entre com sua conta Microsoft corporativa.</small>
          </p>

          <div className="row">
            <button
              type="button"
              onClick={onMicrosoftLogin}
              disabled={loadingMicrosoft}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <MicrosoftIcon />
              <span>{loadingMicrosoft ? "Conectando..." : "Entrar com Microsoft"}</span>
            </button>
          </div>

          {error ? (
            <>
              <div className="spacer" />
              <div className="card" style={{ borderColor: "#8a1f1f" }}>
                Erro: {error}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
