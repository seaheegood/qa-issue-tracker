import "server-only";

import { revalidatePath } from "next/cache";

/**
 * 이슈를 고쳤을 때 다시 그려야 할 화면들.
 *
 * ★ **왜 함수로 묶었는가** (2026-08-24 피드백 3번)
 *   멀티 프로젝트로 옮기면서 주소가 `/issues/{seq}` → `/p/{key}/issues/{seq}` 로 바뀌었는데
 *   `revalidatePath("/issues/…")` 는 **그대로 남았다.** 없는 주소를 무효화하니
 *   아무 일도 일어나지 않고, **오류도 안 난다.** 그래서 *"새로고침해야만 반영된다"* 가
 *   화면 전체에서 났는데도 한참을 몰랐다.
 *
 *   주소를 손으로 적는 한 같은 일이 또 난다. 부를 곳을 한 곳으로 모아
 *   **프로젝트 key 를 반드시 받게** 만든다 — 빠뜨리면 타입이 먼저 막는다.
 *   (필터 조건을 `issue-filter.ts` 한 곳에서만 만드는 것과 같은 이유다.)
 */
export function revalidateIssue(projectKey: string, seq?: number | null) {
  if (seq != null) revalidatePath(`/p/${projectKey}/issues/${seq}`);
  revalidatePath(`/p/${projectKey}/issues`);
  // 대시보드의 숫자는 목록 결과와 같아야 한다. 여기서 같이 무효화하지 않으면
  // "화면의 숫자 = 링크 결과 건수" 가 깨진다 (docs/10).
  revalidatePath(`/p/${projectKey}/dashboard`);
}

/**
 * 프로젝트를 가리지 않고 **모든** 이슈 화면.
 *
 * 팀 색·소속처럼 전역 설정이 바뀌면 어느 프로젝트의 목록이든 다시 그려야 한다.
 * 프로젝트를 하나씩 돌지 않고 **라우트 패턴**으로 한 번에 무효화한다
 * (`/p/[key]/issues` + `type:"page"` — 동적 구간이 있으면 type 이 필수다).
 */
export function revalidateAllIssueScreens() {
  revalidatePath("/p/[key]/issues", "page");
  revalidatePath("/p/[key]/issues/[seq]", "page");
  revalidatePath("/p/[key]/dashboard", "page");
}

/**
 * 우선순위 · 환경 · 플랫폼 · 시스템 · 차수 — **이슈의 선택지**를 고쳤을 때.
 *
 * ★ 무효화할 곳이 다섯이다. 손으로 적으면 반드시 하나를 빠뜨리고, 빠뜨려도
 *   **오류가 안 난다** — *"껐는데 등록 화면엔 그대로 있다"* 로만 드러난다.
 *   그래서 손으로 적지 않고 여기 한 곳에 묶는다.
 *
 * @param tab 방금 고친 설정 탭의 주소 조각 (`priorities` · `platforms` …)
 */
export function revalidateMasters(projectKey: string, tab: string) {
  revalidatePath(`/p/${projectKey}/admin/${tab}`);
  revalidatePath(`/p/${projectKey}/issues`);
  revalidatePath(`/p/${projectKey}/issues/new`);
  revalidatePath(`/p/${projectKey}/issues/[seq]`, "page");
  // 대시보드는 이 값들로 막대를 그린다 — 이름·색이 바뀌면 같이 바뀌어야 한다
  revalidatePath(`/p/${projectKey}/dashboard`);
  // 템플릿 설정도 같은 선택지를 쓴다
  revalidatePath(`/p/${projectKey}/admin/templates`);
}
