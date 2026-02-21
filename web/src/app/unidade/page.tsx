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

type Unidade = { id: number; nome: string };

export default function MinhaUnidadePage() {
  const [unidade, setUnidade] = useState<Unidade | null>(null);
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
  const [manageResult, setManageResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [contextReady, setContextReady] = useState(false);

  const roleLabel = role === "ADMIN" ? "Administrador" : "Supervisor";
  const unidadeResponsavel = unidade?.nome ?? (role === "ADMIN" ? "Todas as unidades" : "Não definida");

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

    setRole((u?.role === "ADMIN" ? "ADMIN" : "SUPERVISOR") as "ADMIN" | "SUPERVISOR");
    setUnidade(u?.unidade ?? null);
    setContextReady(true);
  }

  const loadFuncionarios = useCallback(async () => {
    if (!contextReady) return;

    const query = role === "ADMIN" && unidade?.id ? `?unidade_id=${unidade.id}` : "";
    const fRes = await fetch(`/api/funcionarios${query}`);
    if (fRes.status === 401) {
      window.location.href = "/login";
      return;
    }

    const f = await fRes.json().catch(() => null);
    if (!fRes.ok) {
      setLoadError(f?.error ?? `Erro ao carregar funcionários (HTTP ${fRes.status})`);
      return;
    }

    setFuncionarios(Array.isArray(f.funcionarios) ? f.funcionarios : []);
  }, [contextReady, role, unidade?.id]);

  useEffect(() => {
    loadContext().catch(() => null);
  }, []);

  useEffect(() => {
    loadFuncionarios().catch(() => null);
  }, [loadFuncionarios]);

  async function onCapture(imageB64: string) {
    setRecognizing(true);
    setPontoResult(null);
    setMatch(null);

    try {
      const payload: { image_b64: string; unidade_id?: number } = {
        image_b64: imageB64
      };

      if (role === "ADMIN") {
        if (!unidade?.id) throw new Error("UNIDADE_NAO_CONFIGURADA");
        payload.unidade_id = unidade.id;
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
      `Ponto registrado: ${data.ponto.tipo} em ${new Date(data.ponto.timestamp).toLocaleString()}`
    );
    await loadFuncionarios().catch(() => null);
  }

  function deleteErrorMessage(raw: unknown): string {
    const code = String(raw ?? "").trim().toUpperCase();
    switch (code) {
      case "FORBIDDEN_ADMIN_ONLY":
        return "Apenas administradores podem apagar colaboradores.";
      case "FUNCIONARIO_HAS_PONTO":
        return "Não é possível apagar colaborador com pontos registrados.";
      case "FUNCIONARIO_NOT_FOUND":
        return "Colaborador não encontrado.";
      case "INVALID_FUNCIONARIO":
        return "Colaborador inválido.";
      default:
        return code || "Falha ao apagar colaborador.";
    }
  }

  async function deleteFuncionario(f: Funcionario) {
    if (role !== "ADMIN") return;

    setManageResult(null);
    setPendingDeleteId(null);
    setDeletingId(f.id);
    try {
      const res = await fetch(`/api/funcionarios?id=${f.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setManageResult(`Colaborador ${f.nome} apagado com sucesso.`);
      await loadFuncionarios().catch(() => null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Falha ao apagar colaborador";
      setManageResult(`Erro: ${deleteErrorMessage(raw)}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div>
      <section className="hero">
        <div className="containerWide">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0 }}>Minha unidade</h1>
              <div>
                <small className="muted">Função: {roleLabel}</small>
              </div>
              <div>
                <small className="muted">
                  Unidade responsável: {unidadeResponsavel}
                  {unidade?.id ? ` (id=${unidade.id})` : ""}
                </small>
              </div>
            </div>

            <div className="row">
              <div className="brandLockup" aria-label="Parceria Bemol e Sodexo">
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
                  Admin: atribuições
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
          {manageResult ? (
            <>
              <div className="card">{manageResult}</div>
              <div className="spacer" />
            </>
          ) : null}
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Turno</th>
                  <th>Local</th>
                  <th>Status</th>
                  {role === "ADMIN" ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.turno}</td>
                    <td>{f.local_tipo}</td>
                    <td>{f.status}</td>
                    {role === "ADMIN" ? (
                      <td>
                        {pendingDeleteId === f.id ? (
                          <div className="row" style={{ gap: 8 }}>
                            <small className="muted">Deseja mesmo prosseguir com a exclusão?</small>
                            <button
                              className="secondary"
                              onClick={() => setPendingDeleteId(null)}
                              disabled={deletingId === f.id}
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => deleteFuncionario(f)}
                              disabled={deletingId === f.id}
                            >
                              {deletingId === f.id ? "Apagando..." : "Prosseguir exclusão"}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() => setPendingDeleteId(f.id)}
                            disabled={Boolean(deletingId)}
                          >
                            Apagar
                          </button>
                        )}
                      </td>
                    ) : null}
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
                  <small className="muted">(score={match.score?.toFixed(3) ?? "n/a"})</small>
                </p>
                <button onClick={confirmPonto}>Confirmar ponto</button>
              </>
            ) : (
              <p>Nenhum match acima do limiar.</p>
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
