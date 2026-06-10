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

function cameraErrorMessage(raw: unknown): string {
  if (raw instanceof DOMException) {
    switch (raw.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Permissao da camera bloqueada. Libere o acesso nas configuracoes do navegador.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "Nenhuma camera foi encontrada neste dispositivo.";
      case "NotReadableError":
      case "TrackStartError":
        return "A camera esta em uso por outro app.";
      default:
        return raw.message || "Falha ao acessar camera.";
    }
  }

  return raw instanceof Error ? raw.message : "Falha ao acessar camera.";
}

export default function TabletClient() {
  const searchParams = useSearchParams();
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<TabletSessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

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

  async function iniciarTablet() {
    setSessionError(null);

    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador nao suporta acesso a camera.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      setStarted(true);
    } catch (err) {
      setSessionError(cameraErrorMessage(err));
    }
  }

  const headerText = useMemo(() => {
    if (!session) return "Tablet de ponto";
    return `${session.nome_dispositivo} - ${session.unidade_nome}`;
  }, [session]);

  if (loadingSession) {
    return (
      <div className="containerWide tabletShell">
        <div className="tabletStartPanel">
          <div className="tabletStartContent">
            <span className="statusBadge statusBadgeInfo">Iniciando</span>
            <h2>Preparando tablet</h2>
            <p>Validando o dispositivo e a unidade vinculada.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="containerWide tabletShell">
        <div className="tabletStartPanel">
          <div className="tabletStartContent">
            <span className="statusBadge statusBadgeDanger">Acesso bloqueado</span>
            <h2>Tablet indisponivel</h2>
            <p>{sessionError ?? "Nao foi possivel iniciar o tablet."}</p>
            <Link href="/login" className="btnLink secondary">
              Login admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="containerWide tabletShell">
      <div className="tabletHeader">
        <div>
          <p className="opsKicker">Terminal de ponto</p>
          <h1>Registro por tablet</h1>
          <div className="opsMetaRow">
            <span className="statusBadge statusBadgeOk">Tablet ativo</span>
            <span className="statusBadge statusBadgeNeutral">{headerText}</span>
          </div>
        </div>
        <div className="tabletActions">
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

      {!started ? (
        <div className="tabletStartPanel">
          <div className="tabletStartContent">
            <span className="statusBadge statusBadgeInfo">Pronto</span>
            <h2>Iniciar atendimento</h2>
            <p>Toque para abrir a camera e comecar o registro de ponto facial.</p>
            <button className="tabletStartButton" onClick={iniciarTablet}>Iniciar ponto</button>
          </div>
        </div>
      ) : (
        <CameraModal
          onClose={() => setStarted(false)}
          onCapture={onCapture}
          onConfirmPonto={onConfirmPonto}
          recognizing={recognizing}
          match={match}
          actionResult={actionResult}
          role="SUPERVISOR"
          hideCloseButton
        />
      )}
    </div>
  );
}
