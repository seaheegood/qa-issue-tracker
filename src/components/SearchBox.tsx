"use client";

import { useEffect, useRef } from "react";

import { useProjectKey } from "@/components/useProjectKey";

/**
 * 검색창. ⌘K / Ctrl+K 로 포커스가 잡힌다.
 * 폼 제출은 평범한 GET 이라 자바스크립트가 꺼져도 동작한다.
 */
export function SearchBox({ defaultValue, hidden, fallbackKey }: {
  defaultValue?: string;
  hidden?: Record<string, string>;
  /** 프로젝트 밖 화면(팀·사용자·알림)에서 검색했을 때 갈 곳 */
  fallbackKey?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // ★ 검색은 **지금 프로젝트 안**을 찾는다. `/issues` 로 두면 그런 주소가 이제 없다.
  const pk = useProjectKey(fallbackKey ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === ref.current) {
        ref.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form className="searchwrap" method="get" action={pk ? `/p/${pk}/issues` : "/"}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span className="si">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </span>
      <input
        ref={ref}
        type="search"
        name="q"
        defaultValue={defaultValue ?? ""}
        placeholder="이슈 검색"
        autoComplete="off"
      />
      <span className="kbd">⌘K</span>
    </form>
  );
}
