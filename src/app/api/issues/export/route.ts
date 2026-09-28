import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { buildWhere, parseFilter, type SearchParams } from "@/lib/issue-filter";
import { prisma } from "@/lib/prisma";
import { CLOSE_REASON_LABEL, formatFull, REPRO_RATE_LABEL } from "@/lib/ui";
import { buildXlsx, type Cell } from "@/lib/xlsx";

// ★ 내보내기는 API 라 라우트에 `[key]` 가 없다. 쿼리로 받는다 — `?p=SP`.
//   목록 화면이 링크를 만들 때 넣어준다.

/**
 * 엑셀 내보내기 (요구사항서 09 · docs/13 D-71~).
 *
 * ★ **지금 보고 있는 목록 그대로** 내보낸다.
 *   목록 화면과 **같은 `buildWhere()`** 를 쓴다. 조건을 복제하면 필터가 하나 늘 때마다
 *   두 곳이 갈라지고, 그때부터 *"화면엔 441건인데 파일엔 679건"* 이 된다.
 *   그래서 6번 작업의 첫 순서가 필터 추출 리팩터링이었다.
 *
 * ★ 칼럼 순서는 **원본 엑셀 그대로**다 (docs/01 2.1 의 B~O열).
 *   docs/01 K6 — *"엑셀과 같은 용어·같은 컬럼 순서로 시작"*. 받아 본 사람이
 *   자기가 쓰던 시트라고 알아볼 수 있어야 한다. 새로 생긴 칸은 **뒤에 붙인다.**
 *
 * ★ 세 개의 코멘트 열(개발·기획·QA)은 되살리지 않는다.
 *   지금은 한 줄의 대화다. 셋으로 쪼개면 대댓글과 시간 순서가 사라진다 —
 *   그게 P1 이었다. 대신 **건수와 링크**를 준다. 링크를 누르면 전부 보인다.
 */

const COLUMNS = [
  { title: "No.", width: 7 },
  { title: "우선순위", width: 10 },
  { title: "환경", width: 9 },
  { title: "시스템", width: 15 },
  { title: "이슈 발생 화면", width: 20 },
  { title: "테스트 경로", width: 42, wrap: true },
  // ★ 2026-09-16 신설. `이슈 내용` **앞**이다 — 파일을 열었을 때
  //   화면 목록과 같은 순서로 읽혀야 한다.
  { title: "이슈타이틀", width: 34, wrap: true },
  { title: "이슈 내용", width: 42, wrap: true },
  { title: "테스트 기대값", width: 42, wrap: true },
  { title: "QAI #", width: 10 },
  { title: "작성자", width: 10 },
  { title: "이슈발생일", width: 12 },
  { title: "이슈현황", width: 13 },
  { title: "개발작업자", width: 11 },
  { title: "개발작업일", width: 12 },
  // ── 여기부터는 엑셀에 없던 칸이다
  { title: "차수", width: 8 },
  { title: "플랫폼", width: 12 },
  { title: "검출 버전", width: 11 },
  { title: "반영 버전", width: 11 },
  { title: "재현율", width: 9 },
  { title: "종결 사유", width: 12 },
  { title: "코멘트", width: 8 },
  { title: "첨부", width: 7 },
  { title: "링크", width: 34 },
];

/** 날짜는 ISO 글자로 넣는다. 엑셀 날짜 일련번호는 시간대에서 하루씩 밀린다. */
const day = (d: Date | null) => (d ? formatFull(d) : null);

export async function GET(req: Request) {
  await requireUser();   // 로그인하지 않으면 여기서 /login 으로 튕긴다

  const key = new URL(req.url).searchParams.get("p")?.toUpperCase() ?? "";
  const project = key
    ? await prisma.project.findUnique({ where: { key } })
    : null;
  if (!project) return new NextResponse("프로젝트를 찾을 수 없습니다.", { status: 404 });

  const url = new URL(req.url);
  const sp: SearchParams = Object.fromEntries(url.searchParams.entries());
  const f = parseFilter(sp);

  const issues = await prisma.issue.findMany({
    where: buildWhere(project.id, f),
    orderBy: { seq: "asc" },
    include: {
      status: { select: { name: true } },
      priority: { select: { name: true } },
      environment: { select: { name: true } },
      system: { select: { name: true } },
      round: { select: { name: true } },
      platforms: { include: { platform: { select: { name: true } } } },
      reporter: { select: { name: true } },
      assignee: { select: { name: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  });

  // ★ **`url.origin` 을 쓰면 안 된다.** `next start -H 0.0.0.0` 으로 띄우므로
  //   `req.url` 의 호스트가 **바인드 주소(`0.0.0.0`)** 다 — 내보낸 파일의 링크가
  //   `http://0.0.0.0:3000/...` 이 되어 **어느 기기에서도 안 열린다** (2026-09-11 발견).
  //   사람이 실제로 접속한 주소는 `Host` 헤더에 있다. 프록시 뒤라면 `x-forwarded-*`.
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || url.host;
  const proto = h.get("x-forwarded-proto") || url.protocol.replace(":", "");
  // ★ 경로도 **프로젝트를 포함해야** 한다. 멀티 프로젝트로 옮기면서 최상위 `/issues`
  //   세그먼트가 사라졌다 — `/issues/1702` 는 404 이고 `/p/SP/issues/1702` 가 맞다.
  const origin = `${proto}://${host}`;
  const rows: Cell[][] = issues.map((i) => [
    i.seq,
    i.priority?.name ?? null,
    i.environment?.name ?? null,
    i.system?.name ?? null,
    i.legacyScreenName,
    i.testPath,
    i.title,
    i.content,
    i.expected,
    i.externalRef,
    i.reporter?.name ?? null,
    day(i.reportedAt),
    i.status.name,
    i.assignee?.name ?? null,
    day(i.resolvedAt),
    i.round?.name ?? "미분류",
    i.platforms.map((p) => p.platform.name).join(" · ") || null,
    i.foundVersion,
    i.fixedVersion,
    i.reproRate ? REPRO_RATE_LABEL[i.reproRate] : null,
    i.closeReason ? CLOSE_REASON_LABEL[i.closeReason] : null,
    i._count.comments,
    i._count.attachments,
    `${origin}/p/${project.key}/issues/${i.seq}`,
  ]);

  const buf = buildXlsx({ name: "이슈리스트", columns: COLUMNS, rows });

  // 파일 이름에 **오늘 날짜와 건수**를 넣는다. 다운로드 폴더에 여러 벌이 쌓였을 때
  // 어느 게 무엇인지 파일명만으로 구분돼야 한다.
  const stamp = formatFull(new Date()).replace(/-/g, "");
  const name = `${project.key}_이슈리스트_${stamp}_${rows.length}건.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ★ 한글 파일명은 filename* (RFC 5987) 로 줘야 한다.
      //   filename= 만 주면 브라우저가 깨진 이름으로 저장한다. 첨부 다운로드와 같은 방식이다.
      "Content-Disposition":
        `attachment; filename="issues.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
