"use client";

import Link from "next/link";

import { useProjectKey } from "@/components/useProjectKey";

/**
 * 사이드바 로고 — **지금 보고 있는 프로젝트**의 이슈 목록으로 간다 (`I-24`).
 *
 * ★ 예전엔 `/` 로 보냈다. `/` 는 `firstProjectKey()` 로 **내 첫 프로젝트**를 찾아
 *   보내므로, WEB 를 보다가 로고를 누르면 첫 프로젝트 이슈 목록이 열렸다.
 *   프로젝트가 하나일 땐 안 보이던 고장이다 — 사이드바 숫자가 남의 프로젝트 것을
 *   보여주던 것(`Sidebar`의 `projectKey` 주석)과 **같은 종류**다.
 *
 * 사이드바는 `/p/[key]` **밖**이라 `params` 를 못 받는다. 그래서 `NavLink` 와 똑같이
 * 경로에서 읽고, 프로젝트 밖 화면(팀·사용자·알림)에서는 `fallbackKey` 를 쓴다.
 */
export function BrandLink({ fallbackKey }: { fallbackKey: string | null }) {
  const key = useProjectKey(fallbackKey);
  return (
    <Link href={key ? `/p/${key}/issues` : "/"} className="sb-brand" title="이슈 목록으로">
      <span className="logo" />
      <span className="name">IssueTracker</span>
    </Link>
  );
}
