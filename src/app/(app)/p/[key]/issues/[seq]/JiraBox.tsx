"use client";

import { useActionState } from "react";

import { ProjectField } from "@/components/ProjectField";

import { sendToJira, setJiraKey, type JiraState } from "./jira-actions";

/**
 * 이슈 상세의 지라 상자 (`J-13`~`J-24`).
 *
 * ★ **세 가지 얼굴 중 하나**만 보인다.
 *   ① 키가 있다 → 눌러서 지라로 간다. **버튼은 없다** (다시 안 보낸다)
 *   ② 연동이 켜져 있고 키가 없다 → `지라로 보내기`
 *   ③ 연동이 꺼져 있다 → **키를 적어 두는 칸만** (0단계는 토큰 없이도 된다)
 */
export function JiraBox({
  seq, jiraKey, sentAt, sentBy, url, active, hasToken, defaultParentKey,
}: {
  seq: number;
  jiraKey: string | null;
  /** 보낸 것인가(시각 있음) 손으로 적어 둔 것인가(없음) */
  sentAt: string | null;
  sentBy: string | null;
  url: string | null;
  active: boolean;
  hasToken: boolean;
  defaultParentKey: string | null;
}) {
  const [sendState, send, sending] = useActionState<JiraState, FormData>(sendToJira, {});
  const [linkState, link, linking] = useActionState<JiraState, FormData>(setJiraKey, {});

  return (
    <>
      <div className="side-sep" />
      <h2 className="side-h">지라</h2>

      {jiraKey ? (
        <div className="jira-linked">
          {url
            ? <a href={url} target="_blank" rel="noreferrer" className="jira-key">{jiraKey} ↗</a>
            : <span className="jira-key">{jiraKey}</span>}
          <span className="side-note">
            {sentAt
              ? <>이 화면에서 보냈습니다 · {sentAt}{sentBy ? ` · ${sentBy}` : ""}</>
              : <>손으로 적어 둔 키입니다</>}
          </span>
          {/* ★ 보낸 것은 못 지운다 — 기록이다. 적어 둔 것만 고칠 수 있다 (`J-23`) */}
          {!sentAt && (
            <details className="jira-relink">
              <summary className="btn-ghost">고치기</summary>
              <form action={link}>
                <ProjectField />
                <input type="hidden" name="seq" value={seq} />
                <input
                  name="jiraKey" defaultValue={jiraKey} placeholder="WEB-123"
                  maxLength={30} suppressHydrationWarning
                />
                <button type="submit" className="btn-ghost" disabled={linking}>
                  {linking ? "저장 중…" : "저장"}
                </button>
                <p className="side-note">비우면 연결이 끊어집니다. 이력에 남습니다.</p>
              </form>
            </details>
          )}
        </div>
      ) : active ? (
        <div className="jira-send">
          <form action={send}>
            <ProjectField />
            <input type="hidden" name="seq" value={seq} />
            <label className="field">
              <span>Epic (비워도 됩니다)</span>
              <input
                name="parentKey" defaultValue={defaultParentKey ?? ""}
                placeholder="WEB-123" maxLength={30} suppressHydrationWarning
              />
            </label>
            <button type="submit" className="btn-primary" disabled={sending}>
              {sending ? "보내는 중…" : hasToken ? "지라로 보내기" : "보낼 내용 보기"}
            </button>
          </form>
          <p className="side-note">
            {hasToken
              ? <>티켓이 만들어지고 <b>키가 여기에 적힙니다.</b> 한 번 보내면 다시 보낼 수 없습니다.</>
              : <><b>연동 계정이 아직 없습니다.</b> 지금은 <b>보낼 내용만</b> 확인할 수 있습니다 — 지라에는 아무것도 만들어지지 않습니다.</>}
          </p>

          {sendState.error && <p className="login-error">{sendState.error}</p>}
          {sendState.ok && <p className="ok-msg">{sendState.ok}</p>}
          {sendState.preview && (
            <details className="jira-preview" open>
              <summary>보낼 내용 (JSON)</summary>
              <pre>{sendState.preview}</pre>
            </details>
          )}

          <details className="jira-relink">
            <summary className="btn-ghost">이미 지라에 있습니다</summary>
            <form action={link}>
              <ProjectField />
              <input type="hidden" name="seq" value={seq} />
              <input name="jiraKey" placeholder="WEB-123" maxLength={30} suppressHydrationWarning />
              <button type="submit" className="btn-ghost" disabled={linking}>
                {linking ? "저장 중…" : "적어 두기"}
              </button>
              <p className="side-note">키만 적어 둡니다. 지라에는 아무것도 만들지 않습니다.</p>
            </form>
          </details>
          {linkState.error && <p className="login-error">{linkState.error}</p>}
        </div>
      ) : (
        <div className="jira-send">
          <form action={link}>
            <ProjectField />
            <input type="hidden" name="seq" value={seq} />
            <input name="jiraKey" placeholder="WEB-123" maxLength={30} suppressHydrationWarning />
            <button type="submit" className="btn-ghost" disabled={linking}>
              {linking ? "저장 중…" : "적어 두기"}
            </button>
          </form>
          <p className="side-note">
            지라 연동이 꺼져 있습니다. 키를 적어 두면 <b>눌러서 갈 수</b> 있습니다.
          </p>
          {linkState.error && <p className="login-error">{linkState.error}</p>}
          {linkState.ok && <p className="ok-msg">{linkState.ok}</p>}
        </div>
      )}
    </>
  );
}
