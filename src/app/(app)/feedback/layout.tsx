import { requireUser } from "@/lib/auth";

/** 의견 보내기 — **프로젝트 밖**(알림·내 계정과 같은 자리). 껍데기는 페이지가 그린다 (A-87). */
export default async function FeedbackLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/feedback");
  return <>{children}</>;
}
