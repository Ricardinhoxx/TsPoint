"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
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

  return (
    <div className="authPage">
      <div className="container">
        <div className="card authCard">
          <h1>Login</h1>
          <p>
            <small className="muted">
              MVP: autenticação por email/senha (tabela <code>supervisor</code>).
            </small>
          </p>
          <form onSubmit={onSubmit}>
            <div className="spacer" />
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
              <button type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
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
