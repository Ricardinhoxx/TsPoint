"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/lib/faceTracking";

type Props = {
  onClose: () => void;
  onEnroll: (imagesB64: string[]) => Promise<void> | void;
};

type Captured = { b64: string; dataUrl: string };

export default function FaceEnrollModal({ onClose, onEnroll }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<Captured[]>([]);

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
        setError(err instanceof Error ? err.message : "Falha ao acessar camera");
      }
    }
    start().catch(() => null);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function captureOne() {
    if (!videoRef.current) return;
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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const b64 = dataUrl.split(",")[1] ?? "";
      if (!b64) throw new Error("Falha ao capturar frame");
      setCaptured((prev) => {
        const next = [...prev, { b64, dataUrl }];
        return next.slice(0, 8);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao capturar");
    }
  }

  async function submitEnroll() {
    if (captured.length < 1) {
      setError("Capture pelo menos 1 foto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onEnroll(captured.map((c) => c.b64));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar base");
    } finally {
      setBusy(false);
    }
  }

  const stageStatusClass = (() => {
    if (!faceBox) return "videoStage--noface";
    if (busy) return "videoStage--busy";
    return "videoStage--face";
  })();

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Base facial</h2>
          <button className="secondary" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
        <small className="muted">
          Capture 3-6 fotos com pequenas variacoes (angulo/luz).{" "}
          {engine === "loading" ? <> (Carregando detector...)</> : null}
          {engine === "none" ? <> (Deteccao de rosto indisponivel.)</> : null}
        </small>

        <div className="spacer" />

        {error ? (
          <>
            <div className="card" style={{ borderColor: "#8a1f1f" }}>
              Erro: {error}
            </div>
            <div className="spacer" />
          </>
        ) : null}

        <div className={["videoStage", stageStatusClass].filter(Boolean).join(" ")}>
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
        </div>

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button onClick={captureOne} disabled={busy || captured.length >= 8}>
              Capturar foto ({captured.length}/8)
            </button>
            <button
              className="secondary"
              onClick={() => setCaptured([])}
              disabled={busy || captured.length === 0}
            >
              Limpar
            </button>
          </div>
          <button onClick={submitEnroll} disabled={busy || captured.length < 1}>
            {busy ? "Cadastrando..." : "Salvar base"}
          </button>
        </div>

        {captured.length ? (
          <>
            <div className="spacer" />
            <div className="row" style={{ flexWrap: "wrap" }}>
              {captured.map((c, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={c.dataUrl}
                  alt={`captura-${idx + 1}`}
                  style={{
                    width: 84,
                    height: 64,
                    objectFit: "cover",
                    border: "1px solid #d1d5db"
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
