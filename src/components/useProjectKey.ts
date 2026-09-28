"use client";

import { usePathname } from "next/navigation";

/**
 * 주소에서 지금 프로젝트를 읽는다 — `/p/SP/issues` → `"SP"`.
 *
 * ★ 사이드바는 `/p/[key]` **밖**(전역 레이아웃)에 있어서 `params` 를 못 받는다.
 *   그렇다고 사이드바를 프로젝트 안으로 옮기면 팀·사용자·알림 화면에서 사라진다.
 *   그래서 경로에서 읽고, 프로젝트 밖 화면에서는 `fallback`(내 첫 프로젝트)을 쓴다.
 */
export function useProjectKey(fallback: string | null): string | null {
  const path = usePathname();
  const m = /^\/p\/([^/]+)/.exec(path ?? "");
  return m ? decodeURIComponent(m[1]) : fallback;
}
