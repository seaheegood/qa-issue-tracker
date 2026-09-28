"use client";

import { createContext, useContext } from "react";

/**
 * 지금 프로젝트를 폼에 실어 보내는 장치.
 *
 * ★ 서버 액션은 라우트의 `[key]` 를 못 본다. 폼마다 `projectKey` 를 숨겨 보내야 하는데,
 *   그걸 컴포넌트 21곳에 prop 으로 흘리면 **하나를 빠뜨린다.** 빠뜨리면 그 폼만
 *   조용히 아무 일도 안 한다 — 가장 찾기 어려운 종류의 고장이다.
 *
 * ★ 그래서 컨텍스트로 한 번만 심고, 폼에는 `<ProjectField />` 한 줄을 넣는다.
 *   서버 컴포넌트 안에서도 쓸 수 있다 — Provider 가 위에 있기만 하면 된다.
 */
const Ctx = createContext<string>("");

export function ProjectProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 폼 안에 이 한 줄. 액션이 `fd.get("projectKey")` 로 받는다. */
export function ProjectField() {
  const key = useContext(Ctx);
  return <input type="hidden" name="projectKey" value={key} />;
}

/** 클라이언트에서 링크를 만들 때. `usePK()` → `"SP"` */
export const usePK = () => useContext(Ctx);
