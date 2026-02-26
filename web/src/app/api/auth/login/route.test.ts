/** @jest-environment node */

import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { setSession } from "@/lib/auth";
import { POST } from "./route";

jest.mock("@/lib/db", () => ({
  getSql: jest.fn()
}));

jest.mock("@/lib/auth", () => ({
  setSession: jest.fn()
}));

const mockedGetSql = getSql as jest.MockedFunction<typeof getSql>;
const mockedSetSession = setSession as jest.MockedFunction<typeof setSession>;

function makeRequest(body: unknown, includeOrigin = true): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (includeOrigin) headers.origin = "http://localhost";
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("/api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("bloqueia request sem Origin/Referer", async () => {
    const res = await POST(makeRequest({ provider: "LOCAL", email: "a@b.com", password: "x" }, false));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN_ORIGIN" });
  });

  it("autentica login LOCAL valido", async () => {
    const supervisor = {
      id: 10,
      email: "admin@empresa.com",
      password_hash: bcrypt.hashSync("segredo123", 10),
      unidade_id: 3,
      role: "SUPERVISOR"
    };

    const sql = jest.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO auth_login_attempt")) {
        return [{ count: 0, retry_after_sec: 900 }];
      }
      if (query.includes("SELECT id, email, password_hash, unidade_id, role") && query.includes("FROM supervisor")) {
        return [supervisor];
      }
      if (query.includes("DELETE FROM auth_login_attempt")) {
        return [];
      }
      throw new Error(`Unexpected SQL query: ${query}`);
    });

    mockedGetSql.mockReturnValue(sql as never);

    const res = await POST(
      makeRequest({
        provider: "LOCAL",
        email: supervisor.email,
        password: "segredo123"
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      provider: "LOCAL",
      supervisor: {
        id: supervisor.id,
        email: supervisor.email,
        unidade_id: supervisor.unidade_id,
        role: supervisor.role
      }
    });
    expect(mockedSetSession).toHaveBeenCalledTimes(1);
  });
});

