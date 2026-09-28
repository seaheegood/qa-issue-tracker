import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { buildIssue, toMapped, whyCannotCommit, type BuildCtx } from "@/lib/import-build";
import { readPlan, type MasterField } from "@/lib/import-map";
import {
  cellsOf, distinctValues, initialStatusOf, loadList, masterChoices,
} from "@/lib/imports";
import { people } from "@/lib/people";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";
import { formatFull } from "@/lib/ui";

import { CommitForm } from "./CommitForm";
import { MappingEditor, type EditorColumn } from "./MappingEditor";
import { TargetForm } from "./TargetForm";

export const metadata = { title: "이슈 대량등록 · IssueTracker" };

/** 미리보기로 보여줄 줄 수. 표를 읽는 게 목적이지 전부 보는 게 목적이 아니다. */
const PREVIEW = 8;

/**
 * 이슈 대량등록 — 가져온 원본을 **진짜 이슈로** 만든다 (2026-09-16 · 팀장 지시).
 *
 * 한 화면에 세 걸음을 세로로 둔다. 페이지를 나누지 않은 이유는
 * **셋이 서로를 본다**는 것이다 — 대상 프로젝트가 바뀌면 고를 수 있는 우선순위가
 * 바뀌고, 매핑이 바뀌면 미리보기의 건수가 바뀐다. 화면이 갈라지면
 * *"아까 고른 게 지금 것과 같은가"* 를 사람이 외워야 한다.
 *
 * ★ **원본은 그대로 남는다.** 이슈를 만든 뒤에도 `imported_rows` 는 안 지운다 —
 *   잘못 들어갔을 때 대조할 길이 있어야 한다 (사용자 확정).
 */
export default async function MappingPage({
  params,
}: {
  params: Promise<{ key: string; id: string }>;
}) {
  const user = await requireUser();
  const project = await requireProject(params);
  const { id } = await params;

  const list = await loadList(project.id, Number(id));
  if (!list) notFound();

  // ★ **활성 프로젝트 전부**에서 고른다 (팀장 지시). 파일은 여기서 열었지만
  //   이슈는 저기로 들어가는 일이 실제로 있다.
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, key: true, name: true,
      rounds: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      },
    },
    orderBy: { id: "asc" },
  });

  const target = projects.find((p) => p.id === list.targetProjectId) ?? null;
  const [masters, status, ppl] = await Promise.all([
    target ? masterChoices(target.id) : Promise.resolve(null),
    target ? initialStatusOf(target.id) : Promise.resolve(null),
    people(),
  ]);

  const rows = await prisma.importedRow.findMany({
    where: { listId: list.id },
    orderBy: { rowNo: "asc" },
    select: { id: true, rowNo: true, cells: true, issueId: true, importError: true },
  });

  // 열마다 **실제로 들어 있는 값**. 이름만 보고는 무엇을 고를지 정할 수 없다 (`IM-26`).
  const values = distinctValues(rows, list.columns);
  const columns: EditorColumn[] = list.columns.map((c, i) => ({
    id: c.id,
    label: c.label,
    sourceHeader: c.sourceHeader,
    sourceIndex: c.sourceIndex,
    isSelected: c.isSelected,
    targetField: c.targetField,
    valueMap: (c.valueMap ?? null) as Record<string, string> | null,
    values: values[i]?.values ?? [],
    tooMany: values[i]?.tooMany ?? false,
  }));

  const plan = readPlan(list.defaults);
  const cols = toMapped(list.columns);
  const blocked = whyCannotCommit(cols, plan, !!target);

  // ── 미리보기. **등록과 같은 함수**를 쓴다 — 여기서 236건이라 했으면 거기서도 236건이다.
  const done = rows.filter((r) => r.issueId !== null).length;
  const todo = rows.filter((r) => r.issueId === null);

  let willCreate = 0;
  let willFail = 0;
  const preview: { rowNo: number; title: string; cells: string[]; error?: string }[] = [];

  if (!blocked && target && masters) {
    const ctx: BuildCtx = {
      cols, plan, masters, people: ppl, uploaderId: user.id, now: new Date(),
    };
    const label = (kind: MasterField, code: string | null) =>
      masters[kind].find((m) => m.code === code)?.name ?? "—";

    for (const r of todo) {
      const built = buildIssue(cellsOf(r.cells), ctx);
      if (built.ok) willCreate++;
      else willFail++;
      if (preview.length < PREVIEW) {
        preview.push(
          built.ok
            ? {
                rowNo: r.rowNo,
                title: built.issue.title,
                cells: [
                  masters.priority.find((m) => m.id === built.issue.priorityId)?.name ?? "—",
                  masters.environment.find((m) => m.id === built.issue.environmentId)?.name ?? "—",
                  masters.system.find((m) => m.id === built.issue.systemId)?.name ?? "—",
                  label("reproRate", built.issue.reproRate),
                  ppl.find((p) => p.id === built.issue.reporterId)?.name ?? "—",
                  formatFull(built.issue.reportedAt),
                ],
              }
            : { rowNo: r.rowNo, title: "", cells: [], error: built.error },
        );
      }
    }
  }

  const failedRows = rows.filter((r) => r.issueId === null && r.importError);

  return (
    <>
      <PageHeader title="이슈 대량등록" sub={list.name} />
      <main className="admin">
        <section className="admin-sec">
          <p className="backlink">
            <Link href={`/p/${project.key}/imports/${list.id}`}>← {list.name}</Link>
          </p>

          <h2>이슈 대량등록</h2>
          <p className="admin-hint">
            가져온 원본 <b>{list.rowCount.toLocaleString()}행</b>을 우리 이슈로 만듭니다.
            원본은 <b>그대로 남습니다</b> — 잘못 들어갔을 때 대조할 수 있어야 하니까요.
            {" "}이미 만든 행은 <b>다시 눌러도 건너뜁니다</b>.
            <br />
            ⚠️ 고객사의 <code>이슈현황</code>은 <b>받지 않습니다.</b> 우리 상태 체계와 달라
            억지로 맞추면 없는 값을 지어내게 됩니다. 만든 이슈는 전부
            {" "}<b>{status?.name ?? "첫 상태"}</b>로 들어갑니다.
          </p>

          {/* ── ④ 대상 ───────────────────────────────────── */}
          <h3 className="imp-step">1. 어디로 넣을까</h3>
          <TargetForm
            projectKey={project.key}
            listId={list.id}
            projects={projects.map((p) => ({ key: p.key, name: p.name, rounds: p.rounds }))}
            targetKey={target?.key ?? ""}
            roundId={list.targetRoundId}
            committedAt={list.committedAt ? formatFull(list.committedAt) : null}
          />

          {/* ── ③ 매핑 ───────────────────────────────────── */}
          <h3 className="imp-step">2. 어느 열을 어느 칸으로</h3>
          {!target || !masters ? (
            <p className="admin-hint"><b>프로젝트를 먼저 고르고 저장하세요.</b> 고를 수 있는 값이 프로젝트마다 다릅니다.</p>
          ) : (
            <MappingEditor
              projectKey={project.key}
              listId={list.id}
              columns={columns}
              masters={masters}
              people={ppl.map((p) => ({ id: p.id, name: p.name, loginId: p.loginId }))}
              defaults={plan.defaults}
            />
          )}

          {/* ── ⑤ 미리보기 · 등록 ────────────────────────── */}
          <h3 className="imp-step">3. 미리 보고 등록</h3>
          {blocked ? (
            <p className="admin-hint"><b>{blocked}</b></p>
          ) : (
            <>
              <p className="admin-hint">
                지금 등록하면 <b>{willCreate.toLocaleString()}건</b>이 만들어집니다.
                {willFail > 0 && <> <b className="imp-bad">{willFail.toLocaleString()}건</b>은 값을 못 정해 실패합니다.</>}
                {done > 0 && <> 이미 만든 <b>{done.toLocaleString()}건</b>은 건너뜁니다.</>}
              </p>

              {preview.length > 0 && (
                <div className="tablewrap imp-table" style={{ marginTop: 10 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="imp-rn">줄</th>
                        <th>이슈타이틀</th>
                        <th>우선순위</th>
                        <th>환경</th>
                        <th>시스템</th>
                        <th>재현율</th>
                        <th>작성자</th>
                        <th>발생일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p) => (
                        <tr key={p.rowNo}>
                          <td className="imp-rn">{p.rowNo}</td>
                          {p.error ? (
                            <td colSpan={7} className="imp-bad">{p.error}</td>
                          ) : (
                            <>
                              <td className="imp-cell"><span className="imp-clamp">{p.title}</span></td>
                              {p.cells.map((c, i) => <td key={i}>{c}</td>)}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <CommitForm
                projectKey={project.key}
                listId={list.id}
                targetKey={target!.key}
                willCreate={willCreate}
                willFail={willFail}
              />
            </>
          )}

          {failedRows.length > 0 && (
            <div className="imp-fails">
              <h4>지난번에 실패한 행 {failedRows.length.toLocaleString()}개</h4>
              <ul>
                {failedRows.slice(0, 20).map((r) => (
                  <li key={r.id}><b>{r.rowNo}줄</b> — {r.importError}</li>
                ))}
              </ul>
              {failedRows.length > 20 && <p className="imp-dim">…그 밖에 {failedRows.length - 20}개</p>}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
