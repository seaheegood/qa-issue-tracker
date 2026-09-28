import Link from "next/link";
import { formatFull } from "@/lib/ui";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

export const metadata = { title: "이슈 대량등록 · IssueTracker" };

// 날짜 포맷은 `@/lib/ui` 한 곳에서만 만든다 (C-40) — 여기 있던 같은 구현을 지웠다
const when = (d: Date) => formatFull(d);

/**
 * 이슈 대량등록 — 올려 둔 원본 목록들.
 *
 * ★ **원본은 원본대로 남는다.** 이슈를 만든 뒤에도 이 표는 그대로다 —
 *   잘못 들어갔을 때 대조할 길이 있어야 한다 (사용자 확정).
 *   그래서 `등록` 칸은 *"몇 행에서 몇 건이 이슈가 됐나"* 를 말한다.
 */
export default async function ImportsPage({ params }: { params: Promise<{ key: string }> }) {
  await requireUser();
  const project = await requireProject(params);

  const lists = await prisma.importedList.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: {
        select: {
          columns: true,
          // ★ 이미 이슈가 된 행. `imported_rows.issue_id` 가 정본이라
          //   `committed_at` 만 보고 "다 됐다"고 말하지 않는다 — 일부만 됐을 수 있다.
          rows: { where: { issueId: { not: null } } },
        },
      },
      columns: { where: { isSelected: true }, select: { id: true } },
    },
  });

  // ★ `target_project_id` · `target_round_id` 는 **FK 관계가 아니라 그냥 숫자 칸**이다
  //   (`prisma/schema.prisma`). 그래서 `include` 로 못 딸려 온다 — 한 번에 읽어 이름만 붙인다.
  const ids = [...new Set(lists.map((l) => l.targetProjectId).filter((v): v is number => !!v))];
  const roundIds = [...new Set(lists.map((l) => l.targetRoundId).filter((v): v is number => !!v))];
  const [targets, rounds] = await Promise.all([
    ids.length
      ? prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    roundIds.length
      ? prisma.round.findMany({ where: { id: { in: roundIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const targetName = new Map(targets.map((t) => [t.id, t.name]));
  const roundName = new Map(rounds.map((r) => [r.id, r.name]));

  return (
    <>
      <PageHeader title="이슈 대량등록" sub={`${lists.length}개`} />
      <main className="admin">
        <section className="admin-sec">
          <div className="imp-head">
            <h2>올려 둔 목록 {lists.length}개</h2>
            <Link className="btn-new" href={`/p/${project.key}/imports/new`}>+ 엑셀 가져오기</Link>
          </div>
          <p className="admin-hint">
            고객사가 자기 양식으로 낸 엑셀을 <b>열 구성 그대로</b> 올려 두고,
            열을 이슈의 어느 칸으로 넣을지 정해 <b>한 번에 이슈로 만듭니다</b>.
            가져올 열과 그 순서는 목록마다 따로 정하고 <b>나중에 바꿔도 됩니다</b> —
            이슈를 만든 뒤에도 원본은 전부 남습니다.
          </p>

          {lists.length === 0 ? (
            <p className="empty">
              아직 올린 목록이 없습니다.
              {" "}<Link href={`/p/${project.key}/imports/new`}>엑셀을 가져와</Link> 시작하세요.
            </p>
          ) : (
            <div className="tablewrap" style={{ marginTop: 10 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th style={{ width: 210 }}>원본 파일 · 시트</th>
                    <th style={{ width: 90, textAlign: "right" }}>행</th>
                    <th style={{ width: 90, textAlign: "right" }}>열</th>
                    <th style={{ width: 200 }}>등록</th>
                    <th style={{ width: 90 }}>가져온이</th>
                    <th style={{ width: 110 }}>가져온 날</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link className="link" href={`/p/${project.key}/imports/${l.id}`}>{l.name}</Link>
                      </td>
                      <td className="imp-src">
                        {l.sourceFile}
                        <span className="imp-dim"> · {l.sheetName}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>{l.rowCount.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>
                        {/* 고른 열 / 원본 열. 원본을 다 들고 있다는 걸 여기서 보여준다 */}
                        {l.columns.length}<span className="imp-dim"> / {l._count.columns}</span>
                      </td>
                      <td className="imp-src">
                        {l._count.rows > 0 ? (
                          <>
                            {l.rowCount.toLocaleString()}행 중 <b>{l._count.rows.toLocaleString()}건 등록됨</b>
                            {l.targetProjectId && targetName.has(l.targetProjectId) && (
                              <span className="imp-dim">
                                {" "}→ {targetName.get(l.targetProjectId)}
                                {l.targetRoundId && roundName.has(l.targetRoundId)
                                  ? ` · ${roundName.get(l.targetRoundId)}`
                                  : ""}
                              </span>
                            )}
                          </>
                        ) : (
                          <Link className="link" href={`/p/${project.key}/imports/${l.id}/mapping`}>
                            이슈로 등록 →
                          </Link>
                        )}
                      </td>
                      <td>{l.createdBy.name}</td>
                      <td>{when(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
