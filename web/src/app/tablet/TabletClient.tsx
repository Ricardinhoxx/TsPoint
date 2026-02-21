"use client";

import { useEffect, useMemo, useState } from "react";
import CameraModal from "@/components/CameraModal";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type TabletSessionInfo = {
  access_id: number;
  unidade_id: number;
  unidade_nome: string;
  nome_dispositivo: string;
};

type Match = {
  matched: boolean;
  funcionario_id?: number;
  nome?: string;
  score?: number;
  unidade_id?: number | null;
  unidade_nome?: string | null;
};

function recognizeErrorMessage(raw: unknown): string {
  const code = String(raw ?? "").trim().toUpperCase();
  switch (code) {
    case "FACE_ENGINE_LOAD_FAILED":
      return "Servico facial indisponivel no momento. Tente novamente.";
    case "FACE_API_TIMEOUT":
      return "Tempo limite no reconhecimento facial. Tente novamente.";
    case "FACE_API_UNREACHABLE":
      return "Servico de reconhecimento indisponivel.";
    case "NO_FACE_DETECTED":
      return "Nenhum rosto detectado no frame.";
    default:
      return code || "Erro ao reconhecer rosto.";
  }
}

export default function TabletClient() {
  const searchParams = useSearchParams();
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<TabletSessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const token = searchParams.get("token");

  useEffect(() => {
    async function ensureSession() {
      setLoadingSession(true);
      setSessionError(null);
      try {
        if (token) {
          const loginRes = await fetch("/api/tablet/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const loginData = await loginRes.json().catch(() => null);
          if (!loginRes.ok) {
            throw new Error(loginData?.error ?? `HTTP ${loginRes.status}`);
          }
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/tablet");
          }
        }

        const res = await fetch("/api/tablet/session", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setSession((data?.tablet ?? null) as TabletSessionInfo | null);
      } catch (e) {
        const code = e instanceof Error ? e.message : "TABLET_UNAUTHENTICATED";
        setSessionError(
          code === "TABLET_UNAUTHENTICATED"
            ? "Link invalido ou expirado. Gere um novo link no Admin."
            : `Falha ao iniciar tablet: ${code}`
        );
      } finally {
        setLoadingSession(false);
      }
    }

    ensureSession().catch(() => null);
  }, [token]);

  async function onCapture(imageB64: string) {
    setRecognizing(true);
    setActionResult(null);
    setMatch(null);

    try {
      const res = await fetch("/api/face/recognize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image_b64: imageB64 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      setMatch(data);
      if (!data?.matched) {
        setActionResult("Nenhum match encontrado. Capture outro frame.");
      }
    } catch (err) {
      setMatch({ matched: false });
      const raw = err instanceof Error ? err.message : "Erro";
      setActionResult(`Erro: ${recognizeErrorMessage(raw)}`);
    } finally {
      setRecognizing(false);
    }
  }

  async function onConfirmPonto() {
    if (!match?.matched || !match.funcionario_id) return;
    setActionResult(null);
    const res = await fetch("/api/ponto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        funcionario_id: match.funcionario_id,
        score: match.score,
        device_info: { channel: "tablet", userAgent: navigator.userAgent },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setActionResult(`Erro: ${data?.error ?? `HTTP ${res.status}`}`);
      return;
    }

    const when = new Date(data.ponto.timestamp).toLocaleString();
    setActionResult(`Ponto registrado com sucesso: ${data.ponto.tipo} em ${when}.`);
    setTimeout(() => {
      setMatch(null);
      setActionResult(null);
    }, 1800);
  }

  async function encerrarTablet() {
    await fetch("/api/tablet/session", { method: "DELETE" }).catch(() => null);
    window.location.href = "/tablet";
  }

  const headerText = useMemo(() => {
    if (!session) return "Tablet de ponto";
    return `${session.nome_dispositivo} - ${session.unidade_nome}`;
  }, [session]);

  if (loadingSession) {
    return (
      <div className="containerWide">
        <div className="card">Preparando modo tablet...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="containerWide">
        <div className="card" style={{ borderColor: "#8a1f1f" }}>
          Erro: {sessionError ?? "Nao foi possivel iniciar o tablet."}
        </div>
      </div>
    );
  }

  return (
    <div className="containerWide">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Registro por tablet</h1>
          <small className="muted">{headerText}</small>
        </div>
        <div className="row">
          <Link href="/login" className="btnLink secondary">
            Login admin
          </Link>
          <button className="secondary" onClick={encerrarTablet}>
            Encerrar sessao
          </button>
        </div>
      </div>

      <div className="spacer" />
      {sessionError ? (
        <>
          <div className="card" style={{ borderColor: "#8a1f1f" }}>
            Erro: {sessionError}
          </div>
          <div className="spacer" />
        </>
      ) : null}

      <CameraModal
        onClose={() => null}
        onCapture={onCapture}
        onConfirmPonto={onConfirmPonto}
        recognizing={recognizing}
        match={match}
        actionResult={actionResult}
        role="SUPERVISOR"
        hideCloseButton
      />
    </div>
  );
}
