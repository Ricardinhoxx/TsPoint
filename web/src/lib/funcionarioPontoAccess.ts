import { createHash } from "crypto";

export function hashFuncionarioPontoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function maskAccessToken(token: string): string {
  return `...${token.slice(-6)}`;
}
