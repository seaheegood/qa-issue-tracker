import { toggleWatch } from "@/app/(app)/notifications/actions";
import { ProjectField } from "@/components/ProjectField";
import { Avatar } from "@/lib/ui";

/**
 * 구독 (요구사항서 05 · docs/05 §16.5).
 *
 * ★ **해제가 한 번의 클릭**이어야 한다 — *"안 그러면 알림이 소음이 됩니다."*
 *   그리고 해제하면 **유지**돼야 한다. 코멘트를 달았다고 다시 붙으면
 *   이 버튼은 아무 의미가 없다 (`issue_watchers.muted` 가 그 장치다).
 *
 * 누가 보고 있는지를 같이 보여준다. "이거 개발팀이 보고 있나?" 를
 * 메신저로 묻던 것을 화면이 대신 답한다.
 */
export function WatchBox({
  seq, mine, watchers,
}: {
  seq: number;
  /**
   * ★ 세 가지다. 두 가지로 줄이면 화면이 거짓말을 한다 —
   *   한 번도 안 건드린 사람에게 "해제된 상태입니다" 라고 하면,
   *   코멘트를 달았을 때 구독되는 걸 예고 없이 당한다.
   */
  mine: "on" | "muted" | "none";
  watchers: { id: number; name: string; teamColor: string | null }[];
}) {
  const watching = mine === "on";
  const note =
    mine === "on"
      ? "상태 변경 · 종결 · 코멘트 · 담당 배정이 알림으로 옵니다."
      : mine === "muted"
        ? "직접 해제했습니다. 코멘트를 달아도 다시 구독되지 않습니다."
        : "아직 구독하지 않았습니다. 코멘트를 달면 자동으로 구독됩니다.";

  return (
    <div className="watchbox">
      <div className="wb-head">
        <span className="wb-k">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {watching ? "구독 중" : "구독 안 함"}
        </span>
        {watchers.length > 0 && (
          <span className="wb-n">보는 사람 {watchers.length}명</span>
        )}
        <form action={toggleWatch}>
      <ProjectField />
          <input type="hidden" name="seq" value={seq} />
          <button type="submit" className={`wb-btn${watching ? " on" : ""}`}>
            {watching ? "구독 해제" : "구독"}
          </button>
        </form>
      </div>

      {watchers.length > 0 && (
        <div className="wb-people">
          {watchers.map((w) => (
            <span key={w.id} className="wb-p" title={w.name}>
              <Avatar name={w.name} color={w.teamColor} size={19} />
            </span>
          ))}
        </div>
      )}

      <p className="wb-note">{note}</p>
    </div>
  );
}
