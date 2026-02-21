"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Unidade = { id: number; nome: string };
type Supervisor = { id: number; email: string; role: "ADMIN" | "SUPERVISOR"; unidade_id: number };
type Funcionario = { id: number; nome: string; status: string; unidade_id: number };

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export default function AdminAssignmentsPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorsOriginal, setSupervisorsOriginal] = useState<Supervisor[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funcionarioSearch, setFuncionarioSearch] = useState("");
  const [unidadeFilter, setUnidadeFilter] = useState<number | "ALL">("ALL");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [newUnidadeNome, setNewUnidadeNome] = useState("");
  const [creatingUnidade, setCreatingUnidade] = useState(false);

  const unidadeMap = useMemo(() => {
    return new Map(unidades.map((u) => [u.id, u.nome]));
  }, [unidades]);

  function buildQuery(search: string, page: number, pageSize: number, unidadeId: number | "ALL") {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("funcionario_search", search.trim());
    qs.set("page", String(page));
    qs.set("page_size", String(pageSize));
    if (unidadeId !== "ALL") qs.set("unidade_id", String(unidadeId));
    return qs.toString();
  }

  async function load(opts?: { search?: string; page?: number; pageSize?: number; unidadeId?: number | "ALL" }) {
    const search = opts?.search ?? funcionarioSearch;
    const page = opts?.page ?? pagination.page;
    const pageSize = opts?.pageSize ?? pagination.page_size;
    const unidadeId = opts?.unidadeId ?? unidadeFilter;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/assignments?${buildQuery(search, page, pageSize, unidadeId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const loadedUnidades = Array.isArray(data.unidades) ? data.unidades : [];
      const loadedSupervisors = Array.isArray(data.supervisors) ? data.supervisors : [];
      const loadedFuncionarios = Array.isArray(data.funcionarios) ? data.funcionarios : [];

      setUnidades(loadedUnidades);
      setSupervisors(loadedSupervisors);
      setSupervisorsOriginal(loadedSupervisors);
      setFuncionarios(loadedFuncionarios);
      setPagination(
        data?.pagination ?? { page: 1, page_size: pageSize, total: loadedFuncionarios.length, total_pages: 1 }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ search: "", page: 1, pageSize: 20, unidadeId: "ALL" }).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requiresAdminDoubleConfirm(currentRole: "ADMIN" | "SUPERVISOR", nextRole: "ADMIN" | "SUPERVISOR") {
    return currentRole === "ADMIN" || nextRole === "ADMIN";
  }

  async function saveSupervisor(row: Supervisor) {
    const original = supervisorsOriginal.find((s) => s.id === row.id);
    if (!original) {
      setError("Supervisor base nao encontrado para validacao.");
      return;
    }

    if (requiresAdminDoubleConfirm(original.role, row.role)) {
      const firstOk = window.confirm(
        `Voce esta alterando um supervisor com privilegio ADMIN (${row.email}). Deseja continuar?`
      );
      if (!firstOk) return;
      const secondToken = window.prompt('Digite ADMIN para confirmar esta alteracao:');
      if ((secondToken ?? "").trim().toUpperCase() !== "ADMIN") {
        setError("Confirmacao invalida. Alteracao cancelada.");
        return;
      }
    }

    setSavingKey(`sup-${row.id}`);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity_type: "SUPERVISOR",
          id: row.id,
          unidade_id: row.unidade_id,
          role: row.role
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setStatusMsg(`Supervisor ${row.email} atualizado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar supervisor");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveFuncionario(row: Funcionario) {
    setSavingKey(`fun-${row.id}`);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity_type: "FUNCIONARIO",
          id: row.id,
          unidade_id: row.unidade_id
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setStatusMsg(`Colaborador ${row.nome} atualizado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar colaborador");
    } finally {
      setSavingKey(null);
    }
  }

  async function createUnidade() {
    const nome = newUnidadeNome.trim();
    if (nome.length < 2) {
      setError("Nome da loja deve ter ao menos 2 caracteres.");
      return;
    }

    setCreatingUnidade(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      const unidade = data?.unidade as Unidade | undefined;
      setStatusMsg(
        unidade
          ? `Loja criada com sucesso: ${unidade.nome} (id=${unidade.id}).`
          : "Loja criada com sucesso."
      );
      setNewUnidadeNome("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar loja");
    } finally {
      setCreatingUnidade(false);
    }
  }

  return (
    <div className="containerWide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin - Funções e atribuições</h1>
          <small className="muted">
            Defina papel e loja para supervisores e loja para colaboradores.
          </small>
        </div>
        <Link className="btnLink secondary" href="/unidade">
          Voltar
        </Link>
      </div>

      <div className="spacer" />

      {error ? (
        <div className="card" style={{ borderColor: "#8a1f1f" }}>
          Erro: {error}
        </div>
      ) : null}
      {statusMsg ? (
        <>
          <div className="spacer" />
          <div className="card" style={{ borderColor: "#16a34a" }}>
            {statusMsg}
          </div>
        </>
      ) : null}

      <div className="spacer" />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Criar loja</h2>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 320, flex: 1 }}>
            <label>Nome da loja</label>
            <input
              value={newUnidadeNome}
              onChange={(e) => setNewUnidadeNome(e.target.value)}
              placeholder="Ex: Loja Centro"
            />
          </div>
          <button onClick={createUnidade} disabled={creatingUnidade}>
            {creatingUnidade ? "Criando..." : "Criar loja"}
          </button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Filtros</h2>
          <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label>Unidade</label>
              <select
                value={unidadeFilter === "ALL" ? "ALL" : String(unidadeFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setUnidadeFilter(v === "ALL" ? "ALL" : Number(v));
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
            <div>
              <label>Buscar colaborador</label>
              <input
                value={funcionarioSearch}
                onChange={(e) => setFuncionarioSearch(e.target.value)}
                placeholder="Nome..."
              />
            </div>
            <div>
              <label>Itens por página</label>
              <select
                value={String(pagination.page_size)}
                onChange={(e) => {
                  const pageSize = Number(e.target.value);
                  setPagination((prev) => ({ ...prev, page_size: pageSize }));
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
            <button
              className="secondary"
              onClick={() => load({ search: funcionarioSearch, page: 1, pageSize: pagination.page_size, unidadeId: unidadeFilter })}
              disabled={loading}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Supervisores</h2>
        <div className="tableShell">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Função</th>
                <th>Loja</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>Carregando...</td>
                </tr>
              ) : supervisors.length === 0 ? (
                <tr>
                  <td colSpan={4}>Sem supervisores.</td>
                </tr>
              ) : (
                supervisors.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td>
                      <select
                        value={s.role}
                        onChange={(e) => {
                          const role = e.target.value as "ADMIN" | "SUPERVISOR";
                          setSupervisors((prev) =>
                            prev.map((item) => (item.id === s.id ? { ...item, role } : item))
                          );
                        }}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={String(s.unidade_id)}
                        onChange={(e) => {
                          const unidadeId = Number(e.target.value);
                          setSupervisors((prev) =>
                            prev.map((item) =>
                              item.id === s.id ? { ...item, unidade_id: unidadeId } : item
                            )
                          );
                        }}
                      >
                        {unidades.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() => saveSupervisor(s)}
                        disabled={savingKey === `sup-${s.id}`}
                      >
                        {savingKey === `sup-${s.id}` ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Colaboradores</h2>

        <div className="tableShell">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Loja atual</th>
                <th>Nova loja</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Carregando...</td>
                </tr>
              ) : funcionarios.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sem colaboradores.</td>
                </tr>
              ) : (
                funcionarios.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.status}</td>
                    <td>{unidadeMap.get(f.unidade_id) ?? `id=${f.unidade_id}`}</td>
                    <td>
                      <select
                        value={String(f.unidade_id)}
                        onChange={(e) => {
                          const unidadeId = Number(e.target.value);
                          setFuncionarios((prev) =>
                            prev.map((item) =>
                              item.id === f.id ? { ...item, unidade_id: unidadeId } : item
                            )
                          );
                        }}
                      >
                        {unidades.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() => saveFuncionario(f)}
                        disabled={savingKey === `fun-${f.id}`}
                      >
                        {savingKey === `fun-${f.id}` ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <small className="muted">
            Página {pagination.page} de {pagination.total_pages} | Total: {pagination.total}
          </small>
          <div className="row">
            <button
              className="secondary"
              onClick={() => load({ page: Math.max(1, pagination.page - 1) })}
              disabled={loading || pagination.page <= 1}
            >
              Anterior
            </button>
            <button
              className="secondary"
              onClick={() => load({ page: Math.min(pagination.total_pages, pagination.page + 1) })}
              disabled={loading || pagination.page >= pagination.total_pages}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
