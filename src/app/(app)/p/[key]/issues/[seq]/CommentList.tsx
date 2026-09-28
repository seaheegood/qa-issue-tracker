import { formatBytes } from "@/lib/format";
import { Avatar, Caret, formatDateTime } from "@/lib/ui";

import { CommentBodyEdit } from "./CommentBodyEdit";
import { ReplyForm } from "./CommentForm";

type Person = { name: string; team: { name: string; color: string } | null } | null;

export type CommentNode = {
  id: number;
  type: string;
  body: string;
  createdAt: Date;
  author: { id: number; name: string; loginId: string; team: { name: string; color: string } | null };
  isEdited?: boolean;
  legacyLastAuthor: Person;
  attachments: {
    id: number; fileName: string; mimeType: string; sizeBytes: number;
  }[];
  replies?: CommentNode[];
};

/**
 * 누가 썼는지 정한다.
 *
 * 엑셀에서 옮긴 코멘트는 작성자 칸이 없어서 이관 계정이 작성자로 들어가 있다.
 * 대신 본문 서명에서 뽑아낸 이름(legacyLastAuthor)이 있으면 그 사람을 보여준다.
 * 앞으로 새로 달리는 코멘트는 로그인한 사람이 그대로 작성자다.
 */
function resolveAuthor(c: CommentNode) {
  const migrated = c.author.loginId === "_migration";
  if (migrated && c.legacyLastAuthor) {
    return { person: c.legacyLastAuthor, migrated: true, unknown: false };
  }
  if (migrated) {
    return { person: null, migrated: true, unknown: true };
  }
  return { person: c.author, migrated: false, unknown: false };
}

function CommentBody({ c, seq, isReply, people, meId }: {
  c: CommentNode; seq: number; isReply: boolean; people: string[]; meId: number;
}) {
  const { person, migrated, unknown } = resolveAuthor(c);

  return (
    <article className={`cmt-item${isReply ? " reply" : ""}`}>
      <div className="cmt-head">
        <Avatar name={person?.name ?? "?"} color={person?.team?.color} size={22} />
        <span className="cmt-name">
          {unknown ? "작성자 미상" : person!.name}
          {person?.team && <span className="team-tag">{person.team.name}</span>}
        </span>
        {/*
          ★ **오른쪽 끝은 시각이다** (`D-97` · FB-011 6번).
            예전엔 여기에 **코멘트 유형 배지**(개발/기획/QA)가 있었는데,
            왼쪽 팀 배지와 **같은 말이 두 번** 뜨는 일이 잦았다 — 유형은 고르는 게
            아니라 직군에서 자동으로 정해지기 때문이다. 게다가 직군이 없으면
            `QA` 로 떨어져서 **틀린 말이 되기도** 했다.
            `comments.type` 열과 기록은 그대로 둔다 — 되살릴 수 있게.

          ★ 이관된 코멘트는 작성 시각이 없다 — 지어내지 않고 그렇다고 말한다.
        */}
        <span className="cmt-time">
          {/* 고친 코멘트는 그렇다고 말한다 — 기록이 조용히 바뀌면 기록이 아니다 (D-100) */}
          {c.isEdited && <span className="cmt-edited">수정됨</span>}
          {migrated ? "엑셀 이관 · 작성 시각 없음" : formatDateTime(c.createdAt)}
        </span>
      </div>

      {/* 본문·첨부·액션은 한 조각이 그린다 — 편집이 **본문 자리에서** 열려야 해서
          상태가 필요하고, 서버 컴포넌트는 상태를 못 가진다 (D-100 개정)

          ★ **답글 첨부는 안 센다** (2026-09-16). 답글이 있으면 삭제 자체가 막히므로
            *"답글 첨부까지 같이 지워진다"* 는 경우가 **더는 생기지 않는다.**
            `otherReplyAuthors` 도 같은 이유로 없앴다 — 쓰이지 않는 계산이 남아 있으면
            다음 사람이 *"답글도 같이 지워지는구나"* 로 읽는다. */}
      <CommentBodyEdit
        seq={seq}
        commentId={c.id}
        body={c.body}
        people={people}
        canEdit={c.author.id === meId && !migrated}
        replyCount={c.replies?.length ?? 0}
        attachmentCount={c.attachments.length}
        reply={!isReply ? <ReplyForm seq={seq} parentId={c.id} people={people} /> : null}
        attachments={c.attachments.length > 0 && (
        <div className="cmt-att">
          {c.attachments.map((a) =>
            a.mimeType.startsWith("image/") ? (
              <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" title={a.fileName}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/attachments/${a.id}`} alt={a.fileName} loading="lazy" />
              </a>
            ) : (
              <a key={a.id} href={`/api/attachments/${a.id}`} className="cmt-file" title={a.fileName}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                {a.fileName}
                <span>{formatBytes(a.sizeBytes)}</span>
              </a>
            )
          )}
        </div>
        )}
      />
    </article>
  );
}

export function CommentList({ comments, seq, people, meId }: {
  comments: CommentNode[]; seq: number;
  /** 멘션 강조 대상 — 프로젝트 전원의 이름 */
  people: string[];
  /** 지금 로그인한 사람 — **자기 코멘트만** 고칠 수 있다 (D-100) */
  meId: number;
}) {
  if (comments.length === 0) {
    return <div className="prose none">아직 코멘트가 없습니다. 첫 코멘트를 남겨보세요.</div>;
  }

  return (
    <div className="cmt-list">
      {comments.map((c) => (
        <div className="cmt-thread" key={c.id}>
          <CommentBody c={c} seq={seq} isReply={false} people={people} meId={meId} />
          {/* ★ **답글은 접었다 펼 수 있다** (2026-09-16 제보).
              `<details>` 라 **자바스크립트 없이** 접힌다 — 상태 그룹 머리와 같은 방식.
              기본은 **펼침**이다 (사용자 결정) — 지금 보이던 게 갑자기 사라지지 않게. */}
          {c.replies && c.replies.length > 0 && (
            <details className="cmt-replies" open>
              <summary>
                <Caret />
                답글 {c.replies.length}개
              </summary>
              {c.replies.map((r) => (
                <CommentBody key={r.id} c={r} seq={seq} isReply people={people} meId={meId} />
              ))}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
