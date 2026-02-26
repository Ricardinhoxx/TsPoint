import { NextResponse } from "next/server";
import { recordSecuritySignal } from "@/lib/securityAudit";

export const runtime = "nodejs";

function notFound(req: Request) {
  recordSecuritySignal(req, {
    category: "CANARY_ENDPOINT_HIT",
    outcome: "alert",
    reason: "CANARY_ACCESSED",
    severity: "high",
    status: 404
  });
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function GET(req: Request) {
  return notFound(req);
}

export async function POST(req: Request) {
  return notFound(req);
}

export async function PUT(req: Request) {
  return notFound(req);
}

export async function PATCH(req: Request) {
  return notFound(req);
}

export async function DELETE(req: Request) {
  return notFound(req);
}

