import { MobileNav } from "@/components/MobileNav";
import { PopupClose } from "@/components/PopupClose";
import { Sidebar } from "@/components/Sidebar";
import { ToastHost } from "@/components/Toast";
import { requireUser } from "@/lib/auth";

/**
 * 사이드바 + 본문.
 *
 * ★ `projectKey` 를 **반드시** 넘긴다. 프로젝트 안이면 주소의 그것,
 *   프로젝트 밖(팀·사용자·알림)이면 내 첫 프로젝트를 넘긴다.
 */
export async function Shell({ projectKey, children }: {
  projectKey: string | null;
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="app">
      <PopupClose />
      {/* ★ 좁은 화면에서는 서랍, 넓은 화면에서는 `display:contents` 라 껍데기가 사라진다.
          그래서 사이드바는 **한 번만** 그려진다 (DB 조회도 한 번). `docs/05` §7 */}
      <MobileNav>
        <Sidebar user={user} projectKey={projectKey} />
      </MobileNav>
      <div className="main">{children}</div>
      {/* 저장했다는 말은 화면에 하나뿐이어야 한다 — 여기서만 그린다 */}
      <ToastHost />
    </div>
  );
}
