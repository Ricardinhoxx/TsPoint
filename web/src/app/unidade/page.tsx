"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CameraModal from "@/components/CameraModal";
import Image from "next/image";
import Link from "next/link";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";
type Funcionario = {
  id: number;
  nome: string;
  turno: number;
  local_tipo: LocalTipo;
  status: string;
};

export default function MinhaUnidadePage() {
  const [unidade, setUnidade] = useState<{ id: number; nome: string } | null>(
    null
  );
  const [unidades, setUnidades] = useState<Array<{ id: number; nome: string }>>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<number | null>(null);
  const [contextReady, setContextReady] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "SUPERVISOR">("SUPERVISOR");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [match, setMatch] = useState<{
    matched: boolean;
    funcionario_id?: number;
    nome?: string;
    score?: number;
  } | null>(null);
  const [pontoResult, setPontoResult] = useState<string | null>(null);
  const roleLabel = role === "ADMIN" ? "Administrador" : "Supervisor";
  const unidadeResponsavel =
    unidade?.nome ?? (role === "ADMIN" ? "Selecione uma unidade" : "Nao definida");

  const matchedFuncionario = useMemo(() => {
    if (!match?.matched || !match.funcionario_id) return null;
    return funcionarios.find((f) => f.id === match.funcionario_id) ?? null;
  }, [funcionarios, match]);

  async function loadContext() {
    setLoadError(null);
    const uRes = await fetch("/api/unidade/me");
    if (uRes.status === 401) {
      window.location.href = "/login";
      return;
    }
    const u = await uRes.json().catch(() => null);
    if (!uRes.ok) {
      setLoadError(u?.error ?? `Erro ao carregar unidade (HTTP ${uRes.status})`);
      return;
    }

    const isAdmin = u?.role === "ADMIN";
    setRole((isAdmin ? "ADMIN" : "SUPERVISOR") as "ADMIN" | "SUPERVISOR");

    if (isAdmin) {
      const list = Array.isArray(u?.unidades)
        ? (u.unidades as Array<{ id: number; nome: string }>)
        : [];
      setUnidades(list);
      const defaultUnidade = u?.unidade ?? list[0] ?? null;
      setUnidade(defaultUnidade);
      setSelectedUnidadeId(defaultUnidade?.id ?? null);
    } else {
      setUnidades([]);
      setUnidade(u.unidade ?? null);
      setSelectedUnidadeId(u?.unidade?.id ?? null);
    }

    setContextReady(true);
  }

  const loadFuncionarios = useCallback(async () => {
    if (!contextReady) return;
    const query =
      role === "ADMIN" && selectedUnidadeId
        ? `?unidade_id=${selectedUnidadeId}`
        : "";

    const fRes = await fetch(`/api/funcionarios${query}`);
    if (fRes.status === 401) {
      window.location.href = "/login";
      return;
    }
    const f = await fRes.json().catch(() => null);
    if (!fRes.ok) {
      setLoadError(
        f?.error ?? `Erro ao carregar funcionários (HTTP ${fRes.status})`
      );
      return;
    }
    setFuncionarios(Array.isArray(f.funcionarios) ? f.funcionarios : []);
  }, [contextReady, role, selectedUnidadeId]);

  useEffect(() => {
    loadContext().catch(() => null);
  }, []);

  useEffect(() => {
    loadFuncionarios().catch(() => null);
  }, [loadFuncionarios]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    const selected =
      unidades.find((item) => item.id === selectedUnidadeId) ?? null;
    if (selected) {
      setUnidade(selected);
    }
  }, [role, selectedUnidadeId, unidades]);

  async function onCapture(imageB64: string) {
    setRecognizing(true);
    setPontoResult(null);
    setMatch(null);
    try {
      const payload: { image_b64: string; unidade_id?: number } = {
        image_b64: imageB64
      };
      if (role === "ADMIN") {
        if (!selectedUnidadeId) {
          throw new Error("SELECIONE_UNIDADE");
        }
        payload.unidade_id = selectedUnidadeId;
      }

      const res = await fetch("/api/face/recognize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMatch(data);
    } catch (err) {
      setMatch({ matched: false });
      setPontoResult(err instanceof Error ? `Erro: ${err.message}` : "Erro");
    } finally {
      setRecognizing(false);
    }
  }

  async function confirmPonto() {
    if (!match?.matched || !match.funcionario_id) return;
    setPontoResult(null);
    const res = await fetch("/api/ponto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        funcionario_id: match.funcionario_id,
        score: match.score,
        device_info: { userAgent: navigator.userAgent }
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setPontoResult(`Erro: ${data?.error ?? `HTTP ${res.status}`}`);
      return;
    }
    setPontoResult(
      `Ponto registrado: ${data.ponto.tipo} em ${new Date(
        data.ponto.timestamp
      ).toLocaleString()}`
    );
    await loadFuncionarios().catch(() => null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div>
      <section className="hero">
        <div className="containerWide">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ margin: 0 }}>Minha unidade</h1>
              <div>
                <small className="muted">Funcao: {roleLabel}</small>
              </div>
              <div>
                <small className="muted">
                  Unidade responsavel: {unidadeResponsavel}
                  {unidade?.id ? ` (id=${unidade.id})` : ""}
                </small>
              </div>
            </div>

            <div className="row">
              {role === "ADMIN" ? (
                <select
                  value={selectedUnidadeId ?? ""}
                  onChange={(e) => setSelectedUnidadeId(Number(e.target.value) || null)}
                  style={{ minWidth: 220 }}
                  aria-label="Selecionar unidade para operacao"
                >
                  {unidades.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} (id={item.id})
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="brandLockup" aria-label="Parceria Bemol e Sodexo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="brandLogo brandLogoBemol"
                  src="/brand/bemol-logo.svg"
                  alt="Bemol"
                />
                <span className="brandDivider" aria-hidden="true" />
                <Image
                  className="brandLogo brandLogoSodexo"
                  src="/brand/sodexo-logo.png"
                  alt="Sodexo"
                  width={280}
                  height={42}
                  priority
                />
              </div>

              <button className="secondary" onClick={logout}>
                Sair
              </button>
            </div>
          </div>

          <div className="spacer" />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Usuários</h2>
            <div className="row">
              {role === "ADMIN" ? (
                <Link className="btnLink secondary" href="/unidade/admin">
                  Admin: atribuicoes
                </Link>
              ) : null}
              <Link className="btnLink secondary" href="/unidade/cadastrar">
                Cadastrar colaborador
              </Link>
              <Link className="btnLink secondary" href="/unidade/presenca">
                Presença
              </Link>
              <button onClick={() => setCameraOpen(true)}>Registrar por câmera</button>
            </div>
          </div>

          <div className="spacer" />
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Turno</th>
                  <th>Local</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.turno}</td>
                    <td>{f.local_tipo}</td>
                    <td>{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Último reconhecimento</h2>
          {loadError ? (
            <>
              <div className="card" style={{ borderColor: "#b91c1c" }}>
                Erro: {loadError}
              </div>
              <div className="spacer" />
            </>
          ) : null}
          {recognizing ? (
            <p>Reconhecendo...</p>
          ) : match ? (
            match.matched ? (
              <>
                <p>
                  Match: <b>{match.nome ?? matchedFuncionario?.nome ?? "?"}</b>{" "}
                  <small className="muted">
                    (score={match.score?.toFixed(3) ?? "n/a"})
                  </small>
                </p>
                <button onClick={confirmPonto}>Confirmar ponto</button>
              </>
            ) : (
              <p>Nenhum match acima do threshold.</p>
            )
          ) : (
            <p>
              <small className="muted">Abra a câmera e capture um frame.</small>
            </p>
          )}
          {pontoResult ? (
            <>
              <div className="spacer" />
              <div className="card">{pontoResult}</div>
            </>
          ) : null}
        </div>

        {cameraOpen ? (
          <CameraModal
            onClose={() => setCameraOpen(false)}
            onCapture={onCapture}
            recognizing={recognizing}
            match={match}
          />
        ) : null}
      </div>
    </div>
  );
}
