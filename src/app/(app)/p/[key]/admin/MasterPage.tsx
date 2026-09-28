import { ProjectField } from "@/components/ProjectField";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { toggleMasterActive, type MasterKind } from "./actions";
import { CreateMasterForm, MasterRow } from "./MasterForms";

/**
 * 우선순위 · 환경 · 플랫폼 설정 — 셋이 함께 쓰는 화면 (A-74).
 *
 * ★ **이 화면들이 없어서 새 프로젝트가 첫 프로젝트을 물고 태어났다.**
 *   `create-project.ts` 는 이 셋을 원본 프로젝트에서 복제하는데 고칠 방법이 없었다.
 *   그래서 WEB 는 쓰지도 않는 `POS` 를 이슈 등록 화면에 계속 띄웠고 끌 수 없었다
 *   (docs/피드백 FB-010). 시스템에 화면을 준 것과 같은 이유다 — P-2, 차이는 설정으로.
 *
 * ★ 라우트를 `admin/masters/[kind]` 하나로 합치지 않은 이유:
 *   `docs/11` 0절 화면 목록과 `scripts/doc_audit.py` 의 route_exists() 가 주소를 못 찾아
 *   **거짓 경보**가 난다. 탭 라벨과 주소가 1:1 인 편이 문서와도 맞는다.
 */
const COPY: Record<MasterKind, { title: string; hint: React.ReactNode }> = {
  priority: {
    title: "우선순위",
    hint: (
      <>
        이슈를 등록할 때 <b>반드시</b> 고릅니다. <b>색</b>은 목록의 색점과 대시보드 막대에 쓰입니다.
        <br />
        순서는 등록 화면에 보이는 차례이고, <b>기본값은 두 번째 값</b>입니다 — 대개 가장 흔한 등급입니다.
      </>
    ),
  },
  environment: {
    title: "환경",
    hint: (
      <>
        이슈가 <b>어느 환경에서 났는지</b>입니다. 등록할 때 반드시 고릅니다.
        <br />
        운영 환경을 열게 되면 여기서 추가하세요 — 개발자를 부를 일이 아닙니다.
      </>
    ),
  },
  platform: {
    title: "플랫폼",
    hint: (
      <>
        이슈가 <b>어느 판에서 났는지</b>입니다 (PC · 모바일 …). 등록할 때 <b>최소 하나</b>를 고릅니다.
        <br />
        같은 화면이라도 PC 와 모바일은 다르게 깨지기 때문에 <b>여러 개를 고를 수 있습니다.</b>
      </>
    ),
  },
};

export async function MasterPage({
  params, kind,
}: {
  params: Promise<{ key: string }>;
  kind: MasterKind;
}) {
  const project = await requireProject(params);
  const copy = COPY[kind];

  // 세 델리게이트의 공통 모양으로 읽는다 (actions.ts 의 master() 와 같은 이유).
  const table = kind === "priority" ? prisma.priority
    : kind === "environment" ? prisma.environment
    : prisma.platform;

  const rows = await (table as typeof prisma.environment).findMany({
    where: { projectId: project.id },
    // 순서가 겹쳐도 줄이 흔들리지 않게 id 로 한 번 더 정렬한다
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { issues: true } } },
  });
  const colors = kind === "priority"
    ? new Map((await prisma.priority.findMany({
        where: { projectId: project.id }, select: { id: true, color: true },
      })).map((p) => [p.id, p.color]))
    : null;

  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>{copy.title} {rows.length}개</h2>
        <p className="admin-hint">{copy.hint}</p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>이름</th>
                <th style={{ width: 130 }}>코드</th>
                {kind === "priority" && <th style={{ width: 60 }}>색</th>}
                <th style={{ width: 80 }}>순서</th>
                <th style={{ width: 80, textAlign: "right" }}>이슈</th>
                <th style={{ width: 60 }}>사용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // ★ 마지막 켜진 하나는 끌 수 없다 (A-80). 0개가 되면 아무도 이슈를 못 올린다.
                const isLastActive = r.isActive && activeCount <= 1;
                return (
                  <tr key={r.id} className={r.isActive ? undefined : "off"}>
                    <MasterRow
                      kind={kind} id={r.id} name={r.name} code={r.code}
                      color={colors?.get(r.id)} sortOrder={r.sortOrder}
                    />
                    <td className="num">{r._count.issues.toLocaleString()}</td>
                    <td>
                      <form action={toggleMasterActive}>
                        <ProjectField />
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className={`toggle${r.isActive ? " on" : ""}`}
                          disabled={isLastActive}
                          title={isLastActive
                            ? `마지막 하나는 끌 수 없습니다 — ${copy.title}이 0개가 되면 이슈를 등록할 수 없습니다`
                            : r.isActive ? "그만 쓰기" : "다시 쓰기"}
                        >
                          <span className="knob" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="admin-hint" style={{ marginTop: 12 }}>
          <b>지운다는 선택지는 없습니다.</b> 지우면 그 값을 쓰던 이슈가 어디 것인지 알 수 없게 됩니다.
          안 쓰는 것은 <b>사용</b>을 끄면 <b>등록·상세·목록 필터의 선택지에서 빠지고</b>,
          이미 그 값인 이슈에서는 그대로 보입니다.
          <br />
          <b>마지막 하나는 끌 수 없습니다</b> — 0개가 되면 아무도 이슈를 등록할 수 없습니다.
          <br />
          <b>코드는 만든 뒤 바꿀 수 없습니다</b> — 공유 링크와 저장된 필터, 내려받은 엑셀이 그 값을 물고 있습니다.
        </p>
      </section>

      <section className="admin-sec">
        <h2>{copy.title} 추가</h2>
        <CreateMasterForm kind={kind} />
      </section>
    </main>
  );
}
