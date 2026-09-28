"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { safeInternalPath } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

export type FeedbackState = { error?: string };

/** 의견 한 건 저장 (`docs/11` `F-01`~). 보낸 사람·시각·화면은 **자동으로** 붙는다 — 적게 하지 않는다. */
export async function sendFeedback(_p: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const me = await requireUser("/feedback");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "내용을 적어 주세요." };
  if (body.length > 5000) return { error: "5,000자까지 보낼 수 있습니다." };

  const page = safeInternalPath(fd.get("page"));
  const from = String(fd.get("from") ?? "").replace(/[^A-Za-z0-9]/g, "");
  const ua = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await prisma.feedback.create({ data: { userId: me.id, body, page, userAgent: ua } });

  const q = new URLSearchParams({ sent: "1" });
  if (from) q.set("from", from);
  if (page) q.set("back", page);
  redirect(`/feedback?${q}`);
}
