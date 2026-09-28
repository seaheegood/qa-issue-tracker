"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useSidebarOpen } from "@/components/SidebarToggle";
import { useProjectKey } from "@/components/useProjectKey";

/**
 * 사이드바 «의견 보내기» (2026-09-28).
 *
 * ★ **지금 보고 있는 화면의 주소를 데려간다** (`?page=`). 의견의 절반은 *"여기가 불편해요"* 인데,
 *   «여기» 를 말로 설명하게 하면 안 보낸다. 받는 쪽도 어느 화면인지 되물어야 한다.
 * ★ 걸치고 있는 프로젝트도 데려간다 (`?from=` · A-87) — 보내고 나서 돌아올 사이드바가 맞아야 한다.
 */
export function FeedbackLink() {
  const path = usePathname();
  const sp = useSearchParams();
  const key = useProjectKey(null);
  const collapsed = !useSidebarOpen();
  const on = path === "/feedback";

  const here = path + (sp.toString() ? `?${sp}` : "");
  const q = new URLSearchParams();
  if (key) q.set("from", key);
  if (!on) q.set("page", here);
  const href = `/feedback${q.toString() ? `?${q}` : ""}`;

  return (
    <Link href={href} className={`nav${on ? " on" : ""}`} title={collapsed ? "의견 보내기" : undefined}>
      <span className="ico">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <span className="n">의견 보내기</span>
    </Link>
  );
}
