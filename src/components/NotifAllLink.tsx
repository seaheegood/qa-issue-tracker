"use client";

import Link from "next/link";

import { useProjectKey } from "@/components/useProjectKey";

/**
 * 벨 드롭다운의 `전부 보기` — **지금 프로젝트를 데려간다** (`A-87`).
 *
 * ★ `/notifications` 는 `[key]` 가 없는 주소라, 안 데려가면 저쪽이
 *   `firstProjectKey()` 로 떨어져 **알림을 열었을 뿐인데 첫 프로젝트로 넘어간다.**
 *   설정의 `팀 · 사용자 · 프로젝트 →` 와 같은 고장이었다.
 *
 * 벨 자체는 DB 를 읽는 서버 컴포넌트라 경로를 못 본다. 링크만 떼어 클라이언트로 둔다.
 */
export function NotifAllLink({ fallbackKey }: { fallbackKey?: string | null }) {
  const key = useProjectKey(fallbackKey ?? null);
  return (
    <Link href={key ? `/notifications?from=${key}` : "/notifications"} className="nb-more">
      전부 보기
    </Link>
  );
}
