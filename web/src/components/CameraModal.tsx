"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/lib/faceTracking";

type Match = {
  matched: boolean;
  funcionario_id?: number;
  nome?: string;
  score?: number;
  unidade_id?: number | null;
  unidade_nome?: string | null;
};

function cameraErrorMessage(raw: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "A camera do celular exige HTTPS ou localhost. Em acesso por IP http, o navegador pode bloquear a permissao.";
  }

  if (raw instanceof DOMException) {
    switch (raw.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Permissao da camera bloqueada. Libere o acesso no navegador.";
      case "NotFoundError":
        return "Nenhuma camera foi encontrada neste dispositivo.";
      case "NotReadableError":
        return "A camera esta em uso por outro app.";
      default:
        return raw.message || "Falha ao acessar camera.";
    }
  }

  return raw instanceof Error ? raw.message : "Falha ao acessar camera.";
}

export default function CameraModal({
  onClose,
  onCapture,
  onConfirmPonto,
  recognizing,
  match,
  actionResult,
  role,
  hideCloseButton
}: {
  onClose: () => void;
  onCapture: (imageB64: string) => Promise<void> | void;
  onConfirmPonto?: () => Promise<void> | void;
  recognizing?: boolean;
  match?: Match | null;
  actionResult?: string | null;
  role: "ADMIN" | "SUPERVISOR";
  hideCloseButton?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { faceBox, engine } = useFaceTracking(videoRef);

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setError(cameraErrorMessage(err));
      }
    }
    start().catch(() => null);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function capture() {
    if (!videoRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const width = 640;
      const scale = width / (video.videoWidth || width);
      const height = Math.round((video.videoHeight || width) * scale);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponivel");
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const b64 = dataUrl.split(",")[1] ?? "";
      if (!b64) throw new Error("Falha ao capturar frame");
      await onCapture(b64);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao capturar");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPonto() {
    if (!match?.matched || !match.funcionario_id || !onConfirmPonto) return;
    setConfirming(true);
    setError(null);
    try {
      await onConfirmPonto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao confirmar ponto");
    } finally {
      setConfirming(false);
    }
  }

  const cardSide =
    faceBox && faceBox.leftPct + faceBox.widthPct > 68 ? "left" : "right";
  const cardLeftPct = faceBox
    ? cardSide === "right"
      ? Math.min(98, faceBox.leftPct + faceBox.widthPct + 2)
      : Math.max(2, faceBox.leftPct - 2)
    : 0;

  const unitLabel = match?.unidade_nome
    ? `Unidade: ${match.unidade_nome}`
    : match?.unidade_id
      ? `Unidade id=${match.unidade_id}`
      : "Unidade não informada";

  const cardText = match?.matched
    ? {
        kicker: "Identificacao",
        title: match.nome ?? "Usuario identificado",
        subtitle:
          role === "ADMIN"
            ? `${unitLabel} | score=${match.score?.toFixed(3) ?? "n/a"}`
            : unitLabel
      }
    : {
        kicker: "Cadastro facial",
        title: match ? "Nenhum match" : "Aponte para a camera",
        subtitle: "Foto frontal, boa iluminacao."
      };

  const cardToneClass = (() => {
    if (recognizing || busy) return "faceCard--busy";
    if (!match) return "faceCard--neutral";
    return match.matched ? "faceCard--ok" : "faceCard--bad";
  })();

  const stageStatusClass = (() => {
    if (!faceBox) return "videoStage--noface";
    if (recognizing || busy) return "videoStage--busy";
    if (match && !match.matched) return "videoStage--nomatch";
    return "videoStage--face";
  })();

  return (
    <div className="modalBackdrop cameraModalBackdrop" role="dialog" aria-modal="true">
      <div className="modal cameraModal">
        <div className="row cameraModalHeader">
          <h2>Camera</h2>
          {hideCloseButton ? null : (
            <button className="secondary" onClick={onClose}>
              Fechar
            </button>
          )}
        </div>
        <div className="spacer" />
        {error ? (
          <>
            <div className="card" style={{ borderColor: "#8a1f1f" }}>
              Erro: {error}
            </div>
            <div className="spacer" />
          </>
        ) : null}
        <div
          className={["videoStage", "cameraVideoStage", stageStatusClass].filter(Boolean).join(" ")}
        >
          <video ref={videoRef} autoPlay playsInline />
          {faceBox ? (
            <div
              className="faceBox"
              style={{
                left: `${faceBox.leftPct}%`,
                top: `${faceBox.topPct}%`,
                width: `${faceBox.widthPct}%`,
                height: `${faceBox.heightPct}%`
              }}
            />
          ) : (
            <div className="faceBox faceBox--placeholder" />
          )}

          {faceBox ? (
            <div
              className={["faceCard", cardToneClass].join(" ")}
              style={{
                left: `${cardLeftPct}%`,
                top: `${faceBox.topPct}%`,
                transform:
                  cardSide === "left"
                    ? "translate(calc(-100% - 12px), 0)"
                    : "translate(12px, 0)"
              }}
            >
              <div className="faceCardKicker">
                {recognizing || busy ? "Reconhecendo..." : cardText.kicker}
              </div>
              <div className="faceCardTitle">
                {recognizing || busy ? "Aguarde" : cardText.title}
              </div>
              <div className="faceCardSubtitle">
                {recognizing || busy ? "" : cardText.subtitle}
              </div>
            </div>
          ) : null}
        </div>
        <div className="spacer" />
        {actionResult ? (
          <>
            <div className="card cameraResultCard" aria-live="polite">
              {actionResult}
            </div>
            <div className="spacer" />
          </>
        ) : null}
        <div className="row cameraActions">
          <button onClick={capture} disabled={busy}>
            {busy ? "Enviando..." : "Capturar"}
          </button>
          {match?.matched && match.funcionario_id ? (
            <button
              className="secondary"
              onClick={confirmPonto}
              disabled={confirming || recognizing || busy}
            >
              {confirming ? "Confirmando..." : "Confirmar presença"}
            </button>
          ) : null}
          <small className="muted cameraHint">
            Dica: luz frontal + rosto centralizado.
            {engine === "loading" ? <> (Carregando detector...)</> : null}
            {engine === "none" ? <> (Deteccao de rosto indisponivel.)</> : null}
          </small>
        </div>
      </div>
    </div>
  );
}
