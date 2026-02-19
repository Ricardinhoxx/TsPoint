"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const hasProcessedSupabaseSession = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "LOCAL", email, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      router.push("/unidade");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

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
      setError(err instanceof Error ? err.message : "Falha ao iniciar login Microsoft");
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
        setError(err instanceof Error ? err.message : "Falha no login Microsoft");
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
            <small className="muted">
              Login local por email/senha ou Microsoft via Supabase + Azure Entra ID.
            </small>
          </p>

          <div className="row">
            <button type="button" onClick={onMicrosoftLogin} disabled={loading || loadingMicrosoft}>
              {loadingMicrosoft ? "Conectando Microsoft..." : "Entrar com Microsoft"}
            </button>
          </div>

          <div className="spacer" />

          <form onSubmit={onSubmit}>
            <label>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <div className="spacer" />
            <label>Senha</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="spacer" />
            <div className="row">
              <button type="submit" disabled={loading || loadingMicrosoft}>
                {loading ? "Entrando..." : "Entrar com email"}
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
          </form>
        </div>
      </div>
    </div>
  );
}
