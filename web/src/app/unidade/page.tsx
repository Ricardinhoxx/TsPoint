"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CameraModal from "@/components/CameraModal";
import ThemeToggle from "@/components/ThemeToggle";
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

type DiaristaTipo = "SUBSTITUICAO" | "DEMANDA";

type Unidade = { id: number; nome: string };

const DEFAULT_HORA_ENTRADA = "08:00";
const DEFAULT_HORA_SAIDA = "17:00";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roleLabel = role === "ADMIN" ? "Administrador" : "Supervisor";
  const unidadeResponsavel = unidade?.nome ?? (role === "ADMIN" ? "Todas as unidades" : "Não definida");

  const matchedFuncionario = useMemo(() => {
    if (!match?.matched || !match.funcionario_id) return null;
    return funcionarios.find((f) => f.id === match.funcionario_id) ?? null;
  }, [funcionarios, match]);

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

  function openDiaristaModal() {
    setMobileMenuOpen(false);
    setDiaristaOpen(true);
  }

  function openCameraModal() {
    setMobileMenuOpen(false);
    setCameraOpen(true);
  }

  const totalFuncionarios = funcionarios.length;
  const faceReadyCount = funcionarios.filter((f) => Number(f.face_embeddings ?? 0) > 0).length;
  const missingFaceCount = Math.max(0, totalFuncionarios - faceReadyCount);
  const activeCount = funcionarios.filter((f) => f.status.toUpperCase() === "ATIVO").length;
  const turnoCount = new Set(funcionarios.map((f) => f.turno)).size;
  const faceReadyPercent = totalFuncionarios ? Math.round((faceReadyCount / totalFuncionarios) * 100) : 0;

  function initials(nome: string) {
    return nome
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  function localLabel(localTipo: LocalTipo) {
    if (localTipo === "ESCRITORIO") return "Escritório";
    if (localTipo === "CD") return "CD";
    return "Unidade";
  }

  function funcionarioStatusClass(status: string) {
    return status.toUpperCase() === "ATIVO" ? "statusBadgeOk" : "statusBadgeNeutral";
  }

  return (
    <div className="opsPage">
      <section className="opsHero">
        <div className="containerWide">
          <div className="opsHeroInner">
            <div>
              <p className="opsKicker">Operação de ponto</p>
              <h1 className="opsTitle">Minha unidade</h1>
              <p className="opsSubtitle">
                Controle diário de colaboradores, base facial e registros manuais da operação.
              </p>
              <div className="opsMetaRow">
                <span className="statusBadge statusBadgeInfo">{roleLabel}</span>
                <span className="statusBadge statusBadgeNeutral">
                  {unidadeResponsavel}
                  {unidade?.id ? ` | id=${unidade.id}` : ""}
                </span>
                <span className={["statusBadge", missingFaceCount ? "statusBadgeWarn" : "statusBadgeOk"].join(" ")}>
                  {missingFaceCount ? `${missingFaceCount} sem base facial` : "Bases faciais prontas"}
                </span>
              </div>
            </div>

            <div className="opsHeroActions unidadeTopActions">
              <div className="brandLockup" aria-label="Bemol">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="brandLogo brandLogoApp" src="/brand/app-logo-highlight.png" alt="Digitaliza Sodexo" />
              </div>

              <button className="secondary" onClick={logout}>
                Sair
              </button>
            </div>
          </div>

          <div className="opsActionBar unidadeNavBar">
            <h2 className="opsActionTitle">Centro de comando</h2>
            <div className="desktopNavActions opsDesktopActions">
              {role === "ADMIN" ? (
                <Link className="btnLink secondary" href="/unidade/admin">
                  Admin: atribuições
                </Link>
              ) : null}
              <Link className="btnLink secondary" href="/unidade/cadastrar">
                Cadastrar colaborador
              </Link>
              <Link className="btnLink secondary" href="/unidade/funcionarios">
                Funcionários
              </Link>
              <Link className="btnLink secondary" href="/unidade/presenca">
                Ver pontos
              </Link>
              <button className="secondary" onClick={openDiaristaModal}>
                Registrar diarista
              </button>
              <ThemeToggle />
              <button onClick={openCameraModal}>Registrar por câmera</button>
            </div>

            <div className="mobileNav">
              <button
                type="button"
                className="mobileNavTrigger secondary"
                aria-label="Abrir navegação"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                <span />
                <span />
                <span />
              </button>
              {mobileMenuOpen ? (
                <div className="mobileNavPanel" role="menu">
                  {role === "ADMIN" ? (
                    <Link
                      className="mobileNavItem"
                      href="/unidade/admin"
                      role="menuitem"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Admin: atribuições
                    </Link>
                  ) : null}
                  <Link
                    className="mobileNavItem"
                    href="/unidade/cadastrar"
                    role="menuitem"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Cadastrar colaborador
                  </Link>
                  <Link
                    className="mobileNavItem"
                    href="/unidade/funcionarios"
                    role="menuitem"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Funcionários
                  </Link>
                  <Link
                    className="mobileNavItem"
                    href="/unidade/presenca"
                    role="menuitem"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Pontos
                  </Link>
                  <button type="button" className="mobileNavItem" role="menuitem" onClick={openDiaristaModal}>
                    Registrar diarista
                  </button>
                  <ThemeToggle className="mobileNavItem" />
                  <button type="button" className="mobileNavItem mobileNavItemPrimary" role="menuitem" onClick={openCameraModal}>
                    Registrar por câmera
                  </button>
                  <button type="button" className="mobileNavItem" role="menuitem" onClick={logout}>
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="opsMobileFlow" aria-label="Fluxo de operação">
            <button type="button" className="flowActionCard" onClick={openCameraModal}>
              <span className="statusBadge statusBadgeInfo">Passo 1</span>
              <strong>Registrar ponto</strong>
              <span>Abra a câmera, identifique o colaborador e confirme a presença.</span>
            </button>
            <Link className="flowActionCard" href="/unidade/cadastrar">
              <span className="statusBadge statusBadgeNeutral">Passo 2</span>
              <strong>Cadastrar colaborador</strong>
              <span>Adicione dados, jornada e base facial em um fluxo guiado.</span>
            </Link>
            <Link className="flowActionCard" href="/unidade/funcionarios">
              <span className="statusBadge statusBadgeNeutral">Relatório</span>
              <strong>Funcionários</strong>
              <span>Veja horas feitas, extras, faltas e percentual individual.</span>
            </Link>
            <Link className="flowActionCard" href="/unidade/presenca">
              <span className="statusBadge statusBadgeNeutral">Passo 3</span>
              <strong>Ver e ajustar pontos</strong>
              <span>Acompanhe presença e corrija registros diretamente na tela de pontos.</span>
            </Link>
          </div>

          <div className="opsQuickGrid">
            <div className="opsMetricCard" data-tone="info">
              <small>Colaboradores</small>
              <strong>{totalFuncionarios}</strong>
              <span>{activeCount} ativos na operação</span>
            </div>
            <div className="opsMetricCard" data-tone={missingFaceCount ? "warn" : "ok"}>
              <small>Base facial</small>
              <strong>{faceReadyPercent}%</strong>
              <span>{faceReadyCount} cadastradas, {missingFaceCount} pendentes</span>
            </div>
            <div className="opsMetricCard" data-tone="info">
              <small>Turnos cobertos</small>
              <strong>{turnoCount}</strong>
              <span>Escalas ativas na unidade</span>
            </div>
            <div className="opsMetricCard" data-tone={loadError ? "warn" : "ok"}>
              <small>Serviço</small>
              <strong>{loadError ? "Atenção" : "Online"}</strong>
              <span>{loadError ? "Verifique os alertas abaixo" : "Pronto para registrar ponto"}</span>
            </div>
          </div>

          {manageResult ? (
            <>
              <div className="card">{manageResult}</div>
              <div className="spacer" />
            </>
          ) : null}
        </div>
      </section>

      <div className="containerWide opsContent">
        <div className="opsPanelGrid">
          <section className="opsPanel">
            <div className="opsPanelHeader">
              <div>
                <h2>Escala operacional</h2>
                <p>Colaboradores vinculados, jornada prevista e prontidão facial.</p>
              </div>
              <span className="statusBadge statusBadgeNeutral">{totalFuncionarios} registros</span>
            </div>

            {funcionarios.length ? (
              <div className="opsRoster">
                {funcionarios.map((f) => {
                  const hasFace = Number(f.face_embeddings ?? 0) > 0;
                  return (
                    <div className="opsRosterItem" key={f.id}>
                      <span className="opsAvatar" aria-hidden="true">{initials(f.nome)}</span>
                      <div>
                        <div className="opsRosterName">{f.nome}</div>
                        <div className="opsRosterMeta">
                          Turno {f.turno} | {localLabel(f.local_tipo)} |{" "}
                          {(f.hora_entrada_prevista || DEFAULT_HORA_ENTRADA)} - {(f.hora_saida_prevista || DEFAULT_HORA_SAIDA)}
                          {role === "ADMIN" ? ` | ${f.unidade_nome ?? `id=${f.unidade_id}`}` : ""}
                        </div>
                      </div>
                      <div className="opsBadgeStack">
                        <span className={["statusBadge", funcionarioStatusClass(f.status)].join(" ")}>{f.status}</span>
                        <span className={["statusBadge", hasFace ? "statusBadgeOk" : "statusBadgeWarn"].join(" ")}>
                          {hasFace ? `Face ${f.face_embeddings}` : "Sem face"}
                        </span>
                        {role === "ADMIN" ? (
                          pendingDeleteId === f.id ? (
                            <div className="opsAdminActions">
                              <button
                                className="secondary"
                                onClick={() => setPendingDeleteId(null)}
                                disabled={deletingId === f.id}
                              >
                                Cancelar
                              </button>
                              <button onClick={() => deleteFuncionario(f)} disabled={deletingId === f.id}>
                                {deletingId === f.id ? "Apagando..." : "Excluir"}
                              </button>
                              <button onClick={() => deleteFuncionario(f, true)} disabled={deletingId === f.id}>
                                {deletingId === f.id ? "Apagando..." : "Definitivo"}
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
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="opsEmptyState">Nenhum colaborador carregado para esta unidade.</div>
            )}
          </section>

          <section className="opsPanel">
            <div className="opsPanelHeader">
              <div>
                <h2>Último reconhecimento</h2>
                <p>Resultado da última captura feita por câmera.</p>
              </div>
              <span className={["statusBadge", recognizing ? "statusBadgeInfo" : match?.matched ? "statusBadgeOk" : match ? "statusBadgeWarn" : "statusBadgeNeutral"].join(" ")}>
                {recognizing ? "Reconhecendo" : match?.matched ? "Identificado" : match ? "Sem match" : "Aguardando"}
              </span>
            </div>

          {loadError ? (
            <>
              <div className="card" style={{ borderColor: "#b91c1c" }}>
                Erro: {loadError}
              </div>
              <div className="spacer" />
            </>
          ) : null}

            <div className="opsRecognitionState">
              {recognizing ? (
                <>
                  <span className="statusBadge statusBadgeInfo">Processando</span>
                  <div className="opsRecognitionName">Reconhecendo rosto...</div>
                  <p>Aguarde a validação facial antes de confirmar o registro.</p>
                </>
              ) : match?.matched ? (
                <>
                  <span className="statusBadge statusBadgeOk">Match encontrado</span>
                  <div className="opsRecognitionName">{match.nome ?? matchedFuncionario?.nome ?? "Colaborador identificado"}</div>
                  <p>
                    {match.unidade_nome ?? (match.unidade_id ? `Unidade id=${match.unidade_id}` : "Unidade não informada")}
                    {role === "ADMIN" ? ` | score=${match.score?.toFixed(3) ?? "n/a"}` : ""}
                  </p>
                  <button onClick={confirmPonto}>Confirmar presença</button>
                </>
              ) : match ? (
                <>
                  <span className="statusBadge statusBadgeWarn">Sem correspondência</span>
                  <div className="opsRecognitionName">Nenhum colaborador identificado</div>
                  <p>Confira iluminação, enquadramento e se a base facial foi cadastrada.</p>
                </>
              ) : (
                <>
                  <span className="statusBadge statusBadgeNeutral">Aguardando câmera</span>
                  <div className="opsRecognitionName">Pronto para registrar ponto</div>
                  <p>Abra a câmera e capture um frame frontal do colaborador.</p>
                  <button onClick={openCameraModal}>Registrar por câmera</button>
                </>
              )}
            </div>

          {pontoResult ? (
            <>
              <div className="spacer" />
              <div className="card">{pontoResult}</div>
            </>
          ) : null}
          </section>
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
