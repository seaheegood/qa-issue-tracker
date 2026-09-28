import { MasterPage } from "../MasterPage";

export const metadata = { title: "플랫폼 설정 · IssueTracker" };

/** 화면은 `MasterPage` 가 그린다 — 우선순위·환경·플랫폼이 같은 모양이기 때문이다 (A-74). */
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  return <MasterPage params={params} kind="platform" />;
}
