import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { cellsOf, loadList } from "@/lib/imports";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { ColumnEditor, type EditorColumn } from "./ColumnEditor";
import { deleteList } from "../../actions";

export const metadata = { title: "열 설정 · 이슈 대량등록 · IssueTracker" };

/** 값 예시를 몇 개까지 뽑을지. 무엇을 고를지는 이름보다 값을 봐야 정해진다. */
const SAMPLES = 3;

export default async function ColumnsPage({
  params, searchParams,
}: {
  params: Promise<{ key: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const project = await requireProject(params);
  const { id } = await params;
  const sp = await searchParams;

  const list = await loadList(project.id, Number(id));
  if (!list) notFound();

  const canDelete = list.createdById === user.id || user.systemRole === "ADMIN";

  // 값 예시는 앞쪽 몇 행만 본다. 2만 행을 전부 읽을 이유가 없다.
  const head = await prisma.importedRow.findMany({
    where: { listId: list.id }, orderBy: { rowNo: "asc" }, take: 40,
  });
  const seen = head.map((r) => cellsOf(r.cells));

  const columns: EditorColumn[] = list.columns.map((c) => {
    const key = String(c.sourceIndex);
    const vals: string[] = [];
    for (const row of seen) {
      const v = row[key];
      if (v && !vals.includes(v)) vals.push(v.length > 40 ? `${v.slice(0, 40)}…` : v);
      if (vals.length >= SAMPLES) break;
    }
    return {
      id: c.id,
      sourceIndex: c.sourceIndex,
      sourceHeader: c.sourceHeader,
      label: c.label,
      isSelected: c.isSelected,
      samples: vals,
      blank: vals.length === 0,
    };
  });

  return (
    <>
      <PageHeader title="열 설정" sub={list.name} />
      <main className="admin">
        <section className="admin-sec">
          <p className="backlink">
            <Link href={`/p/${project.key}/imports/${list.id}`}>← {list.name}</Link>
          </p>
          <h2>가져올 열과 순서</h2>
          <p className="admin-hint">
            여기서 정한 순서가 <b>목록 화면과 엑셀 내보내기 양쪽</b>에 그대로 쓰입니다.
            원본 <code>{list.sourceFile}</code> 의 <b>{list.sheetName}</b> 시트에서
            열 {list.columns.length}개를 전부 들고 왔습니다.
          </p>

          <ColumnEditor
            projectKey={project.key}
            listId={list.id}
            listName={list.name}
            columns={columns}
            justImported={sp.new === "1"}
          />

          {canDelete && (
            <form action={deleteList} className="imp-danger">
              <input type="hidden" name="projectKey" value={project.key} />
              <input type="hidden" name="listId" value={list.id} />
              <span>
                이 목록을 지우면 행 {list.rowCount.toLocaleString()}개가 함께 사라집니다.
                원본 엑셀은 그대로이니 다시 가져올 수 있습니다.
              </span>
              <button className="btn-ghost">목록 지우기</button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
