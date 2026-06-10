"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type PontoRegistro = {
  id: number;
  tipo: "ENTRADA" | "SAIDA";
  timestamp: string;
};

type PontoDia = {
  day: string;
  registros: PontoRegistro[];
  entrada: string | null;
  saida: string | null;
  total_minutos: number;
  hora_extra_minutos: number;
  incompleto: boolean;
};

type PontoReport = {
  funcionario: {
    nome: string;
    unidade_nome: string;
    hora_entrada_prevista: string | null;
    hora_saida_prevista: string | null;
  };
  month: string;
  totals: {
    dias_com_ponto: number;
    total_minutos: number;
    hora_extra_minutos: number;
  };
  days: PontoDia[];
};

function currentMonthOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(dateOnly: string) {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
}

function fmtTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

export default function MeuPontoPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [month, setMonth] = useState(currentMonthOnly);
  const [report, setReport] = useState<PontoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ token, month });
        const res = await fetch(`/api/meu-ponto?${qs.toString()}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setReport(data.report ?? null);
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Falha ao carregar pontos.");
      } finally {
        setLoading(false);
      }
    }
    if (token) load().catch(() => null);
  }, [token, month]);

  const visibleDays = useMemo(() => report?.days.filter((d) => d.registros.length > 0) ?? [], [report]);

  return (
    <div className="containerWide employeePointPage">
      <section className="employeePointHeader">
        <div>
          <small className="muted">Consulta individual</small>
          <h1 style={{ margin: "4px 0 0" }}>Meu ponto</h1>
          {report ? (
            <p className="employeePointSubtitle">
              {report.funcionario.nome} • {report.funcionario.unidade_nome}
            </p>
          ) : null}
        </div>
        <div className="employeePointFilter">
          <label>Mês</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonthOnly())} />
        </div>
      </section>

      {loading ? <div className="card">Carregando seus pontos...</div> : null}
      {error ? (
        <div className="card" style={{ borderColor: "#8a1f1f" }}>
          Link inválido, expirado ou sem permissão.
        </div>
      ) : null}

      {report && !loading ? (
        <>
          <section className="employeePointSummary">
            <div className="presenceSummaryCard">
              <small>Dias com ponto</small>
              <strong>{report.totals.dias_com_ponto}</strong>
            </div>
            <div className="presenceSummaryCard">
              <small>Horas registradas</small>
              <strong>{fmtMinutes(report.totals.total_minutos)}</strong>
            </div>
            <div className="presenceSummaryCard">
              <small>Hora extra</small>
              <strong>{fmtMinutes(report.totals.hora_extra_minutos)}</strong>
            </div>
            <div className="presenceSummaryCard">
              <small>Horário previsto</small>
              <strong>
                {report.funcionario.hora_entrada_prevista ?? "08:00"} - {report.funcionario.hora_saida_prevista ?? "17:00"}
              </strong>
            </div>
          </section>

          <div className="spacer" />
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Total</th>
                  <th>Extra</th>
                  <th>Registros</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleDays.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Nenhum ponto registrado neste mês.</td>
                  </tr>
                ) : (
                  visibleDays.map((d) => (
                    <tr key={d.day}>
                      <td>{fmtDate(d.day)}</td>
                      <td>{fmtTime(d.entrada)}</td>
                      <td>{fmtTime(d.saida)}</td>
                      <td>{fmtMinutes(d.total_minutos)}</td>
                      <td>{fmtMinutes(d.hora_extra_minutos)}</td>
                      <td>{d.registros.map((r) => `${r.tipo} ${fmtTime(r.timestamp)}`).join(" | ")}</td>
                      <td>{d.incompleto ? "Incompleto" : "OK"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
