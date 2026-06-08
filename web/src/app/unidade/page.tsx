"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CameraModal from "@/components/CameraModal";
import Link from "next/link";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";

type Funcionario = {
  id: number;
  nome: string;
  turno: number;
  local_tipo: LocalTipo;
  unidade_id: number;
  unidade_nome?: string;
  status: string;
  face_embeddings?: number;
  hora_entrada_prevista?: string | null;
  hora_saida_prevista?: string | null;
};

type PontoItem = {
  id: number;
  funcionario_id: number;
  tipo: "ENTRADA" | "SAIDA";
  timestamp: string;
  score: number | null;
  unidade_id: number;
};

type DiaristaTipo = "SUBSTITUICAO" | "DEMANDA";

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
    unidade_id?: number | null;
    unidade_nome?: string | null;
  } | null>(null);
  const [pontoResult, setPontoResult] = useState<string | null>(null);
  const [manageResult, setManageResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [contextReady, setContextReady] = useState(false);
  const [diaristaOpen, setDiaristaOpen] = useState(false);
  const [diaristaNome, setDiaristaNome] = useState("");
  const [diaristaTipo, setDiaristaTipo] = useState<DiaristaTipo>("SUBSTITUICAO");
  const [diaristaSubstituidoId, setDiaristaSubstituidoId] = useState<number | null>(null);
  const [diaristaObservacao, setDiaristaObservacao] = useState("");
  const [diaristaResult, setDiaristaResult] = useState<string | null>(null);
  const [savingDiarista, setSavingDiarista] = useState(false);
  const [ajusteFuncionarioId, setAjusteFuncionarioId] = useState<number | null>(null);
  const [ajusteMes, setAjusteMes] = useState<string>(() => toMonthOnly(new Date()));
  const [ajusteNomeBusca, setAjusteNomeBusca] = useState("");
  const [ajustePontos, setAjustePontos] = useState<PontoItem[]>([]);
  const [ajusteLoading, setAjusteLoading] = useState(false);
  const [ajusteError, setAjusteError] = useState<string | null>(null);
  const [ajusteResult, setAjusteResult] = useState<string | null>(null);
  const [editingPontoId, setEditingPontoId] = useState<number | null>(null);
  const [editTipo, setEditTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [editTimestamp, setEditTimestamp] = useState("");
  const [editMotivo, setEditMotivo] = useState("");

  const roleLabel = role === "ADMIN" ? "Administrador" : "Supervisor";
  const unidadeResponsavel = unidade?.nome ?? (role === "ADMIN" ? "Todas as unidades" : "Não definida");

  const matchedFuncionario = useMemo(() => {
    if (!match?.matched || !match.funcionario_id) return null;
    return funcionarios.find((f) => f.id === match.funcionario_id) ?? null;
  }, [funcionarios, match]);

  const funcionariosFiltradosAjuste = useMemo(() => {
    const term = ajusteNomeBusca.trim().toLowerCase();
    if (!term) return funcionarios;
    return funcionarios.filter((f) => f.nome.toLowerCase().includes(term));
  }, [funcionarios, ajusteNomeBusca]);

  function recognizeErrorMessage(raw: unknown): string {
    const code = String(raw ?? "").trim().toUpperCase();
    switch (code) {
      case "FACE_ENGINE_LOAD_FAILED":
        return "Serviço facial indisponível no momento. Tente novamente em alguns instantes.";
      case "FACE_API_TIMEOUT":
        return "Tempo limite do reconhecimento facial. Tente novamente.";
      case "FACE_API_UNREACHABLE":
        return "Serviço de reconhecimento não está acessível no momento.";
      case "NO_FACE_DETECTED":
        return "Nenhum rosto detectado na captura.";
      default:
        return code || "Erro ao reconhecer rosto.";
    }
  }

  function toMonthOnly(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function toLocalDateTimeInput(rawIso: string): string {
    const d = new Date(rawIso);
    const offsetMs = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
  }

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

    const nextRole = (u?.role === "ADMIN" ? "ADMIN" : "SUPERVISOR") as "ADMIN" | "SUPERVISOR";
    setRole(nextRole);
    setUnidade(nextRole === "ADMIN" ? null : (u?.unidade ?? null));
    setContextReady(true);
  }

  const loadFuncionarios = useCallback(async () => {
    if (!contextReady) return;

    const query = role === "ADMIN" ? "" : unidade?.id ? `?unidade_id=${unidade.id}` : "";
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
      const payload: { image_b64: string } = {
        image_b64: imageB64
      };

      const res = await fetch("/api/face/recognize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMatch(data);
      if (!data?.matched) {
        setPontoResult("Nenhum match. Verifique se o colaborador possui base facial cadastrada.");
      }
    } catch (err) {
      setMatch({ matched: false });
      const raw = err instanceof Error ? err.message : "Erro";
      setPontoResult(`Erro: ${recognizeErrorMessage(raw)}`);
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

  useEffect(() => {
    if (!funcionarios.length) {
      setAjusteFuncionarioId(null);
      return;
    }
    if (!ajusteFuncionarioId || !funcionarios.some((f) => f.id === ajusteFuncionarioId)) {
      setAjusteFuncionarioId(funcionarios[0].id);
    }
  }, [funcionarios, ajusteFuncionarioId]);

  async function registrarDiarista() {
    const nome = diaristaNome.trim();
    if (nome.length < 2) {
      setDiaristaResult("Erro: informe o nome do diarista.");
      return;
    }
    if (diaristaTipo === "SUBSTITUICAO" && !diaristaSubstituidoId) {
      setDiaristaResult("Erro: selecione o colaborador substituído.");
      return;
    }

    setSavingDiarista(true);
    setDiaristaResult(null);
    try {
      const res = await fetch("/api/diaristas/presenca", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome_diarista: nome,
          tipo: diaristaTipo,
          funcionario_substituido_id: diaristaTipo === "SUBSTITUICAO" ? diaristaSubstituidoId : null,
          observacao: diaristaObservacao.trim() || null
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setDiaristaResult("Presença de diarista registrada com sucesso.");
      setDiaristaNome("");
      setDiaristaTipo("SUBSTITUICAO");
      setDiaristaSubstituidoId(null);
      setDiaristaObservacao("");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Falha ao registrar diarista";
      setDiaristaResult(`Erro: ${raw}`);
    } finally {
      setSavingDiarista(false);
    }
  }

  async function carregarPontosAjuste() {
    if (!ajusteFuncionarioId) return;
    setAjusteLoading(true);
    setAjusteError(null);
    setAjusteResult(null);
    setEditingPontoId(null);
    try {
      const res = await fetch(
        `/api/ponto?funcionario_id=${ajusteFuncionarioId}&month=${encodeURIComponent(ajusteMes)}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setAjustePontos(Array.isArray(data?.pontos) ? data.pontos : []);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Falha ao carregar pontos";
      setAjusteError(raw);
      setAjustePontos([]);
    } finally {
      setAjusteLoading(false);
    }
  }

  function onChangeBuscaColaborador(raw: string) {
    setAjusteNomeBusca(raw);
    const term = raw.trim().toLowerCase();
    if (!term) return;
    const exact = funcionarios.find((f) => f.nome.trim().toLowerCase() === term);
    if (exact) setAjusteFuncionarioId(exact.id);
  }

  function iniciarEdicaoPonto(p: PontoItem) {
    setEditingPontoId(p.id);
    setEditTipo(p.tipo);
    setEditTimestamp(toLocalDateTimeInput(p.timestamp));
    setEditMotivo("");
  }

  async function salvarEdicaoPonto() {
    if (!editingPontoId) return;
    const timestampIso = editTimestamp ? new Date(editTimestamp).toISOString() : null;
    const res = await fetch(`/api/ponto/${editingPontoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tipo: editTipo,
        timestamp: timestampIso,
        motivo: editMotivo.trim() || null
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setAjusteError(data?.error ?? `HTTP ${res.status}`);
      return;
    }
    setAjusteResult("Ponto atualizado com sucesso.");
    setEditingPontoId(null);
    await carregarPontosAjuste();
  }

  async function excluirPonto(pontoId: number) {
    const ok = window.confirm("Deseja excluir este registro de ponto?");
    if (!ok) return;
    const motivo = window.prompt("Motivo da exclusão (opcional):") ?? "";
    const res = await fetch(`/api/ponto/${pontoId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ motivo })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setAjusteError(data?.error ?? `HTTP ${res.status}`);
      return;
    }
    setAjusteResult("Ponto excluído com sucesso.");
    if (editingPontoId === pontoId) setEditingPontoId(null);
    await carregarPontosAjuste();
  }

  function deleteErrorMessage(raw: unknown): string {
    const code = String(raw ?? "").trim().toUpperCase();
    switch (code) {
      case "FORBIDDEN_ADMIN_ONLY":
        return "Apenas administradores podem apagar colaboradores.";
      case "FUNCIONARIO_HAS_PONTO":
        return "Colaborador possui pontos. Use a exclusão definitiva para apagar também o histórico.";
      case "FUNCIONARIO_NOT_FOUND":
        return "Colaborador não encontrado.";
      case "INVALID_FUNCIONARIO":
        return "Colaborador inválido.";
      default:
        return code || "Falha ao apagar colaborador.";
    }
  }

  async function deleteFuncionario(f: Funcionario, purge = false) {
    if (role !== "ADMIN") return;

    setManageResult(null);
    setPendingDeleteId(null);
    setDeletingId(f.id);
    try {
      const res = await fetch(`/api/funcionarios?id=${f.id}${purge ? "&purge=1" : ""}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (purge) {
        setManageResult(
          `Colaborador ${f.nome} excluído definitivamente. Pontos apagados: ${Number(data?.deleted_pontos ?? 0)}.`
        );
      } else {
        setManageResult(`Colaborador ${f.nome} apagado com sucesso.`);
      }
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
              <div className="brandLockup" aria-label="Bemol">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="brandLogo brandLogoApp" src="/brand/app-logo-highlight.png" alt="Digitaliza Sodexo" />
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
              <button className="secondary" onClick={() => setDiaristaOpen(true)}>
                Registrar diarista
              </button>
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
                  <th>Horário previsto</th>
                  <th>Loja (cadastro)</th>
                  <th>Status</th>
                  <th>Base facial</th>
                  {role === "ADMIN" ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.turno}</td>
                    <td>
                      {(f.hora_entrada_prevista || "--:--")} - {(f.hora_saida_prevista || "--:--")}
                    </td>
                    <td>
                      <span className="storeChip">{f.unidade_nome ?? "Loja não definida"}</span>{" "}
                      {role === "ADMIN" ? (
                        <small className="muted">id={f.unidade_id}</small>
                      ) : null}
                    </td>
                    <td>{f.status}</td>
                    <td>{(f.face_embeddings ?? 0) > 0 ? `Cadastrada (${f.face_embeddings})` : "Não cadastrada"}</td>
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
                              {deletingId === f.id ? "Apagando..." : "Excluir padrão"}
                            </button>
                            <button
                              onClick={() => deleteFuncionario(f, true)}
                              disabled={deletingId === f.id}
                            >
                              {deletingId === f.id ? "Apagando..." : "Excluir definitivo"}
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
                  <small className="muted">
                    (unidade: {match.unidade_nome ?? (match.unidade_id ? `id=${match.unidade_id}` : "n/a")}
                    {role === "ADMIN" ? ` | score=${match.score?.toFixed(3) ?? "n/a"}` : ""})
                  </small>
                </p>
                <button onClick={confirmPonto}>Confirmar presença</button>
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

        <div className="spacer" />

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ajuste manual de ponto</h2>
          <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label>Buscar colaborador</label>
              <input
                list="ajuste-colaboradores"
                value={ajusteNomeBusca}
                onChange={(e) => onChangeBuscaColaborador(e.target.value)}
                placeholder="Digite o nome..."
              />
              <datalist id="ajuste-colaboradores">
                {funcionarios.map((f) => (
                  <option key={`nome-${f.id}`} value={f.nome} />
                ))}
              </datalist>
            </div>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label>Colaborador (lista)</label>
              <select
                value={ajusteFuncionarioId ? String(ajusteFuncionarioId) : ""}
                onChange={(e) => setAjusteFuncionarioId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Selecione...</option>
                {funcionariosFiltradosAjuste.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Mês</label>
              <input type="month" value={ajusteMes} onChange={(e) => setAjusteMes(e.target.value)} />
            </div>
            <button onClick={carregarPontosAjuste} disabled={!ajusteFuncionarioId || ajusteLoading}>
              {ajusteLoading ? "Carregando..." : "Carregar pontos"}
            </button>
          </div>

          {ajusteError ? (
            <>
              <div className="spacer" />
              <div className="card" style={{ borderColor: "#8a1f1f" }}>
                Erro: {ajusteError}
              </div>
            </>
          ) : null}
          {ajusteResult ? (
            <>
              <div className="spacer" />
              <div className="card" style={{ borderColor: "#16a34a" }}>
                {ajusteResult}
              </div>
            </>
          ) : null}

          <div className="spacer" />
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Data/hora</th>
                  <th>Score</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {ajustePontos.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Sem pontos para os filtros selecionados.</td>
                  </tr>
                ) : (
                  ajustePontos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>
                        {editingPontoId === p.id ? (
                          <select
                            value={editTipo}
                            onChange={(e) => setEditTipo(e.target.value as "ENTRADA" | "SAIDA")}
                          >
                            <option value="ENTRADA">ENTRADA</option>
                            <option value="SAIDA">SAIDA</option>
                          </select>
                        ) : (
                          p.tipo
                        )}
                      </td>
                      <td>
                        {editingPontoId === p.id ? (
                          <input
                            type="datetime-local"
                            value={editTimestamp}
                            onChange={(e) => setEditTimestamp(e.target.value)}
                          />
                        ) : (
                          new Date(p.timestamp).toLocaleString()
                        )}
                      </td>
                      <td>{p.score ?? "-"}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          {editingPontoId === p.id ? (
                            <>
                              <input
                                placeholder="Motivo (opcional)"
                                value={editMotivo}
                                onChange={(e) => setEditMotivo(e.target.value)}
                              />
                              <button onClick={salvarEdicaoPonto}>Salvar</button>
                              <button className="secondary" onClick={() => setEditingPontoId(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="secondary" onClick={() => iniciarEdicaoPonto(p)}>
                                Editar
                              </button>
                              <button className="secondary" onClick={() => excluirPonto(p.id)}>
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {cameraOpen ? (
          <CameraModal
            onClose={() => setCameraOpen(false)}
            onCapture={onCapture}
            onConfirmPonto={confirmPonto}
            recognizing={recognizing}
            match={match}
            actionResult={pontoResult}
            role={role}
          />
        ) : null}

        {diaristaOpen ? (
          <div className="modalBackdrop">
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Registrar presença de diarista"
              style={{ width: "min(620px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Registrar presença de diarista</h2>
                <button className="secondary" onClick={() => setDiaristaOpen(false)}>
                  Fechar
                </button>
              </div>

              <div className="spacer" />
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label>Nome do diarista</label>
                  <input value={diaristaNome} onChange={(e) => setDiaristaNome(e.target.value)} />
                </div>

                <div>
                  <label>Tipo de presença</label>
                  <select value={diaristaTipo} onChange={(e) => setDiaristaTipo(e.target.value as DiaristaTipo)}>
                    <option value="SUBSTITUICAO">Substituição</option>
                    <option value="DEMANDA">Demanda</option>
                  </select>
                </div>

                {diaristaTipo === "SUBSTITUICAO" ? (
                  <div>
                    <label>Colaborador substituído</label>
                    <select
                      value={diaristaSubstituidoId ? String(diaristaSubstituidoId) : ""}
                      onChange={(e) => setDiaristaSubstituidoId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Selecione...</option>
                      {funcionarios.map((f) => (
                        <option key={f.id} value={String(f.id)}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label>Observação (opcional)</label>
                  <input value={diaristaObservacao} onChange={(e) => setDiaristaObservacao(e.target.value)} />
                </div>
              </div>

              {diaristaResult ? (
                <>
                  <div className="spacer" />
                  <div className="card">{diaristaResult}</div>
                </>
              ) : null}

              <div className="spacer" />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="secondary" onClick={() => setDiaristaOpen(false)}>
                  Cancelar
                </button>
                <button onClick={registrarDiarista} disabled={savingDiarista}>
                  {savingDiarista ? "Salvando..." : "Registrar diarista"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
