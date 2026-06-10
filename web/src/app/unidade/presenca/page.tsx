"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayStatus = "PRESENT" | "PENDING" | "ABSENT";
type Period = "WEEK" | "MONTH" | "YEAR";
type Role = "ADMIN" | "SUPERVISOR";
type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";

type Unidade = {
  id: number;
  nome: string;
};

type PresencaDay = {
  day: string;
  status_day: DayStatus;
};

type PresencaDayAll = {
  day: string;
  present_count: number;
  total_funcionarios: number;
  total_registros: number;
  status_day: DayStatus;
};

type RankingItem = {
  funcionario_id: number;
  nome: string;
  faltas: number;
  pendentes: number;
  presentes: number;
  status_hint: DayStatus;
};

type DayPersonItem = {
  funcionario_id: number;
  nome: string;
  status_day: DayStatus;
  hora_entrada_prevista?: string | null;
  hora_saida_prevista?: string | null;
  hora_extra_minutos?: number;
};

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

type PresenceApiResponse = {
  ok: boolean;
  scope: "ALL" | "ONE";
  period: Period;
  days: Array<PresencaDay | PresencaDayAll>;
  ranking?: RankingItem[];
  selected_day?: string;
  day_people?: DayPersonItem[];
};

type UnidadesApiResponse = {
  unidade?: Unidade | null;
  unidades?: Unidade[];
  role?: Role;
};

type RightPanelMode = "DAY" | "RANKING";

function toDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDatePt(dateOnly: string) {
  const d = new Date(`${dateOnly}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtWeekday(dateOnly: string) {
  const d = new Date(`${dateOnly}T00:00:00`);
  const weekdays = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return weekdays[d.getDay()] ?? "";
}

function statusClass(status: DayStatus) {
  if (status === "PRESENT") return "presenceOk";
  if (status === "PENDING") return "presenceWarn";
  return "presenceOff";
}

function statusLabel(status: DayStatus) {
  if (status === "PRESENT") return "Presente";
  if (status === "PENDING") return "Próximo dia";
  return "Falta";
}

function monthStatusClass(status: DayStatus) {
  if (status === "PRESENT") return "presenceMonthCellOk";
  if (status === "PENDING") return "presenceMonthCellPending";
  return "presenceMonthCellAbsent";
}

function squareClass(status: DayStatus) {
  if (status === "PRESENT") return "presenceSquareGreen";
  if (status === "PENDING") return "presenceSquareWhite";
  return "presenceSquareRed";
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

function statusPillClass(status: DayStatus) {
  if (status === "PRESENT") return "presencePersonStatusOk";
  if (status === "PENDING") return "presencePersonStatusPending";
  return "presencePersonStatusAbsent";
}

function fmtMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

export default function PresencaPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [role, setRole] = useState<Role>("SUPERVISOR");
  const [unidadeId, setUnidadeId] = useState<number | "ALL">("ALL");
  const [period, setPeriod] = useState<Period>("WEEK");
  const [refDate, setRefDate] = useState(() => toDateOnly(new Date()));
  const [statusFilter, setStatusFilter] = useState<"ALL" | DayStatus>("ALL");
  const [unidadesLoaded, setUnidadesLoaded] = useState(false);
  const [initialPointsLoaded, setInitialPointsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Array<PresencaDay | PresencaDayAll>>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayPeople, setDayPeople] = useState<DayPersonItem[]>([]);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("DAY");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
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

  useEffect(() => {
    async function loadUnidades() {
      const res = await fetch("/api/unidade/me");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = (await res.json().catch(() => null)) as UnidadesApiResponse | null;
      if (!res.ok || !data) throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`);

      const list = Array.isArray(data.unidades)
        ? data.unidades
        : data.unidade
          ? [data.unidade]
          : [];

      setRole(data.role === "ADMIN" ? "ADMIN" : "SUPERVISOR");
      setUnidades(list);
      if (list.length === 1) setUnidadeId(list[0].id);
    }

    loadUnidades()
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar unidades."))
      .finally(() => setUnidadesLoaded(true));
  }, []);

  useEffect(() => {
    async function loadPresenca() {
      if (!unidadesLoaded) return;
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("period", period.toLowerCase());
        qs.set("ref_date", refDate);
        if (unidadeId !== "ALL") qs.set("unidade_id", String(unidadeId));
        if (selectedDay) qs.set("selected_day", selectedDay);
        if (rightPanelMode === "RANKING") qs.set("with_ranking", "1");

        const res = await fetch(`/api/presenca?${qs.toString()}`);
        const data = (await res.json().catch(() => null)) as PresenceApiResponse | null;
        if (!res.ok || !data) throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`);

        setDays(Array.isArray(data.days) ? data.days : []);
        setRanking(Array.isArray(data.ranking) ? data.ranking : []);
        setDayPeople(Array.isArray(data.day_people) ? data.day_people : []);
        if (data.selected_day && data.selected_day !== selectedDay) {
          setSelectedDay(data.selected_day);
        }
      } catch (e) {
        setDays([]);
        setRanking([]);
        setDayPeople([]);
        setError(e instanceof Error ? e.message : "Erro ao carregar pontos.");
      } finally {
        setInitialPointsLoaded(true);
      }
    }
    loadPresenca().catch(() => null);
  }, [unidadeId, period, refDate, selectedDay, rightPanelMode, unidadesLoaded]);

  useEffect(() => {
    async function loadFuncionarios() {
      if (!unidadesLoaded) return;
      const query =
        role === "ADMIN"
          ? unidadeId !== "ALL"
            ? `?unidade_id=${unidadeId}`
            : ""
          : unidadeId !== "ALL"
            ? `?unidade_id=${unidadeId}`
            : "";

      const res = await fetch(`/api/funcionarios${query}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAjusteError(data?.error ?? `Erro ao carregar colaboradores (HTTP ${res.status})`);
        setFuncionarios([]);
        return;
      }
      setFuncionarios(Array.isArray(data?.funcionarios) ? data.funcionarios : []);
    }

    loadFuncionarios().catch((e) => {
      setAjusteError(e instanceof Error ? e.message : "Erro ao carregar colaboradores.");
      setFuncionarios([]);
    });
  }, [role, unidadeId, unidadesLoaded]);

  const weekRows = useMemo(() => {
    return days
      .filter((d): d is PresencaDayAll | PresencaDay => "status_day" in d)
      .filter((d) => (statusFilter === "ALL" ? true : d.status_day === statusFilter));
  }, [days, statusFilter]);

  const filteredDayPeople = useMemo(() => {
    if (statusFilter === "ALL") return dayPeople;
    return dayPeople.filter((p) => p.status_day === statusFilter);
  }, [dayPeople, statusFilter]);

  const funcionariosFiltradosAjuste = useMemo(() => {
    const term = ajusteNomeBusca.trim().toLowerCase();
    if (!term) return funcionarios;
    return funcionarios.filter((f) => f.nome.toLowerCase().includes(term));
  }, [funcionarios, ajusteNomeBusca]);

  useEffect(() => {
    if (!funcionarios.length) {
      setAjusteFuncionarioId(null);
      return;
    }
    if (!ajusteFuncionarioId || !funcionarios.some((f) => f.id === ajusteFuncionarioId)) {
      setAjusteFuncionarioId(funcionarios[0].id);
    }
  }, [funcionarios, ajusteFuncionarioId]);

  const currentUnidadeName = useMemo(() => {
    if (unidadeId === "ALL") return "Todas as unidades";
    return unidades.find((u) => u.id === unidadeId)?.nome ?? "Unidade selecionada";
  }, [unidadeId, unidades]);

  const summary = useMemo(() => {
    const total = weekRows.length;
    const present = weekRows.filter((d) => d.status_day === "PRESENT").length;
    const pending = weekRows.filter((d) => d.status_day === "PENDING").length;
    const absent = weekRows.filter((d) => d.status_day === "ABSENT").length;

    const populated = weekRows.filter((d): d is PresencaDayAll => "present_count" in d && d.total_funcionarios > 0);
    const avgRate = populated.length
      ? Math.round(
          (populated.reduce((acc, d) => acc + d.present_count / d.total_funcionarios, 0) / populated.length) * 100,
        )
      : 0;

    return { total, present, pending, absent, avgRate };
  }, [weekRows]);

  useEffect(() => {
    setSelectedDay(null);
  }, [period, refDate, unidadeId]);

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

  if (!unidadesLoaded || !initialPointsLoaded) {
    return (
      <div className="containerWide presencePageShell">
        <div className="presenceLoadingScreen">
          <strong>Carregando pontos...</strong>
          <span>Preparando a visão completa dos registros.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="containerWide presencePageShell">
      <section className="presenceHero">
        <div>
          <p className="presenceKicker">Visão dos pontos</p>
          <h1 className="presenceTitle">Pontos</h1>
          <p className="presenceSubtitle">Acompanhamento diário dos registros por unidade, jornada e hora extra.</p>
        </div>
        <Link className="btnLink secondary" href="/unidade">
          Voltar para unidade
        </Link>
      </section>

      <section className="presenceSummaryGrid presenceSummaryGridTop">
        <div className="presenceSummaryCard">
          <small>Unidade</small>
          <strong>{currentUnidadeName}</strong>
        </div>
        <div className="presenceSummaryCard">
          <small>Dias no filtro</small>
          <strong>{summary.total}</strong>
        </div>
        <div className="presenceSummaryCard">
          <small>Dias com ponto</small>
          <strong>{summary.present}</strong>
        </div>
        <div className="presenceSummaryCard">
          <small>Taxa média</small>
          <strong>{summary.avgRate}%</strong>
        </div>
      </section>

      {error ? <div className="card presenceErrorCard">Erro: {error}</div> : null}

      <div className="presenceWireTopBar">
        <div className="presenceFilterField">
          <label>Unidade</label>
          <select
            value={unidadeId === "ALL" ? "ALL" : String(unidadeId)}
            onChange={(e) => {
              const v = e.target.value;
              setUnidadeId(v === "ALL" ? "ALL" : Number(v));
            }}
          >
            <option value="ALL">Todas</option>
            {unidades.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="presenceFilterField">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | DayStatus)}>
            <option value="ALL">Todos</option>
            <option value="PRESENT">Presente</option>
            <option value="PENDING">Próximos dias</option>
            <option value="ABSENT">Falta</option>
          </select>
        </div>

        <div className="presenceFilterField">
          <label>Painel lateral</label>
          <select value={rightPanelMode} onChange={(e) => setRightPanelMode(e.target.value as RightPanelMode)}>
            <option value="DAY">Pontos do dia</option>
            <option value="RANKING">Ranking de faltas</option>
          </select>
        </div>
      </div>

      <div className="presenceWireLayout">
        <aside className="presenceWireLeftRail">
          <h2 className="presencePanelTitle">Período</h2>
          <button type="button" className={period === "WEEK" ? "" : "secondary"} onClick={() => setPeriod("WEEK")}>Semana</button>
          <button type="button" className={period === "MONTH" ? "" : "secondary"} onClick={() => setPeriod("MONTH")}>Mês</button>

          <div className="presenceStatusLegend">
            <div><span className="presenceSquareGreen" /> Presente</div>
            <div><span className="presenceSquareWhite" /> Próximos dias</div>
            <div><span className="presenceSquareRed" /> Falta</div>
          </div>
        </aside>

        <main className="presenceWireMain">
          {period === "WEEK" ? (
            <div className="presenceWeekList">
              {weekRows.map((d) => {
                const fraction = "present_count" in d
                  ? `${d.present_count}/${d.total_funcionarios || 0}`
                  : `${d.status_day === "PRESENT" ? 1 : 0}/1`;
                return (
                  <button
                    key={d.day}
                    type="button"
                    className={["presenceWeekItem", selectedDay === d.day ? "presenceDaySelected" : ""].join(" ").trim()}
                    onClick={() => setSelectedDay(d.day)}
                  >
                    <div>
                      <div className="presenceWeekMainText">{fmtWeekday(d.day)} • {fmtDatePt(d.day)}</div>
                      <small>{statusLabel(d.status_day)}</small>
                    </div>
                    <div className="presenceStatusDotWrap">
                      <span className={squareClass(d.status_day)} />
                    </div>
                    <div className="presenceFractionBox">{fraction}</div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {period === "MONTH" ? (
            <div className="presenceMonthGrid">
              {weekRows.map((d) => {
                const dayNum = Number(d.day.slice(-2));
                const fraction = "present_count" in d
                  ? `${d.present_count}/${d.total_funcionarios || 0}`
                  : `${d.status_day === "PRESENT" ? 1 : 0}/1`;
                return (
                  <button
                    key={d.day}
                    type="button"
                    className={[
                      "presenceMonthCell",
                      monthStatusClass(d.status_day),
                      selectedDay === d.day ? "presenceDaySelected" : ""
                    ].join(" ").trim()}
                    onClick={() => setSelectedDay(d.day)}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                      <span>{String(dayNum).padStart(2, "0")}</span>
                      <span className={squareClass(d.status_day)} />
                    </div>
                    <small>{fraction}</small>
                  </button>
                );
              })}
            </div>
          ) : null}

          {period === "YEAR" ? (
            <div className="presenceWeekList">
              {weekRows.map((d) => {
                const fraction = "present_count" in d
                  ? `${d.present_count}/${d.total_funcionarios || 0}`
                  : `${d.status_day === "PRESENT" ? 1 : 0}/1`;
                return (
                  <button
                    key={d.day}
                    type="button"
                    className={["presenceWeekItem", selectedDay === d.day ? "presenceDaySelected" : ""].join(" ").trim()}
                    onClick={() => setSelectedDay(d.day)}
                  >
                    <div>
                      <div className="presenceWeekMainText">{fmtDatePt(d.day)}</div>
                      <small>{statusLabel(d.status_day)}</small>
                    </div>
                    <div className="presenceStatusDotWrap">
                      <span className={squareClass(d.status_day)} />
                    </div>
                    <div className="presenceFractionBox">{fraction}</div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </main>

        <aside className="presenceWireRightRail">
          <div className="presencePeopleHeader">
            <div>
              <h2 className="presencePanelTitle">{rightPanelMode === "DAY" ? "Pontos do dia" : "Ranking de faltas"}</h2>
              {rightPanelMode === "DAY" && selectedDay ? (
                <small>{fmtWeekday(selectedDay)} • {fmtDatePt(selectedDay)}</small>
              ) : null}
            </div>
            {rightPanelMode === "DAY" ? <strong>{filteredDayPeople.length}</strong> : null}
          </div>
          {rightPanelMode === "DAY" && filteredDayPeople.map((p) => (
            <div key={p.funcionario_id} className="presencePersonCard">
              <div className="presencePersonTop">
                <span className="presencePersonName">{p.nome}</span>
                <span className={statusPillClass(p.status_day)}>{statusLabel(p.status_day)}</span>
              </div>
              <div className="presencePersonBody">
                <div className="presencePersonSchedule">
                  <span><small>Entrada</small><strong>{p.hora_entrada_prevista ?? "--:--"}</strong></span>
                  <span><small>Saída</small><strong>{p.hora_saida_prevista ?? "--:--"}</strong></span>
                </div>
                {Number(p.hora_extra_minutos ?? 0) > 0 ? (
                  <strong className="presenceOvertimeBadge">
                    Hora extra: {fmtMinutes(Number(p.hora_extra_minutos ?? 0))}
                  </strong>
                ) : (
                  <span className="presenceNoOvertime">Sem hora extra</span>
                )}
              </div>
            </div>
          ))}
          {rightPanelMode === "RANKING" && ranking.map((r) => (
            <div key={r.funcionario_id} className="presenceRankingItem">
              <span>{r.nome}</span>
              <span className={squareClass(r.status_hint)} />
            </div>
          ))}
          {rightPanelMode === "DAY" && !filteredDayPeople.length ? (
            <div className="presenceRankingItem"><span>Sem dados para o filtro.</span></div>
          ) : null}
          {rightPanelMode === "RANKING" && !ranking.length ? (
            <div className="presenceRankingItem"><span>Sem ranking neste período.</span></div>
          ) : null}
        </aside>
      </div>

      <section className="opsPanel presenceManualPanel">
        <div className="opsPanelHeader">
          <div>
            <h2>Ajuste manual de ponto</h2>
            <p>Correções auditáveis ficam concentradas na tela de pontos.</p>
          </div>
        </div>

        <div className="opsFormGrid">
          <div>
            <label>Buscar colaborador</label>
            <input
              list="presenca-ajuste-colaboradores"
              value={ajusteNomeBusca}
              onChange={(e) => onChangeBuscaColaborador(e.target.value)}
              placeholder="Digite o nome..."
            />
            <datalist id="presenca-ajuste-colaboradores">
              {funcionarios.map((f) => (
                <option key={`nome-${f.id}`} value={f.nome} />
              ))}
            </datalist>
          </div>
          <div>
            <label>Colaborador</label>
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
      </section>
    </div>
  );
}

