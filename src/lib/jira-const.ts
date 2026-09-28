/**
 * 지라 상수 중 **클라이언트도 보는 것**.
 *
 * ★ `lib/jira.ts` 는 `server-only` 다 — 토큰을 읽으므로 브라우저에 실리면 안 된다.
 *   그런데 설정 폼(클라이언트)이 우선순위 다섯 등급을 알아야 한다.
 *   그래서 **값만** 이 파일로 뺀다. 두 곳에 적지 않는다 — `lib/jira.ts` 가 여기서 가져간다.
 */

/** 지라 기본 우선순위 다섯 등급 */
export const JIRA_PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"] as const;

/** 지라 키의 모양. `WEB-123` */
export const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]{1,19}-\d{1,8}$/;

export const normalizeJiraKey = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");
