import { NotificationBell } from "@/components/NotificationBell";
import { SearchBox } from "@/components/SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";

/** 본문 영역 상단바. 사이드바 오른쪽에 붙는다. */
export function PageHeader({
  title,
  sub,
  search,
  keep,
}: {
  title: string;
  sub?: string;
  search?: string;
  /* ★ 건수(`104건 / 2,328`)는 여기 없다. 2026-09-16 에 잠깐 검색창 옆에 뒀다가
     **목록 툴바 윗줄 맨 왼쪽**으로 옮겼다 (사용자 지시). 목록 한 화면만 쓰는 값을
     모든 화면이 쓰는 상단바가 들고 있을 이유가 없다. */
  /**
   * 검색할 때 함께 넘길 현재 필터.
   *
   * ★ 이게 없으면 **필터를 걸어놓고 검색하는 순간 필터가 날아간다.**
   *   SearchBox 는 평범한 GET 폼이라, 히든 인풋으로 넣어주지 않으면
   *   주소창에 `?q=...` 만 남는다 (명세 I-19 "여러 필터는 AND", I-23 "URL에 남는다").
   */
  keep?: Record<string, string | string[] | undefined>;
}) {
  // 배열(다중 선택 필터)은 목록 툴바와 같은 규칙으로 쉼표로 잇는다.
  const hidden: Record<string, string> = {};
  for (const [k, v] of Object.entries(keep ?? {})) {
    if (k === "q" || v === undefined) continue;
    const val = Array.isArray(v) ? v.join(",") : v;
    if (val) hidden[k] = val;
  }
  return (
    <header className="topbar">
      <span className="page-title">{title}</span>
      {sub && <span className="page-sub">{sub}</span>}
      <span className="spacer" />
      <SearchBox defaultValue={search} hidden={hidden} />
      <NotificationBell />
      <ThemeToggle />
    </header>
  );
}
