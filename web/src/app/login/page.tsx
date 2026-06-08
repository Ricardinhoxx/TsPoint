"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type AuthMode = "login" | "signup";

function prettyError(raw: unknown): string {
  const code = raw instanceof Error ? raw.message : String(raw ?? "");
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "E-mail ou senha inválidos.";
    case "TOO_MANY_ATTEMPTS":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "FORBIDDEN_ORIGIN":
      return "Origem bloqueada pelo backend. Verifique APP_URL/NEXT_PUBLIC_APP_URL.";
    case "AUTO_PROVISION_FAILED":
      return "Conta criada no Supabase, mas o app não conseguiu vincular uma unidade. Verifique o aprovisionamento automático.";
    case "SUPABASE_CLIENT_NOT_CONFIGURED":
      return "Supabase não configurado. Verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    case "SUPABASE_NOT_CONFIGURED":
      return "Backend sem SUPABASE_URL/SUPABASE_ANON_KEY.";
    case "HTTP 500":
      return "Não foi possível acessar o banco de dados. Verifique se o Postgres local está rodando.";
    default:
      return code || "Falha ao autenticar.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createSupabaseAppSession(accessToken: string, userEmail: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "SUPABASE_PASSWORD",
        access_token: accessToken,
        email: userEmail
      })
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  async function createLocalAppSession() {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "LOCAL",
        email,
        password
      })
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });
        if (signUpError) throw signUpError;

        if (!data.session?.access_token) {
          setMessage("Conta criada. Confirme seu e-mail e depois entre com sua senha.");
          return;
        }

        await createSupabaseAppSession(data.session.access_token, data.user?.email ?? email);
        await supabase.auth.signOut();
        router.push("/unidade");
        return;
      }

      await createLocalAppSession();
      router.push("/unidade");
    } catch (err) {
      setError(prettyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <div className="authBg" aria-hidden="true" />

      <div className="container authLayout">
        <section className="authIntro">
          <div className="authBrand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brandLogo brandLogoApp" src="/brand/app-logo-highlight.png" alt="Digitaliza Sodexo" />
          </div>

          <h1 className="authTitle">Registro de ponto</h1>
          <p className="authSubtitle">
            Sistema de registro de ponto e reconhecimento facial. <span className="authAccent">Entre</span>{" "}
            ou crie sua conta com e-mail e senha.
          </p>
        </section>

        <div className="authStackDivider" aria-hidden="true" />

        <section className="card authCard">
          <h2 className="authCardTitle">{mode === "login" ? "Entrar" : "Criar conta"}</h2>
          <p className="authCardSubtitle">
            {mode === "login" ? "Use sua conta cadastrada no Supabase." : "Cadastre uma nova conta no Supabase."}
          </p>
          <div className="spacer" />

          <div className="authModeSwitch" role="tablist" aria-label="Modo de autenticação">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError(null);
                setMessage(null);
              }}
              disabled={loading}
            >
              Entrar
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setError(null);
                setMessage(null);
              }}
              disabled={loading}
            >
              Criar conta
            </button>
          </div>

          <div className="spacer" />

          <form className="authForm" onSubmit={onSubmit}>
            <label className="authField">
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </label>

            <label className="authField">
              <span>Senha</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={6}
                required
              />
            </label>

            <button type="submit" disabled={loading} className="authSubmitBtn" aria-busy={loading}>
              {loading ? <span className="authSpinner" aria-hidden="true" /> : null}
              <span>
                {loading
                  ? mode === "login"
                    ? "Entrando..."
                    : "Criando..."
                  : mode === "login"
                    ? "Entrar"
                    : "Criar conta"}
              </span>
            </button>
          </form>

          {message ? (
            <>
              <div className="spacer" />
              <div className="card authInfoCard" aria-live="polite">
                {message}
              </div>
            </>
          ) : null}

          {error ? (
            <>
              <div className="spacer" />
              <div className="card authErrorCard" aria-live="polite">
                Não foi possível autenticar. {error}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
