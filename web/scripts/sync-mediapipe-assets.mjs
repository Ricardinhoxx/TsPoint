import { mkdir, access, copyFile, readdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const wasmSrcDir = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDstDir = path.join(ROOT, "public", "mediapipe", "wasm");
const modelDir = path.join(ROOT, "public", "mediapipe", "models");
const modelDst = path.join(modelDir, "blaze_face_short_range.tflite");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function copyWasmFiles() {
  await ensureDir(wasmDstDir);
  const files = await readdir(wasmSrcDir);
  const wasmFiles = files.filter((f) => f.endsWith(".js") || f.endsWith(".wasm"));

  await Promise.all(
    wasmFiles.map(async (name) => {
      await copyFile(path.join(wasmSrcDir, name), path.join(wasmDstDir, name));
    })
  );

  console.log(`[sync-mediapipe-assets] Copied ${wasmFiles.length} wasm assets.`);
}

async function ensureModel() {
  await ensureDir(modelDir);

  try {
    await access(modelDst, fsConstants.F_OK);
    console.log("[sync-mediapipe-assets] Model already present.");
    return;
  } catch {}

  const res = await fetch(modelUrl);
  if (!res.ok) {
    throw new Error(`Model download failed: HTTP ${res.status}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  await writeFile(modelDst, bytes);
  console.log(`[sync-mediapipe-assets] Downloaded model (${bytes.byteLength} bytes).`);
}

await copyWasmFiles();
await ensureModel();
