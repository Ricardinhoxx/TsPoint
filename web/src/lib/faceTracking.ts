"use client";

import { useEffect, useRef, useState } from "react";

export type FaceBoxPct = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export type FaceTrackingEngine = "native" | "mediapipe" | "none" | "loading";

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function useFaceTracking(videoRef: React.RefObject<HTMLVideoElement>) {
  const [engine, setEngine] = useState<FaceTrackingEngine>("loading");
  const [faceBox, setFaceBox] = useState<FaceBoxPct | null>(null);
  const detectorRef = useRef<any>(null);
  const engineRef = useRef<FaceTrackingEngine>("loading");

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let lastRun = 0;

    async function init() {
      // Prefer native FaceDetector if available (fast, no extra download)
      const FaceDetectorCtor = (globalThis as any).FaceDetector as
        | (new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
            detect: (image: CanvasImageSource) => Promise<
              {
                boundingBox: { x: number; y: number; width: number; height: number };
              }[]
            >;
          })
        | undefined;

      if (FaceDetectorCtor) {
        detectorRef.current = new FaceDetectorCtor({
          maxDetectedFaces: 1,
          fastMode: true
        });
        engineRef.current = "native";
        setEngine("native");
        return;
      }

      // Fallback: MediaPipe Tasks Vision (works in Chrome/Edge and most Chromium)
      try {
        setEngine("loading");
        const tasks = await import("@mediapipe/tasks-vision");
        const vision = await tasks.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );
        detectorRef.current = await tasks.FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
          },
          runningMode: "VIDEO"
        } as any);
        engineRef.current = "mediapipe";
        setEngine("mediapipe");
      } catch {
        detectorRef.current = null;
        engineRef.current = "none";
        setEngine("none");
      }
    }

    const tick = async (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (cancelled) return;
      if (ts - lastRun < 160) return;
      lastRun = ts;

      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      try {
        if (engineRef.current === "native") {
          const faces = (await detector.detect(video)) as Array<{
            boundingBox: { x: number; y: number; width: number; height: number };
          }>;
          const face = faces?.[0];
          if (!face) {
            setFaceBox(null);
            return;
          }
          const b = face.boundingBox;
          setFaceBox({
            leftPct: clampPct((b.x / vw) * 100),
            topPct: clampPct((b.y / vh) * 100),
            widthPct: clampPct((b.width / vw) * 100),
            heightPct: clampPct((b.height / vh) * 100)
          });
          return;
        }

        if (engineRef.current === "mediapipe") {
          const result = detector.detectForVideo(video, ts) as any;
          const det = result?.detections?.[0];
          const bb = det?.boundingBox;
          const x = bb?.originX ?? null;
          const y = bb?.originY ?? null;
          const w = bb?.width ?? null;
          const h = bb?.height ?? null;
          if (x == null || y == null || w == null || h == null) {
            setFaceBox(null);
            return;
          }
          setFaceBox({
            leftPct: clampPct((x / vw) * 100),
            topPct: clampPct((y / vh) * 100),
            widthPct: clampPct((w / vw) * 100),
            heightPct: clampPct((h / vh) * 100)
          });
        }
      } catch {
        setFaceBox(null);
      }
    };

    init()
      .catch(() => {
        detectorRef.current = null;
        engineRef.current = "none";
        setEngine("none");
      })
      .finally(() => {
        raf = requestAnimationFrame(tick);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      detectorRef.current = null;
    };
  }, [videoRef]);

  return { engine, faceBox };
}
