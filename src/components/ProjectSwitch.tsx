"use client";

import Link from "next/link";

import { useProjectKey } from "@/components/useProjectKey";

/**
 * 프로젝트 고르개 (P-1).
 *
 * ★ 예전에 여기 `+ 프로젝트 추가 · 준비 중` 이 적혀 있었다. 이제 실제로 만든다.
 * ★ 고르면 **같은 화면의 그 프로젝트**로 가는 게 아니라 목록으로 간다 —
 *   이슈 번호가 프로젝트별이라 `/p/A/issues/1702` 를 `/p/B/issues/1702` 로
 *   바꾸면 **엉뚱한 이슈**가 열린다.
 */
type P = { id: number; key: string; name: string };

export function ProjectSwitch({ projects, fallback }: { projects: P[]; fallback: string | null }) {
  const key = useProjectKey(fallback);
  const now = projects.find((x) => x.key === key) ?? null;

  return (
    <details className="proj">
      <summary title={now ? `${now.key} · ${now.name}` : "프로젝트 없음"}>
        <span className="pkey">{now?.key ?? "—"}</span>
        <span className="pname">{now?.name ?? "프로젝트 없음"}</span>
        <span className="pcaret">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="proj-menu">
        {projects.map((x) => (
          <Link
            key={x.id}
            href={`/p/${x.key}/issues`}
            className={`item${x.key === now?.key ? " on" : ""}`}
          >
            <span className="pkey">{x.key}</span>
            {x.name}
          </Link>
        ))}
        <div className="sep" />
        <Link href="/admin/projects" className="item add">＋ 새 프로젝트</Link>
      </div>
    </details>
  );
}
