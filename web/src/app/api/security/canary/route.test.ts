/** @jest-environment node */

import { GET, POST } from "./route";

describe("/api/security/canary", () => {
  it("responde 404 em GET", async () => {
    const req = new Request("http://localhost/api/security/canary", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("responde 404 em POST", async () => {
    const req = new Request("http://localhost/api/security/canary", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

