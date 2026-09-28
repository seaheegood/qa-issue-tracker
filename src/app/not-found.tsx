import Link from "next/link";

export const metadata = { title: "찾을 수 없음 · IssueTracker" };

/**
 * 없는 주소로 왔을 때의 화면.
 *
 * ★ 이 파일이 없으면 `notFound()` 가 **Next.js 기본 404**(영문, 우리 껍데기 없음)로 떨어진다.
 *   코드 12곳에서 `notFound()` 를 정성껏 부르고 있었는데 받아줄 화면이 없었다 —
 *   없는 프로젝트 키(`/p/ZZZ`), 없는 이슈 번호, `/p/SP` 같은 반쪽 주소가 전부 여기로 온다.
 *
 * ★ 사이드바를 그리지 않는다. 사이드바는 "지금 보는 프로젝트"의 숫자를 세는데,
 *   여기까지 온 요청은 **그 프로젝트가 없어서** 온 것이다 ((app)/layout.tsx 의 주석과 같은 이유).
 *   대신 `/` 로 보내면 로그인 상태에 맞는 자리로 알아서 데려다준다.
 */
export default function NotFound() {
  return (
    <div className="msg-page">
      <div className="msg-card">
        <div className="msg-brand">
          <span className="logo" />
          <span>IssueTracker</span>
        </div>

        <p className="msg-code">404</p>
        <h1>이 주소에는 아무것도 없습니다</h1>

        <p className="msg-sub">
          주소가 잘못됐거나, 찾는 것이 지워졌거나, 볼 권한이 없는 자리입니다.
        </p>

        <ul className="msg-hints">
          <li>이슈 번호는 <b>프로젝트마다 따로</b> 매겨집니다 — 다른 프로젝트의 번호일 수 있습니다</li>
          <li>링크를 받아서 오셨다면 <b>주소 끝이 잘리지 않았는지</b> 확인해 주세요</li>
        </ul>

        <div className="msg-actions">
          <Link className="btn-primary" href="/">
            내 이슈 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
