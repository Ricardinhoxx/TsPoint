"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FaceEnrollModal from "@/components/FaceEnrollModal";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";

type Unidade = { id: number; nome: string };

type Funcionario = {
  id: number;
  nome: string;
  turno: number;
  local_tipo: LocalTipo;
  unidade_id: number;
  status: string;
};

export default function CadastrarColaboradorPage() {
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [nome, setNome] = useState("");
  const [turno, setTurno] = useState<1 | 2 | 3>(1);
  const [localTipo, setLocalTipo] = useState<LocalTipo>("LOJA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Funcionario | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const uRes = await fetch("/api/unidade/me");
      if (uRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const u = await uRes.json().catch(() => null);
      if (!uRes.ok) throw new Error(u?.error ?? `HTTP ${uRes.status}`);
      setUnidade(u.unidade ?? null);
    }
    load().catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEnrollResult(null);
    try {
      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, turno, local_tipo: localTipo })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setCreated(data.funcionario ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  async function onEnroll(imagesB64: string[]) {
    if (!created?.id) return;
    setEnrollResult(null);
    const res = await fetch("/api/face/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ funcionario_id: created.id, images_b64: imagesB64 })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error ?? `HTTP ${res.status}`);
    }
    setEnrollResult(`Base facial cadastrada (${data.inserted ?? "?"} imagens).`);
  }

  return (
    <div className="containerWide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Cadastrar colaborador</h1>
          <small className="muted">
            {unidade ? `${unidade.nome} (id=${unidade.id})` : "Carregando unidade..."}
          </small>
        </div>
        <Link className="btnLink secondary" href="/unidade">
          Voltar
        </Link>
      </div>

      <div className="spacer" />

      <div className="card">
        <form onSubmit={onSubmit}>
          <label>Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            minLength={2}
            placeholder="Ex: João da Silva"
          />

          <div className="spacer" />

          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label>Turno</label>
              <select
                value={String(turno)}
                onChange={(e) => setTurno(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value="1">Turno 1</option>
                <option value="2">Turno 2</option>
                <option value="3">Turno 3</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Local</label>
              <select
                value={localTipo}
                onChange={(e) => setLocalTipo(e.target.value as LocalTipo)}
              >
                <option value="LOJA">Loja</option>
                <option value="ESCRITORIO">Escritório</option>
                <option value="CD">CD</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar colaborador"}
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <>
            <div className="spacer" />
            <div className="card" style={{ borderColor: "#8a1f1f" }}>
              Erro: {error}
            </div>
          </>
        ) : null}

        {created ? (
          <>
            <div className="spacer" />
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div>
                    Criado: <b>{created.nome}</b>{" "}
                    <small className="muted">
                      (id={created.id}, turno={created.turno}, local={created.local_tipo})
                    </small>
                  </div>
                  <small className="muted">
                    Próximo passo: cadastrar a base facial para reconhecimento.
                  </small>
                </div>
                <button onClick={() => setEnrollOpen(true)}>Cadastrar base facial</button>
              </div>
              {enrollResult ? (
                <>
                  <div className="spacer" />
                  <div className="card">{enrollResult}</div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {enrollOpen ? (
        <FaceEnrollModal
          onClose={() => setEnrollOpen(false)}
          onEnroll={async (imagesB64) => {
            try {
              await onEnroll(imagesB64);
              setEnrollOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Falha ao cadastrar base");
            }
          }}
        />
      ) : null}
    </div>
  );
}

