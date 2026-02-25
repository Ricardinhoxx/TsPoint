"use client";

import Image from "next/image";
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
    return "Configuração ausente: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.";
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
      <div className="authBg" aria-hidden="true" />

      <div className="container authLayout">
        <section className="authIntro">
          <div className="authBrand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brandLogo brandLogoBemol" src="/brand/bemol-logo.svg" alt="Bemol" />
            <span className="brandDivider" aria-hidden="true" />
            <Image
              className="brandLogo brandLogoSodexo"
              src="/brand/sodexo-logo.png"
              alt="Sodexo"
              width={260}
              height={40}
              priority
            />
          </div>

          <h1 className="authTitle">Portal de Presença</h1>
          <p className="authSubtitle">
            Portal de registro de presença e reconhecimento facial. <span className="authAccent">Entre</span>{" "}
            com sua conta Microsoft corporativa.
          </p>
        </section>

        <div className="authStackDivider" aria-hidden="true" />

        <section className="card authCard">
          <h2 className="authCardTitle">Entrar</h2>
          <p className="authCardSubtitle">
            Use sua conta corporativa para acessar.
          </p>
          <div className="spacer" />

          <button
            type="button"
            onClick={onMicrosoftLogin}
            disabled={loadingMicrosoft}
            className="authMicrosoftBtn"
            aria-busy={loadingMicrosoft}
          >
            {loadingMicrosoft ? <span className="authSpinner" aria-hidden="true" /> : null}
            <MicrosoftIcon />
            <span>{loadingMicrosoft ? "Conectando..." : "Entrar com Microsoft"}</span>
          </button>

          {error ? (
            <>
              <div className="spacer" />
              <div className="card authErrorCard" aria-live="polite">
                Não foi possivel autenticar. {error}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
