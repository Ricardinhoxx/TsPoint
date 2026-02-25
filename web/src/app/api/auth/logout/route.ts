import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { isTrustedMutationRequest } from "@/lib/security";

export async function POST(req: Request) {
  if (!isTrustedMutationRequest(req)) {
    return NextResponse.json({ error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
