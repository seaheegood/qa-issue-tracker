import Link from "next/link";

import { GlobalAdminFrame } from "../GlobalAdminFrame";
import { prisma } from "@/lib/prisma";

import { NewProjectForm } from "./NewProjectForm";

export const metadata = { title: "프로젝트 · IssueTracker" };

/**
 * 프로젝트 목록 · 새 프로젝트 (P-1).
 *
 * ★ **프로젝트는 모든 데이터의 뿌리다** (P-1). 단일 프로젝트는 "1개인 상태"일 뿐이고,
 *   두 번째를 붙이는 순간 이 화면이 시작점이 된다.
 *
 * ★ 지우는 선택지는 없다. 프로젝트를 지우면 이슈·코멘트·첨부가 전부 딸려 나간다.
 *   차수·팀·상태와 같은 원칙이다.
 */
export default async function ProjectsPage({ searchParams }: {
  /** ★ 걸치고 있는 프로젝트 — 프로젝트 설정에서 건너올 때 따라온다 (A-87) */
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const projects = await prisma.project.findMany({
    orderBy: { id: "asc" },
    // ★ **멤버 수는 더 세지 않는다** (2026-09-11 — 멤버 폐지).
    //   사람은 프로젝트에 속하지 않는다.
    include: { _count: { select: { issues: true, statuses: true } } },
  });

  return (
    <GlobalAdminFrame from={from}>
    <main className="admin">
      <section className="admin-sec">
        <h2>프로젝트 {projects.length}개</h2>
        <p className="admin-hint">
          프로젝트는 <b>모든 데이터의 뿌리</b>입니다 — 이슈·상태·전이 규칙·차수가 전부
          프로젝트에 딸립니다. 주소에도 들어갑니다 (<code>/p/SP/issues</code>).
        </p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>프로젝트</th>
                <th>식별자</th>
                <th>이슈번호</th>
                <th style={{ textAlign: "right" }}>이슈</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((x) => (
                <tr key={x.id} className={x.status === "ACTIVE" ? undefined : "off"}>
                  <td><span className="uname">{x.name}</span></td>
                  <td className="mono">{x.key}</td>
                  <td className="dim">
                    {x.issuePrefix ? `${x.issuePrefix}-1` : "숫자만"}
                  </td>
                  <td className="num">{x._count.issues.toLocaleString()}</td>
                  <td>
                    <Link href={`/p/${x.key}/issues`} className="btn-ghost sm">열기</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-sec">
        <h2>새 프로젝트</h2>
        <p className="admin-hint">
          ★ <b>설정은 복제합니다</b> (P-2 — 공통은 템플릿, 차이는 설정).
          상태 9종 · 전이 규칙 · 사유(Reason) · 우선순위 · 환경 · 플랫폼을 그대로 가져옵니다.
          <br />
          <b>시스템은 복제하지 않습니다</b> — 프로젝트마다 완전히 달라서 가져오면 쓰레기가 됩니다.
          차수는 <code>1차</code> 하나만 비워서 만듭니다.
          <br />
          만든 뒤 <b>프로젝트 설정 → 상태 · 전이 규칙</b>에서 고치면 됩니다.
        </p>
        <NewProjectForm projects={projects.map((x) => ({ id: x.id, key: x.key, name: x.name }))} />
      </section>
    </main>
    </GlobalAdminFrame>
  );
}
