import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { cellAt, cellsOf, loadList, visibleColumns } from "@/lib/imports";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

export const metadata = { title: "이슈 대량등록 · IssueTracker" };

const PER = 50;

/**
 * 올린 목록 하나 — **동적 컬럼 표**.
 *
 * ★ 열이 코드에 없다. `imported_columns` 가 정한다.
 *   그래서 고객사가 열을 바꿔 와도 코드를 안 고친다 (FR-907 의 요지).
 *
 * ★ 열 순서는 `visibleColumns()` **한 곳**에서 나온다.
 *   엑셀 내보내기도 같은 함수를 쓴다 — 화면과 파일의 순서가 갈라지면
 *   받은 쪽이 "이게 그 표 맞나" 를 매번 묻게 된다.
 */
export default async function ImportedListPage({
  params, searchParams,
}: {
  params: Promise<{ key: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const project = await requireProject(params);
  const { id } = await params;
  const sp = await searchParams;

  const list = await loadList(project.id, Number(id));
  if (!list) notFound();


  const cols = visibleColumns(list.columns);
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  // 검색은 DB 가 아니라 여기서 한다. 한 목록이 최대 2만 행이고, JSON 안을
  // MySQL 로 훑는 것보다 통째로 읽어 거르는 편이 단순하고 충분히 빠르다.
  const all = await prisma.importedRow.findMany({
    where: { listId: list.id },
    orderBy: { rowNo: "asc" },
  });

  const rows = q
    ? all.filter((r) => {
        const c = cellsOf(r.cells);
        return cols.some((col) => cellAt(c, col).toLowerCase().includes(q.toLowerCase()));
      })
    : all;

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER));
  const shown = rows.slice((page - 1) * PER, page * PER);

  const url = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) u.delete(k);
      else u.set(k, v);
    }
    const s = u.toString();
    return `/p/${project.key}/imports/${list.id}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title={list.name} sub={`${list.rowCount.toLocaleString()}행`} />
      <main className="admin">
        <section className="admin-sec">
          <p className="backlink">
            <Link href={`/p/${project.key}/imports`}>← 이슈 대량등록</Link>
          </p>

          <div className="imp-head">
            <h2>{list.name}</h2>
            <div className="imp-head-btns">
              <a className="btn-export" href={`/api/imports/${list.id}/export?p=${project.key}`}>
                엑셀 내보내기
              </a>
              <Link className="btn-ghost" href={`/p/${project.key}/imports/${list.id}/columns`}>
                열 설정
              </Link>
              {/* ★ 여기가 **이슈로 만드는 입구**다. 원본은 그대로 남는다 (2026-09-16) */}
              <Link className="btn-new" href={`/p/${project.key}/imports/${list.id}/mapping`}>
                이슈로 등록
              </Link>
            </div>
          </div>

          <p className="admin-hint imp-meta">
            <code>{list.sourceFile}</code> · 시트 <b>{list.sheetName}</b> ·
            머리글 {list.headerRow}줄 · 데이터 {list.dataRow}줄부터 ·
            {" "}가져온이 {list.createdBy.name}
            <br />
            열 <b>{cols.length}개</b>를 보고 있습니다 (원본 {list.columns.length}열).
            {cols.length < list.columns.length && (
              <> 감춘 열은 <Link href={`/p/${project.key}/imports/${list.id}/columns`}>열 설정</Link>에서 다시 켤 수 있습니다.</>
            )}
          </p>

          {/* 검색은 이 목록 안에서만 도는 평범한 GET 폼이다 */}
          <form className="imp-search" action={`/p/${project.key}/imports/${list.id}`}>
            <input name="q" defaultValue={q} placeholder="이 목록에서 찾기" aria-label="이 목록에서 찾기" />
            <button className="btn-ghost">찾기</button>
            {q && <Link className="chip-clear" href={url({ q: undefined, page: undefined })}>지우기</Link>}
          </form>

          {cols.length === 0 ? (
            <p className="empty">보여줄 열이 하나도 없습니다. 열 설정에서 골라 주세요.</p>
          ) : total === 0 ? (
            <p className="empty">{q ? `'${q}' 에 맞는 행이 없습니다.` : "행이 없습니다."}</p>
          ) : (
            <div className="tablewrap imp-table" style={{ marginTop: 10 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="imp-rn">줄</th>
                    {cols.map((c) => <th key={c.id}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const cells = cellsOf(r.cells);
                    return (
                      <tr key={r.id}>
                        <td className="imp-rn">{r.rowNo}</td>
                        {cols.map((c) => (
                          <td key={c.id} className="imp-cell"><span className="imp-clamp">{cellAt(cells, c)}</span></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > 0 && (
            <div className="pageinfo">
              <span className="pi-range">
                <b>{((page - 1) * PER + 1).toLocaleString()}</b>–
                <b>{Math.min(page * PER, total).toLocaleString()}</b>
                {" / "}{total.toLocaleString()}행
                {totalPages > 1 && <span className="pi-pg">{page} / {totalPages}쪽</span>}
              </span>
            </div>
          )}

          {totalPages > 1 && (
            <nav className="pager">
              {page > 1 && <Link href={url({ page: String(page - 1) })}>‹</Link>}
              <span className="current">{page}</span>
              {page < totalPages && <Link href={url({ page: String(page + 1) })}>›</Link>}
            </nav>
          )}
        </section>
      </main>
    </>
  );
}
