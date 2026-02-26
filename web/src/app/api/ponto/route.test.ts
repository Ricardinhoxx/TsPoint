/** @jest-environment node */

import { getSql } from "@/lib/db";
import { getActiveTabletSession } from "@/lib/tabletSessionGuard";
import { isAdminSession, requireAuth } from "@/lib/rbac";
import { isTrustedMutationRequest } from "@/lib/security";
import { POST } from "./route";

jest.mock("@/lib/db", () => ({
  getSql: jest.fn()
}));

jest.mock("@/lib/tabletSessionGuard", () => ({
  getActiveTabletSession: jest.fn()
}));

jest.mock("@/lib/rbac", () => ({
  requireAuth: jest.fn(),
  isAdminSession: jest.fn()
}));

jest.mock("@/lib/security", () => ({
  isTrustedMutationRequest: jest.fn()
}));

const mockedGetSql = getSql as jest.MockedFunction<typeof getSql>;
const mockedGetActiveTabletSession = getActiveTabletSession as jest.MockedFunction<typeof getActiveTabletSession>;
const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedIsAdminSession = isAdminSession as jest.MockedFunction<typeof isAdminSession>;
const mockedIsTrustedMutationRequest = isTrustedMutationRequest as jest.MockedFunction<typeof isTrustedMutationRequest>;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ponto", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("/api/ponto", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsTrustedMutationRequest.mockReturnValue(true);
    mockedGetActiveTabletSession.mockResolvedValue(null);
    mockedIsAdminSession.mockReturnValue(false);
  });

  it("retorna 401 quando nao autenticado e sem contexto tablet", async () => {
    mockedRequireAuth.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" });

    const res = await POST(makeRequest({ funcionario_id: 1 }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHENTICATED" });
  });

  it("insere ponto inferindo ENTRADA quando nao existe ultimo registro", async () => {
    mockedRequireAuth.mockResolvedValue({
      ok: true,
      role: "SUPERVISOR",
      session: { supervisor: { id: 7, unidade_id: 10, role: "SUPERVISOR" } }
    });

    const tx = jest.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("pg_advisory_xact_lock")) return [];
      if (query.includes("FROM funcionario")) return [{ id: 1, unidade_id: 10 }];
      if (query.includes("SELECT tipo::text as tipo FROM ponto")) return [];
      if (query.includes("INSERT INTO ponto")) {
        return [
          {
            id: 99,
            funcionario_id: 1,
            unidade_id: 10,
            tipo: "ENTRADA",
            timestamp: "2026-02-26T00:00:00.000Z",
            score: null
          }
        ];
      }
      throw new Error(`Unexpected SQL query: ${query}`);
    });

    mockedGetSql.mockReturnValue({
      begin: async (cb: (transaction: typeof tx) => Promise<Response>) => cb(tx)
    } as never);

    const res = await POST(makeRequest({ funcionario_id: 1 }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ponto: {
        funcionario_id: 1,
        unidade_id: 10,
        tipo: "ENTRADA"
      }
    });
  });

  it("retorna 409 quando tipo solicitado duplica ultimo ponto", async () => {
    mockedRequireAuth.mockResolvedValue({
      ok: true,
      role: "SUPERVISOR",
      session: { supervisor: { id: 7, unidade_id: 10, role: "SUPERVISOR" } }
    });

    let insertCalled = false;
    const tx = jest.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("pg_advisory_xact_lock")) return [];
      if (query.includes("FROM funcionario")) return [{ id: 1, unidade_id: 10 }];
      if (query.includes("SELECT tipo::text as tipo FROM ponto")) return [{ tipo: "ENTRADA" }];
      if (query.includes("INSERT INTO ponto")) {
        insertCalled = true;
        return [];
      }
      throw new Error(`Unexpected SQL query: ${query}`);
    });

    mockedGetSql.mockReturnValue({
      begin: async (cb: (transaction: typeof tx) => Promise<Response>) => cb(tx)
    } as never);

    const res = await POST(makeRequest({ funcionario_id: 1, tipo: "ENTRADA" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "DUPLICATE_TIPO" });
    expect(insertCalled).toBe(false);
  });
});

