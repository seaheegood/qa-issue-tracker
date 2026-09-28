"use server";

/**
 * 지라로 보내는 서버 액션 (`J-13`~`J-24`).
 *
 * ★ 왜 `actions.ts` 에 안 붙였나. 지라는 **없어도 이 앱이 완전히 돈다** —
 *   연동을 걷어내는 날 이 파일과 `lib/jira*.ts`, 설정 탭 하나만 지우면 된다.
 *   기능(IA) 축을 지울 때 **여섯 표와 스크립트 넷이 여기저기 박혀 있어** 하루가 걸렸다.
 *
 * ★ `redirect()` 로 끝내지 않는다 — 사이드 패널에서 눌러도 목록이 사라지지 않게
 *   (`actions.ts` 머리 주석과 같은 규칙).
 */

import { requireUser } from "@/lib/auth";
import { historyRow } from "@/lib/history";
import {
  buildPayload, createJiraIssue, JIRA_KEY_RE, jiraCreds,
  normalizeJiraKey, ourBaseUrl, type JiraSource,
} from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { projectFromForm } from "@/lib/project";
import { revalidateIssue } from "@/lib/revalidate";
import { issueNo, REPRO_RATE_LABEL } from "@/lib/ui";

export type JiraState = {
  error?: string;
  ok?: string;
  /** 토큰이 없을 때 **보냈을 내용**. 화면이 그대로 펼쳐 보여준다 (`J-20`) */
  preview?: string;
};

/** 이슈 하나를 지라에 보낼 모양으로 읽는다. **미리보기와 전송이 같은 조회를 쓴다.** */
async function load(projectId: number, seq: number) {
  return prisma.issue.findUnique({
    where: { projectId_seq: { projectId, seq } },
    include: {
      priority: { select: { id: true, name: true } },
      environment: { select: { name: true } },
      system: { select: { name: true } },
      status: { select: { name: true } },
      round: { select: { name: true } },
      platforms: { include: { platform: { select: { name: true } } } },
      reporter: { select: { name: true } },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function toSource(issue: Loaded, prefix: string | null): JiraSource {
  return {
    seq: issue.seq,
    no: issueNo(prefix, issue.seq),
    title: issue.title,
    content: issue.content,
    testPath: issue.testPath,
    expected: issue.expected,
    screen: issue.legacyScreenName,
    priorityId: issue.priority.id,
    priorityName: issue.priority.name,
    environmentName: issue.environment.name,
    systemName: issue.system.name,
    platformNames: issue.platforms.map((p) => p.platform.name),
    statusName: issue.status.name,
    reproRateLabel: issue.reproRate ? REPRO_RATE_LABEL[issue.reproRate] : null,
    foundVersion: issue.foundVersion,
    roundName: issue.round?.name ?? null,
    reporterName: issue.reporter.name,
    reportedAt: issue.reportedAt,
    externalRef: issue.externalRef,
  };
}

/**
 * 지라로 보낸다 (`J-15`~`J-22`).
 *
 * ★★ **한 번 보낸 이슈는 다시 보내지 않는다** (`J-16`). 키가 이미 있으면 거부한다.
 *   화면에서도 버튼을 감추지만 **서버에서 다시 막는다** — 두 사람이 동시에 누르는 일과
 *   열어 둔 옛 화면에서 누르는 일이 실제로 있다 (`C-44` 와 같은 규칙).
 * ★ 토큰이 없으면 **보내지 않고 보낼 내용을 돌려준다.** 고장이 아니라 미리보기다.
 */
export async function sendToJira(_p: JiraState, fd: FormData): Promise<JiraState> {
  const me = await requireUser();
  const project = await projectFromForm(fd);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };

  const seq = Number(fd.get("seq"));
  if (!Number.isInteger(seq)) return { error: "이슈 번호가 올바르지 않습니다." };

  const cfg = await prisma.jiraSetting.findUnique({ where: { projectId: project.id } });
  if (!cfg) return { error: "지라 설정이 없습니다. 설정 → 지라 연동에서 먼저 채우세요." };
  if (!cfg.isActive) return { error: "지라 연동이 꺼져 있습니다." };

  const issue = await load(project.id, seq);
  if (!issue) return { error: "이슈를 찾을 수 없습니다." };
  if (issue.jiraKey) {
    return { error: `이미 ${issue.jiraKey} 로 넘어간 이슈입니다. 다시 보내지 않습니다.` };
  }

  const parentRaw = normalizeJiraKey(String(fd.get("parentKey") ?? ""));
  if (parentRaw && !JIRA_KEY_RE.test(parentRaw)) {
    return { error: "Epic 은 지라 키 모양이어야 합니다 (예: WEB-123)." };
  }

  const src = toSource(issue, project.issuePrefix);
  const base = ourBaseUrl();
  const payload = buildPayload(src, cfg, {
    parentKey: parentRaw || cfg.defaultParentKey,
    ourUrl: base ? `${base}/p/${project.key}/issues/${issue.seq}` : null,
  });

  // 토큰이 없다 → **보내지 않는다.** 보낼 내용을 그대로 돌려준다
  if (!jiraCreds()) {
    return {
      preview: JSON.stringify(payload, null, 2),
      ok: "미리보기입니다 — 실제로 보내지 않았습니다.",
    };
  }

  const res = await createJiraIssue(payload, cfg);
  if (!res.ok) {
    if ("preview" in res && res.preview) {
      return { preview: JSON.stringify(res.payload, null, 2), ok: "미리보기입니다 — 실제로 보내지 않았습니다." };
    }
    return { error: `지라가 거부했습니다 — ${res.message}` };
  }

  // ★ 이슈 수정과 이력을 **같은 트랜잭션**에. 한쪽만 남으면 "보냈는데 기록이 없다" 가 된다
  await prisma.$transaction([
    prisma.issue.update({
      where: { id: issue.id },
      data: { jiraKey: res.key, jiraSentAt: new Date(), jiraSentById: me.id },
    }),
    prisma.issueHistory.createMany({
      data: [historyRow(issue.id, "jira", null, res.key, { id: me.id, role: me.role })],
    }),
  ]);

  revalidateIssue(project.key, issue.seq);
  return { ok: `${res.key} 로 넘어갔습니다.` };
}

/**
 * 지라 키를 **손으로 적어 둔다** (0단계 · `J-23`).
 *
 * ★ 이미 지라에 있는 건은 **보내는 게 아니라 잇는 것**이다. API·토큰이 필요 없다.
 * ★ 비우면 연결을 끊는다 — 오타를 고칠 길이 있어야 한다. 이력에 남는다.
 * ⚠️ `jiraSentAt` 은 **건드리지 않는다.** «보낸 것» 과 «적어 둔 것» 을 구분하는 유일한 표시다.
 */
export async function setJiraKey(_p: JiraState, fd: FormData): Promise<JiraState> {
  const me = await requireUser();
  const project = await projectFromForm(fd);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };

  const seq = Number(fd.get("seq"));
  if (!Number.isInteger(seq)) return { error: "이슈 번호가 올바르지 않습니다." };

  const raw = normalizeJiraKey(String(fd.get("jiraKey") ?? ""));
  if (raw && !JIRA_KEY_RE.test(raw)) {
    return { error: "지라 키 모양이 아닙니다 (예: WEB-123)." };
  }

  const issue = await prisma.issue.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
    select: { id: true, seq: true, jiraKey: true, jiraSentAt: true },
  });
  if (!issue) return { error: "이슈를 찾을 수 없습니다." };
  // ★ 보낸 것은 **비우는 것도 바꾸는 것도** 막는다 (`J-30`). 예전엔 비우기만 막아
  //   다른 키로 덮어쓰는 길이 열려 있었다 — 덮어쓰면 «보냈다» 는 기록이 남의 키를 가리킨다
  if (issue.jiraSentAt) {
    return { error: "이 앱에서 보낸 티켓입니다. 고칠 일이 있으면 코멘트에 적어 주세요." };
  }
  if ((issue.jiraKey ?? "") === raw) return { ok: "바뀐 것이 없습니다" };

  await prisma.$transaction([
    prisma.issue.update({ where: { id: issue.id }, data: { jiraKey: raw || null } }),
    prisma.issueHistory.createMany({
      data: [historyRow(issue.id, "jira", issue.jiraKey, raw || null, { id: me.id, role: me.role })],
    }),
  ]);

  revalidateIssue(project.key, issue.seq);
  return { ok: raw ? `${raw} 로 이어 두었습니다` : "연결을 끊었습니다" };
}
