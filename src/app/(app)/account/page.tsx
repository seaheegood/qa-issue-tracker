import { PageHeader } from "@/components/PageHeader";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { envOn, appEnv } from "@/lib/db-url";
import { contextProjectKey } from "@/lib/project";

import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "내 계정 · IssueTracker" };

/** 내 계정 — 지금은 비밀번호 변경뿐이다 (`docs/11` 2-1 · `L-10`~`L-19`). */
export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ from?: string; changed?: string; ended?: string }>;
}) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const key = await contextProjectKey(sp.from);
  const demo = envOn(appEnv("DEMO"));
  const ended = Number(sp.ended ?? 0) || 0;

  return (
    <Shell projectKey={key}>
      <PageHeader title="내 계정" />
      <main className="account">
        <p className="account-who">
          <b>{user.name}</b> <span className="dim">· {user.loginId}</span>
        </p>

        <h2 className="account-h">비밀번호 변경</h2>

        {sp.changed === "1" && (
          <p className="account-ok" role="status">
            ✓ 비밀번호를 바꿨습니다.
            {ended > 0
              ? ` 다른 기기에서 로그인돼 있던 ${ended}곳은 로그아웃됐습니다.`
              : " 이 화면의 로그인은 그대로 유지됩니다."}
          </p>
        )}
        {demo && (
          <p className="account-note">체험용 데모는 모두가 같은 계정을 써서 비밀번호를 바꿀 수 없습니다.</p>
        )}

        <PasswordForm disabled={demo} />

        <p className="account-note">
          바꾸면 <b>다른 기기의 로그인은 모두 끊기고</b> 지금 이 화면만 남습니다.
          비밀번호를 잊었으면 관리자에게 초기화를 부탁하세요.
        </p>
      </main>
    </Shell>
  );
}
