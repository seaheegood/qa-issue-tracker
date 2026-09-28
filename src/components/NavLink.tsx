"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSidebarOpen } from "@/components/SidebarToggle";
import { useProjectKey } from "@/components/useProjectKey";

/** 현재 경로면 강조한다. 경로를 알아야 해서 클라이언트 컴포넌트다. */
export function NavLink({
  href,
  icon,
  label,
  badge,
  match,
  fallbackKey,
}: {
  /** `/` 로 시작하면 그대로, 아니면 **지금 프로젝트 안**으로 (`dashboard` → `/p/SP/dashboard`) */
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  /**
   * 강조 판정에 쓸 경로. 안 주면 `href` 로 본다.
   *
   * ★ `href` 에 **쿼리가 붙는 링크**를 위해 있다 — `/admin/teams?from=SP` 는
   *   `usePathname()`(쿼리가 없다)과 절대 같아지지 않아 **영영 강조되지 않는다.**
   */
  match?: string;
  /** 프로젝트 밖 화면에서 쓸 기본 프로젝트 */
  fallbackKey?: string | null;
}) {
  const path = usePathname();
  const key = useProjectKey(fallbackKey ?? null);
  const to = href.startsWith("/") ? href : key ? `/p/${key}/${href}` : "/";
  const m = match ?? to;
  const on = path === m || path.startsWith(m + "/");
  // ★ **접혔을 때만** 툴팁을 단다. 펼친 상태에서 이름 옆에 같은 이름이 또 뜨면
  //   알려주는 게 없으면서 성가시기만 하다.
  const collapsed = !useSidebarOpen();
  return (
    <Link href={to} className={`nav${on ? " on" : ""}`} title={collapsed ? label : undefined}>
      <span className="ico">{icon}</span>
      <span className="n">{label}</span>
      {badge}
    </Link>
  );
}
