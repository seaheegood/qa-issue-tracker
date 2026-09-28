import type { Metadata } from "next";

import { colsInitScript, colWidthInitScript } from "@/lib/issue-columns";
import { peekInitScript } from "@/components/PeekResizer";
import { sidebarInitScript } from "@/components/SidebarToggle";
import { themeInitScript } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "IssueTracker",
  description: "이슈를 한 곳에서 추적하는 사내 플랫폼",
};

/**
 * 최상위 레이아웃은 html/body 껍데기만 담당한다.
 * 사이드바가 있는 화면은 (app)/layout.tsx 가, 로그인 화면은 login/ 이 각자 그린다.
 * — 로그인 화면에 사이드바가 나오면 안 되기 때문이다.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/*
          ★ 여기 있는 다섯은 전부 **첫 페인트 전에** 값을 정해야 하는 것들이다.
            브라우저에만 저장된 값(localStorage)이라 서버는 알 수 없고, 나중에 읽으면
            **기본값으로 한 번 그려졌다가 튄다.** 그래서 blocking <script> 로 둔다.

          ⚠️ 다섯을 하나로 합치고 싶어지는데, 그러면 **주인이 사라진다.**
            각자 자기 컴포넌트가 스크립트를 내보내고(`ThemeToggle`·`PeekResizer`·
            `SidebarToggle`) 여기서는 줄 세우기만 한다. 기능을 지울 때 같이 지워진다.

          ══ ⚠️⚠️ 이 스크립트들을 `<head>` 로 옮기지 말 것 (2026-09-17) ═══════════
            원래 `<head>` 에 있었다. 거기가 제자리처럼 보이기 때문이다.
            **그런데 React 19 는 `<head>` 를 특별하게 다룬다** — `<title>`·`<meta>`·
            `<link>` 를 끌어올리고(hoist) 중복을 걷어내며 순서를 다시 잡는다.
            거기에 우리 인라인 `<script>` 다섯이 섞여 있으면 **하이드레이션 때
            `<head>` 자식들의 짝이 어긋나고, React 는 문서를 통째로 다시 그린다.**

            그러면 이 스크립트가 `<html>` 에 찍어 둔 설정 넷이 **전부 지워진다** —
            `data-theme`·`data-sidebar`·`data-cols`·`data-issue-view`.
            즉 **어두운 테마가 밝게 튀고, 접어 둔 사이드바가 펴지고, 고른 컬럼이
            기본값으로 되돌아갔다.** 프로덕션 빌드에서 다른 화면을 거쳐 들어올 때
            10번 중 6~8번 났고, 개발 모드에서는 한 번도 안 나서 오래 못 봤다.

            `<body>` 맨 앞은 React 의 `<head>` 재조립과 무관하고, 여전히 **본문보다
            먼저 실행**되므로 첫 페인트 전에 값이 정해진다 — 깜빡임도 없다(측정함).
            옮긴 뒤 같은 이동 11쌍 × 10회 = **110회 전부 통과.**
        */}
        {/* 화면이 그려지기 전에 테마를 정한다. 없으면 흰 화면이 한 번 번쩍인다. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* 같은 이유로 패널 폭·여는 방식도 먼저 정한다 — 안 그러면 기본값으로 한 번 그려진다 */}
        <script dangerouslySetInnerHTML={{ __html: peekInitScript }} />
        {/* 같은 이유로 사이드바 접힘도 여기서 정한다. 없으면 펼친 채 그려졌다가 접힌다. */}
        <script dangerouslySetInnerHTML={{ __html: sidebarInitScript }} />
        {/* 목록에서 어떤 컬럼을 볼지. 서버는 모르므로 여기서 <html> 에 찍는다 */}
        <script dangerouslySetInnerHTML={{ __html: colsInitScript }} />
        {/* 손으로 끌어서 바꾼 칸 폭도 같은 이유로 여기서 */}
        <script dangerouslySetInnerHTML={{ __html: colWidthInitScript }} />
        {children}
      </body>
    </html>
  );
}
