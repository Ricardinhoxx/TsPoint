"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FaceEnrollModal from "@/components/FaceEnrollModal";

type LocalTipo = "LOJA" | "ESCRITORIO" | "CD";

type Unidade = { id: number; nome: string };
type Role = "ADMIN" | "SUPERVISOR";

type Funcionario = {
  id: number;
  nome: string;
  turno: number;
  local_tipo: LocalTipo;
  unidade_id: number;
  status: string;
  hora_entrada_prevista?: string | null;
  hora_saida_prevista?: string | null;
};

function friendlyErrorMessage(raw: unknown): string {
  const code = String(raw ?? "").trim().toUpperCase();
  switch (code) {
    case "INVALID_NOME":
      return "Nome inválido. Informe pelo menos 2 caracteres.";
    case "INVALID_TURNO":
      return "Turno inválido. Selecione 1, 2 ou 3.";
    case "INVALID_LOCAL_TIPO":
      return "Local inválido. Selecione Loja, Escritório ou CD.";
    case "INVALID_UNIDADE":
      return "Unidade inválida. Selecione uma unidade válida.";
    case "DUPLICATE_KEY":
      return "Já existe um cadastro com esses dados.";
    case "INVALID_FUNCIONARIO":
      return "Colaborador inválido para cadastro facial.";
    case "INVALID_IMAGES":
      return "Nenhuma imagem recebida. Capture as fotos e tente novamente.";
    case "TOO_FEW_IMAGES":
      return "Envie pelo menos 3 fotos para cadastrar a base facial.";
    case "TOO_MANY_IMAGES":
      return "Envie no máximo 8 fotos para cadastrar a base facial.";
    case "INVALID_IMAGE_PAYLOAD":
      return "Uma ou mais fotos estão inválidas. Capture novamente.";
    case "FUNCIONARIO_FORBIDDEN":
      return "Você não tem permissão para cadastrar base facial deste colaborador.";
    case "FACE_API_TIMEOUT":
      return "Demorou mais que o esperado. Estamos verificando se o cadastro foi concluído.";
    case "FACE_API_UNREACHABLE":
      return "Serviço facial indisponível. Estamos verificando se o cadastro foi concluído.";
    case "UNAUTHENTICATED":
      return "Sessão expirada. Faça login novamente.";
    default:
      return code || "Falha ao processar a solicitação.";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function optimizeEnrollImages(imagesB64: string[], maxToSend = 5) {
  const unique = Array.from(new Set(imagesB64.filter((img) => typeof img === "string" && img.length > 0)));
  if (unique.length <= maxToSend) return unique;

  const selected: string[] = [];
  const lastIndex = unique.length - 1;
  for (let i = 0; i < maxToSend; i += 1) {
    const idx = Math.round((i * lastIndex) / (maxToSend - 1));
    const candidate = unique[idx];
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
  }

  if (selected.length < maxToSend) {
    for (const img of unique) {
      if (!selected.includes(img)) selected.push(img);
      if (selected.length >= maxToSend) break;
    }
  }

  return selected;
}

export default function CadastrarColaboradorPage() {
  const [role, setRole] = useState<Role>("SUPERVISOR");
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [turno, setTurno] = useState<1 | 2 | 3>(1);
  const [localTipo, setLocalTipo] = useState<LocalTipo>("LOJA");
  const [horaEntradaPrevista, setHoraEntradaPrevista] = useState("08:00");
  const [horaSaidaPrevista, setHoraSaidaPrevista] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Funcionario | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<string | null>(null);
  const selectedUnidade =
    role === "ADMIN"
      ? (unidades.find((u) => u.id === selectedUnidadeId) ?? null)
      : unidade;

  useEffect(() => {
    async function load() {
      const uRes = await fetch("/api/unidade/me");
      if (uRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      const u = await uRes.json().catch(() => null);
      if (!uRes.ok) throw new Error(u?.error ?? `HTTP ${uRes.status}`);
      const nextRole: Role = u?.role === "ADMIN" ? "ADMIN" : "SUPERVISOR";
      setRole(nextRole);

      const mainUnidade = (u?.unidade ?? null) as Unidade | null;
      const listaUnidades = Array.isArray(u?.unidades)
        ? (u.unidades as Unidade[])
        : mainUnidade
          ? [mainUnidade]
          : [];

      setUnidade(mainUnidade);
      setUnidades(listaUnidades);
      setSelectedUnidadeId(mainUnidade?.id ?? listaUnidades[0]?.id ?? null);
    }
    load().catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetUnidadeId =
      role === "ADMIN" ? selectedUnidadeId : (unidade?.id ?? null);
    if (!targetUnidadeId) {
      setError("Selecione uma unidade válida.");
      return;
    }

    setLoading(true);
    setError(null);
    setCreated(null);
    setEnrollResult(null);
    setProcessStatus("Etapa 1/2 em andamento: cadastrando colaborador...");
    try {
      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome,
          turno,
          local_tipo: localTipo,
          unidade_id: targetUnidadeId,
          hora_entrada_prevista: horaEntradaPrevista || null,
          hora_saida_prevista: horaSaidaPrevista || null
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const createdFuncionario = (data?.funcionario ?? null) as Funcionario | null;
      setCreated(createdFuncionario);
      setProcessStatus("Etapa 1/2 concluída: colaborador cadastrado. Falta cadastrar a base facial.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Falha ao cadastrar";
      setError(friendlyErrorMessage(raw));
      setProcessStatus("Processo interrompido: falha no cadastro do colaborador.");
    } finally {
      setLoading(false);
    }
  }

  async function onEnroll(imagesB64: string[]) {
    if (!created?.id) return;
    setError(null);
    setEnrollResult(null);
    const optimizedImages = optimizeEnrollImages(imagesB64, 5);
    setProcessStatus(
      `Etapa 2/2 em andamento: cadastrando base facial (${optimizedImages.length} fotos processadas).`
    );
    const funcionarioId = created.id;

    const checkStatus = async () => {
      const statusRes = await fetch(`/api/face/enroll?funcionario_id=${funcionarioId}`, {
        cache: "no-store"
      });
      const statusData = await statusRes.json().catch(() => null);
      if (!statusRes.ok) {
        return { ready: false, inserted: 0 };
      }
      return {
        ready: Boolean(statusData?.ready),
        inserted: Number(statusData?.inserted ?? 0)
      };
    };

    const res = await fetch("/api/face/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ funcionario_id: funcionarioId, images_b64: optimizedImages })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code = String(data?.error ?? `HTTP ${res.status}`);
      if (code === "FACE_API_TIMEOUT" || code === "FACE_API_UNREACHABLE") {
        setProcessStatus("Etapa 2/2 em verificação: aguardando confirmação no servidor...");
        for (let attempt = 1; attempt <= 12; attempt += 1) {
          const status = await checkStatus();
          if (status.ready) {
            setEnrollResult(`Base facial cadastrada (${status.inserted} imagens).`);
            setProcessStatus("Processo finalizado: colaborador e base facial cadastrados com sucesso.");
            return;
          }
          setProcessStatus(
            `Etapa 2/2 em verificação (${attempt}/12): ainda processando no servidor...`
          );
          await wait(5000);
        }
      }
      throw new Error(code);
    }
    setEnrollResult(`Base facial cadastrada (${data.inserted ?? optimizedImages.length} imagens).`);
    setProcessStatus("Processo finalizado: colaborador e base facial cadastrados com sucesso.");
  }

  return (
    <div className="containerWide">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Cadastrar colaborador</h1>
          <small className="muted">
            {selectedUnidade
              ? `${selectedUnidade.nome} (id=${selectedUnidade.id})`
              : role === "ADMIN"
                ? "Selecione uma unidade"
                : "Carregando unidade..."}
          </small>
        </div>
        <Link className="btnLink secondary" href="/unidade">
          Voltar
        </Link>
      </div>

      <div className="spacer" />

      <div className="card">
        {processStatus ? (
          <>
            <div className="card" style={{ borderColor: "#2563eb" }}>
              Status: {processStatus}
            </div>
            <div className="spacer" />
          </>
        ) : null}

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
            {role === "ADMIN" ? (
              <div style={{ flex: 1 }}>
                <label>Unidade</label>
                <select
                  value={selectedUnidadeId ? String(selectedUnidadeId) : ""}
                  onChange={(e) => setSelectedUnidadeId(Number(e.target.value))}
                  required
                >
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} (id={u.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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
              <label>Entrada prevista</label>
              <input
                type="time"
                value={horaEntradaPrevista}
                onChange={(e) => setHoraEntradaPrevista(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Saída prevista</label>
              <input
                type="time"
                value={horaSaidaPrevista}
                onChange={(e) => setHoraSaidaPrevista(e.target.value)}
              />
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
                      (id={created.id}, turno={created.turno}, local={created.local_tipo}, entrada=
                      {created.hora_entrada_prevista ?? "--:--"}, saída={created.hora_saida_prevista ?? "--:--"})
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
              const raw = e instanceof Error ? e.message : "Falha ao cadastrar base";
              setError(friendlyErrorMessage(raw));
              setProcessStatus("Processo interrompido: falha no cadastro da base facial.");
            }
          }}
        />
      ) : null}
    </div>
  );
}
