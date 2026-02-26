"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayStatus = "PRESENT" | "PENDING" | "ABSENT";
type Period = "WEEK" | "MONTH" | "YEAR";

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

export default function PresencaPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [lojaId, setLojaId] = useState<number | "ALL">("ALL");
  const [period, setPeriod] = useState<Period>("WEEK");
  const [refDate, setRefDate] = useState(() => toDateOnly(new Date()));
  const [statusFilter, setStatusFilter] = useState<"ALL" | DayStatus>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Array<PresencaDay | PresencaDayAll>>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayPeople, setDayPeople] = useState<DayPersonItem[]>([]);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("DAY");

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

      setUnidades(list);
      if (list.length === 1) setLojaId(list[0].id);
    }

    loadUnidades().catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar lojas."));
  }, []);

  useEffect(() => {
    async function loadPresenca() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("period", period.toLowerCase());
        qs.set("ref_date", refDate);
        if (lojaId !== "ALL") qs.set("unidade_id", String(lojaId));
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
        setError(e instanceof Error ? e.message : "Erro ao carregar presença.");
      } finally {
        setLoading(false);
      }
    }
    loadPresenca().catch(() => null);
  }, [lojaId, period, refDate, selectedDay, rightPanelMode]);

  const weekRows = useMemo(() => {
    return days
      .filter((d): d is PresencaDayAll | PresencaDay => "status_day" in d)
      .filter((d) => (statusFilter === "ALL" ? true : d.status_day === statusFilter));
  }, [days, statusFilter]);

  const filteredDayPeople = useMemo(() => {
    if (statusFilter === "ALL") return dayPeople;
    return dayPeople.filter((p) => p.status_day === statusFilter);
  }, [dayPeople, statusFilter]);

  const currentLojaName = useMemo(() => {
    if (lojaId === "ALL") return "Todas as lojas";
    return unidades.find((u) => u.id === lojaId)?.nome ?? "Loja selecionada";
  }, [lojaId, unidades]);

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
  }, [period, refDate, lojaId]);

  return (
    <div className="containerWide presencePageShell">
      <section className="presenceHero">
        <div>
          <p className="presenceKicker">Visão da presença</p>
          <h1 className="presenceTitle">Presença por loja</h1>
          <p className="presenceSubtitle">Acompanhamento diário por período, com foco na operação de campo.</p>
        </div>
        <Link className="btnLink secondary" href="/unidade">
          Voltar para unidade
        </Link>
      </section>

      <section className="presenceSummaryGrid presenceSummaryGridTop">
        <div className="presenceSummaryCard">
          <small>Loja</small>
          <strong>{currentLojaName}</strong>
        </div>
        <div className="presenceSummaryCard">
          <small>Dias no filtro</small>
          <strong>{summary.total}</strong>
        </div>
        <div className="presenceSummaryCard">
          <small>Presenças</small>
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
          <label>Loja</label>
          <select
            value={lojaId === "ALL" ? "ALL" : String(lojaId)}
            onChange={(e) => {
              const v = e.target.value;
              setLojaId(v === "ALL" ? "ALL" : Number(v));
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
            <option value="DAY">Lista do dia</option>
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
          {loading ? <div className="card">Carregando dados de presença...</div> : null}
          {!loading && period === "WEEK" ? (
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

          {!loading && period === "MONTH" ? (
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

          {!loading && period === "YEAR" ? (
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
          <h2 className="presencePanelTitle">{rightPanelMode === "DAY" ? "Lista do dia" : "Ranking de faltas"}</h2>
          {rightPanelMode === "DAY" && filteredDayPeople.map((p) => (
            <div key={p.funcionario_id} className="presenceRankingItem">
              <div>
                <span>{p.nome}</span>
                <div>
                  <small className="muted">
                    Entrada: {p.hora_entrada_prevista ?? "--:--"} | Saída: {p.hora_saida_prevista ?? "--:--"}
                  </small>
                </div>
              </div>
              <span className={squareClass(p.status_day)} />
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
    </div>
  );
}

