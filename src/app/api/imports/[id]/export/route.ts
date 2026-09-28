import { NextResponse } from "next/server";
import { formatFull } from "@/lib/ui";

import { requireUser } from "@/lib/auth";
import { cellAt, cellsOf, visibleColumns } from "@/lib/imports";
import { prisma } from "@/lib/prisma";
import { buildXlsx, type Cell } from "@/lib/xlsx";

/**
 * 가져온 고객사 목록을 다시 엑셀로.
 *
 * ★ **화면과 같은 열, 같은 순서.** `visibleColumns()` 를 화면과 함께 쓴다.
 *   이슈 내보내기에서 이미 한 번 배운 것이다 — 조건을 복제하면
 *   *"화면엔 441건인데 파일엔 679건"* 이 된다 (`api/issues/export/route.ts`).
 *   여기서 순서를 따로 계산하면 같은 종류의 사고가 **열 순서**로 난다.
 *
 * ★ 주소에 `[key]` 가 없어 프로젝트는 쿼리로 받는다 (`?p=SP`) — 이슈 내보내기와 같다.
 *   그리고 그 프로젝트에 **정말 속한 목록인지** 반드시 확인한다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireUser();   // 로그인하지 않으면 여기서 /login 으로 튕긴다

  const key = new URL(req.url).searchParams.get("p")?.toUpperCase() ?? "";
  const project = key ? await prisma.project.findUnique({ where: { key } }) : null;
  if (!project) return new NextResponse("프로젝트를 찾을 수 없습니다.", { status: 404 });

  const { id } = await params;
  const list = await prisma.importedList.findFirst({
    where: { id: Number(id), projectId: project.id },
    include: { columns: { orderBy: { sortOrder: "asc" } } },
  });
  if (!list) return new NextResponse("목록을 찾을 수 없습니다.", { status: 404 });

  const cols = visibleColumns(list.columns);
  if (cols.length === 0) {
    return new NextResponse("내보낼 열이 없습니다. 열 설정에서 골라 주세요.", { status: 400 });
  }

  const rows = await prisma.importedRow.findMany({
    where: { listId: list.id },
    orderBy: { rowNo: "asc" },
  });

  // 값은 전부 글자로 둔다. 원본이 날짜였는지 숫자였는지는 이미 읽을 때 정해졌고,
  // 여기서 다시 추측하면 `2026-08-18` 이 숫자로 바뀌는 사고가 난다.
  const body: Cell[][] = rows.map((r) => {
    const cells = cellsOf(r.cells);
    return cols.map((c) => cellAt(cells, c));
  });

  const file = buildXlsx({
    // 시트 이름은 엑셀이 31자까지만 받는다. 넘치면 자른다.
    name: list.sheetName.slice(0, 31) || "목록",
    columns: cols.map((c) => ({ title: c.label, width: 22, wrap: true })),
    rows: body,
  });

  // 파일명에 날짜와 건수를 넣는다 — 이슈 내보내기와 같은 규칙이다.
  // 다운로드 폴더에 여러 벌이 쌓였을 때 이름만으로 구분돼야 한다.
  const stamp = formatFull(new Date()).replace(/-/g, "");
  const safe = list.name.replace(/[\\/:*?"<>|]/g, "_");
  const filename = `${project.key}_${safe}_${stamp}_${body.length}건.xlsx`;

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ★ 한글 파일명은 filename* (RFC 5987) 로 줘야 한다. filename= 만 주면 깨진다.
      "Content-Disposition":
        `attachment; filename="import.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
