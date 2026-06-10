"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Unidade = { id: number; nome: string };

type UnidadeResponse = {
  unidade?: Unidade | null;
  unidades?: Unidade[];
  role?: "ADMIN" | "SUPERVISOR";
};

type FuncionarioMetricas = {
  id: number;
  nome: string;
  status: string;
  turno: number;
  local_tipo: string;
  unidade_id: number;
  unidade_nome: string;
  hora_entrada_prevista: string | null;
  hora_saida_prevista: string | null;
  face_embeddings: number;
  dias_avaliados: number;
  dias_com_ponto: number;
  faltas: number;
  total_minutos: number;
  hora_extra_minutos: number;
  percentual_presenca: number;
};

function currentMonthOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMinutes(total: number) {
  const safe = Math.max(0, Math.floor(Number(total) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function initials(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusTone(f: FuncionarioMetricas) {
  if (f.status !== "ATIVO") return "statusBadgeNeutral";
  if (f.faltas > 0) return "statusBadgeWarn";
  if (f.face_embeddings <= 0) return "statusBadgeInfo";
  return "statusBadgeOk";
}

function localLabel(local: string) {
  if (local === "ESCRITORIO") return "Escritório";
  if (local === "CD") return "CD";
  return "Unidade";
}

export default function FuncionariosPage() {
  const [role, setRole] = useState<"ADMIN" | "SUPERVISOR">("SUPERVISOR");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState<number | "ALL">("ALL");
  const [month, setMonth] = useState(currentMonthOnly);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ATIVO" | "ATENCAO">("ALL");
  const [funcionarios, setFuncionarios] = useState<FuncionarioMetricas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUnidades() {
      const res = await fetch("/api/unidade/me");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json().catch(() => null)) as UnidadeResponse | null;
      if (!res.ok || !data) throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      const list = Array.isArray(data.unidades) ? data.unidades : data.unidade ? [data.unidade] : [];
      setRole(data.role === "ADMIN" ? "ADMIN" : "SUPERVISOR");
      setUnidades(list);
      if (data.role !== "ADMIN" && list[0]) setUnidadeId(list[0].id);
    }

    loadUnidades().catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar unidades."));
  }, []);

  useEffect(() => {
    async function loadMetricas() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("month", month);
        if (unidadeId !== "ALL") qs.set("unidade_id", String(unidadeId));
        const res = await fetch(`/api/funcionarios/metricas?${qs.toString()}`, { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setFuncionarios(Array.isArray(data?.funcionarios) ? data.funcionarios : []);
      } catch (e) {
        setFuncionarios([]);
        setError(e instanceof Error ? e.message : "Erro ao carregar funcionários.");
      } finally {
        setLoading(false);
      }
    }

    loadMetricas().catch(() => null);
  }, [month, unidadeId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return funcionarios.filter((f) => {
      const matchesSearch =
        !term ||
        f.nome.toLowerCase().includes(term) ||
        f.unidade_nome.toLowerCase().includes(term) ||
        String(f.turno).includes(term);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ATIVO" && f.status === "ATIVO") ||
        (statusFilter === "ATENCAO" && (f.faltas > 0 || f.face_embeddings <= 0 || f.status !== "ATIVO"));
      return matchesSearch && matchesStatus;
    });
  }, [funcionarios, search, statusFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const totalMinutos = filtered.reduce((acc, f) => acc + Number(f.total_minutos || 0), 0);
    const totalExtra = filtered.reduce((acc, f) => acc + Number(f.hora_extra_minutos || 0), 0);
    const faltas = filtered.reduce((acc, f) => acc + Number(f.faltas || 0), 0);
    const presencaMedia = total
      ? Math.round(filtered.reduce((acc, f) => acc + Number(f.percentual_presenca || 0), 0) / total)
      : 0;
    return { total, totalMinutos, totalExtra, faltas, presencaMedia };
  }, [filtered]);

  return (
    <div className="employeeDirectoryPage">
      <aside className="employeeDirectorySidebar">
        <div className="employeeDirectoryBrand">
          <span>DS</span>
          <strong>Digitaliza Sodexo</strong>
        </div>
        <nav className="employeeDirectoryNav" aria-label="Navegação de funcionários">
          <Link href="/unidade">Minha unidade</Link>
          <Link className="isActive" href="/unidade/funcionarios">Funcionários</Link>
          <Link href="/unidade/presenca">Pontos</Link>
          <Link href="/unidade/cadastrar">Cadastrar</Link>
          {role === "ADMIN" ? <Link href="/unidade/admin">Admin</Link> : null}
        </nav>
      </aside>

      <main className="employeeDirectoryMain">
        <header className="employeeDirectoryTopbar">
          <div>
            <p className="opsKicker">Gestão individual</p>
            <h1>Funcionários</h1>
          </div>
          <div className="employeeDirectorySearch">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar funcionário, unidade ou turno..."
            />
          </div>
          <Link className="btnLink secondary" href="/unidade">
            Voltar
          </Link>
        </header>

        <section className="employeeDirectoryFilters">
          <div>
            <label>Mês</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonthOnly())} />
          </div>
          {role === "ADMIN" ? (
            <div>
              <label>Unidade</label>
              <select
                value={unidadeId === "ALL" ? "ALL" : String(unidadeId)}
                onChange={(e) => setUnidadeId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
              >
                <option value="ALL">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ATIVO" | "ATENCAO")}>
              <option value="ALL">Todos</option>
              <option value="ATIVO">Ativos</option>
              <option value="ATENCAO">Atenção</option>
            </select>
          </div>
          <Link className="btnLink" href="/unidade/cadastrar">
            Adicionar
          </Link>
        </section>

        <section className="employeeDirectorySummary">
          <div>
            <small>Funcionários</small>
            <strong>{summary.total}</strong>
          </div>
          <div>
            <small>Horas feitas</small>
            <strong>{fmtMinutes(summary.totalMinutos)}</strong>
          </div>
          <div>
            <small>Horas extras</small>
            <strong>{fmtMinutes(summary.totalExtra)}</strong>
          </div>
          <div>
            <small>Presença média</small>
            <strong>{summary.presencaMedia}%</strong>
          </div>
          <div>
            <small>Faltas</small>
            <strong>{summary.faltas}</strong>
          </div>
        </section>

        {error ? <div className="card" style={{ borderColor: "#8a1f1f" }}>Erro: {error}</div> : null}

        <section className="employeeDirectoryPanel">
          <div className="employeeDirectoryPanelHeader">
            <div>
              <h2>Relatório individual</h2>
              <span>{loading ? "Carregando..." : `${filtered.length} registros encontrados`}</span>
            </div>
            <button className="secondary" type="button" onClick={() => setStatusFilter("ATENCAO")}>
              Filtrar atenção
            </button>
          </div>

          <div className="employeeDirectoryTableShell">
            <table className="employeeDirectoryTable">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Unidade</th>
                  <th>Jornada</th>
                  <th>Horas</th>
                  <th>Extras</th>
                  <th>Faltas</th>
                  <th>Presença</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>{loading ? "Carregando funcionários..." : "Nenhum funcionário encontrado."}</td>
                  </tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <div className="employeeDirectoryPerson">
                          <span>{initials(f.nome)}</span>
                          <div>
                            <strong>{f.nome}</strong>
                            <small>Turno {f.turno} | {localLabel(f.local_tipo)}</small>
                          </div>
                        </div>
                      </td>
                      <td>{f.unidade_nome}</td>
                      <td>{f.hora_entrada_prevista ?? "08:00"} - {f.hora_saida_prevista ?? "17:00"}</td>
                      <td>{fmtMinutes(f.total_minutos)}</td>
                      <td>{fmtMinutes(f.hora_extra_minutos)}</td>
                      <td>{f.faltas}</td>
                      <td>
                        <div className="employeePresenceBar">
                          <span style={{ width: `${Math.max(0, Math.min(100, Number(f.percentual_presenca || 0)))}%` }} />
                        </div>
                        <small>{f.percentual_presenca}%</small>
                      </td>
                      <td>
                        <span className={["statusBadge", statusTone(f)].join(" ")}>
                          {f.status !== "ATIVO" ? f.status : f.faltas > 0 ? "Atenção" : "Ativo"}
                        </span>
                      </td>
                      <td>
                        <Link className="employeeTinyButton" href={`/unidade/presenca?funcionario_id=${f.id}`}>
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="employeeDirectoryCards">
            {filtered.length === 0 ? (
              <div className="employeeDirectoryCard">{loading ? "Carregando funcionários..." : "Nenhum funcionário encontrado."}</div>
            ) : (
              filtered.map((f) => (
                <article className="employeeDirectoryCard" key={`card-${f.id}`}>
                  <div className="employeeDirectoryCardTop">
                    <div className="employeeDirectoryPerson">
                      <span>{initials(f.nome)}</span>
                      <div>
                        <strong>{f.nome}</strong>
                        <small>{f.unidade_nome}</small>
                      </div>
                    </div>
                    <span className={["statusBadge", statusTone(f)].join(" ")}>
                      {f.faltas > 0 ? "Atenção" : f.status}
                    </span>
                  </div>
                  <div className="employeeDirectoryCardGrid">
                    <span><small>Horas</small><b>{fmtMinutes(f.total_minutos)}</b></span>
                    <span><small>Extras</small><b>{fmtMinutes(f.hora_extra_minutos)}</b></span>
                    <span><small>Faltas</small><b>{f.faltas}</b></span>
                    <span><small>Presença</small><b>{f.percentual_presenca}%</b></span>
                  </div>
                  <div className="employeePresenceBar">
                    <span style={{ width: `${Math.max(0, Math.min(100, Number(f.percentual_presenca || 0)))}%` }} />
                  </div>
                  <small className="muted">
                    Turno {f.turno} | {f.hora_entrada_prevista ?? "08:00"} - {f.hora_saida_prevista ?? "17:00"} | Face {f.face_embeddings}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
