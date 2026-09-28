import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { envOn, appEnv } from "@/lib/db-url";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인 · IssueTracker" };

/**
 * ★ **데모로 띄운 것인가** (`IT_DEMO=1`).
 *
 *   공개된 곳에 올린 체험용 인스턴스에서만 켠다. 켜지면 두 가지가 달라진다 —
 *   ① 부제가 «체험용 데모» 가 되고 ② **계정을 화면에 적어 둔다.**
 *
 *   ⚠️ 사내 운영에서는 **절대 켜지 않는다.** 켜는 순간 로그인 화면이
 *   아이디와 비밀번호를 그대로 광고한다. 그래서 기본값이 «꺼짐» 이다.
 *
 *   ★ 사내에서 «시험 운영» 표시를 없앴던 것(2026-08-26)과 모순이 아니다.
 *     그때 지운 건 *쓰는 사람에게* 임시라고 말하는 표시였고,
 *     여기는 *처음 보는 사람에게* 들어오는 방법을 알려주는 안내다.
 */
const DEMO = envOn(appEnv("DEMO"));

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 이미 로그인했으면 로그인 화면을 보여줄 이유가 없다
  if (await getCurrentUser()) redirect("/");

  const sp = await searchParams;
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  // 우리 사이트 안의 경로만 허용한다 (열린 리다이렉트 방지)
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";

  return (
    <div className="login-page">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <div className="login-card">
        <div className="login-brand">
          <span className="logo" />
          <span>IssueTracker</span>
        </div>

        <h1>로그인</h1>
        <p className="login-sub">{DEMO ? "체험용 데모 · 가상 데이터" : "이슈 트래커"}</p>

        <LoginForm next={next} demo={DEMO} />

        {DEMO ? (
          <p className="login-foot">
            아래 계정으로 바로 들어오실 수 있습니다.
            <br />
            <b>demo</b> / <b>demo1234</b>
            <br />
            <br />
            이 화면의 프로젝트·사람·이슈는 <b>전부 시연을 위해 지어낸 것</b>입니다.
            실제 업무 데이터는 들어 있지 않습니다.
          </p>
        ) : (
          <p className="login-foot">
            계정이 없거나 비밀번호를 모르면 <b>관리자에게 문의</b>하세요.
            <br />
            사내 계정 연동(SSO)은 계정 체계가 확인된 뒤에 붙습니다.
          </p>
        )}
      </div>
    </div>
  );
}
