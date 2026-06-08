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

const originalEnv = process.env;
const imageB64 = "a".repeat(120);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/face/recognize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("/api/face/recognize", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FACE_API_URL: "http://face-api.local",
      FACE_API_SECRET: "internal-secret"
    };
    mockedIsTrustedMutationRequest.mockReturnValue(true);
    mockedGetActiveTabletSession.mockResolvedValue(null);
    mockedIsAdminSession.mockReturnValue(false);
    mockedGetSql.mockReturnValue(jest.fn(async () => []) as never);
    global.fetch = jest.fn(async () =>
      Response.json({
        matched: false
      })
    ) as jest.Mock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("envia unidade do supervisor para limitar reconhecimento", async () => {
    mockedRequireAuth.mockResolvedValue({
      ok: true,
      role: "SUPERVISOR",
      session: { supervisor: { id: 1, unidade_id: 77, role: "SUPERVISOR" } }
    });

    const res = await POST(makeRequest({ image_b64: imageB64 }));

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      unidade_id: 77,
      image_b64: imageB64
    });
    expect(init.headers["x-internal-secret"]).toBe("internal-secret");
  });

  it("envia unidade null para admin global", async () => {
    mockedRequireAuth.mockResolvedValue({
      ok: true,
      role: "ADMIN",
      session: { supervisor: { id: 1, unidade_id: 77, role: "ADMIN" } }
    });
    mockedIsAdminSession.mockReturnValue(true);

    const res = await POST(makeRequest({ image_b64: imageB64 }));

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      unidade_id: null,
      image_b64: imageB64
    });
  });

  it("usa a unidade do tablet quando nao ha sessao web", async () => {
    mockedRequireAuth.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" });
    mockedGetActiveTabletSession.mockResolvedValue({
      tablet: {
        access_id: 5,
        unidade_id: 12,
        unidade_nome: "Unidade 12",
        nome_dispositivo: "Tablet"
      }
    });

    const res = await POST(makeRequest({ image_b64: imageB64 }));

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      unidade_id: 12,
      image_b64: imageB64
    });
  });
});
