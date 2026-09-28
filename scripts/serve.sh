#!/usr/bin/env bash
#
# 시험 운영용 실행 — 동료들이 같은 망에서 접속해서 쓴다.
#
#     npm run serve            # 빌드 + 실행
#     npm run serve -- --skip-build   # 빌드 건너뛰고 바로 실행
#
# `npm run dev` 와 무엇이 다른가:
#   dev   요청마다 화면을 다시 컴파일한다. 나 혼자 고치면서 볼 때는 편하지만
#         **남이 쓰면 느리고 가끔 멈춘다.**
#   serve 미리 빌드해 두고 그것만 내보낸다. 대신 코드를 고쳐도 반영되지 않는다.
#
# 하는 일
#   1. DB 가 떠 있는지 확인 (없으면 여기서 멈춘다 — 켜고 나서 알려주는 게 낫다)
#   2. 백업 (사람들이 진짜 이슈를 넣기 시작하는 시점이다)
#   3. 빌드
#   4. 접속 주소를 **다 찍어준다** — IP 는 바뀌므로 호스트 이름을 먼저 안내한다

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${IT_DB_CONTAINER:-qait-mysql}"
PORT="${PORT:-3000}"
SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

die() { echo "❌ $*" >&2; exit 1; }

# ── 버전
# ★ **지금 뜬 서버가 어느 버전인지 창만 봐도 알아야 한다.**
#   동료가 "이거 반영됐어요?" 라고 물을 때, 옛 빌드가 떠 있는 줄 모르고
#   코드를 다시 뒤지는 일이 실제로 있었다 (2026-09-16 — 5일 된 빌드가 떠 있었다).
# `package.json` 이 정본이고, git 이 그 뒤로 몇 걸음 더 갔는지 덧붙인다.
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo '?')"
# v0.2.1-3-gabc1234  →  태그 뒤로 커밋 3개 (아직 버전 안 붙은 작업이 있다는 뜻)
DESC="$(git describe --tags --always --dirty 2>/dev/null || true)"
AHEAD=""
case "$DESC" in
  *-[0-9]*-g*) AHEAD="  (태그 뒤로 $(echo "$DESC" | sed -E 's/.*-([0-9]+)-g.*/\1/')커밋 — 아직 버전 안 붙음)" ;;
esac

echo
echo "IssueTracker  v${VERSION} — 시험 운영 실행"
echo "────────────────────────────────────────────────"

# ── 1. DB
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || die "DB('$CONTAINER')가 꺼져 있습니다.  docker compose up -d"
echo "  ① DB 확인"

# ── 2. 백업
# 여기서 뜨는 이유: 이 시점부터 남이 쓰는 데이터가 들어온다.
# 백업은 하루 한 번이 아니라 **열기 직전**이 가장 중요하다.
if [[ "${IT_SKIP_BACKUP:-}" != "1" ]]; then
  echo "  ② 백업"
  bash "$ROOT/scripts/backup.sh" --quick 2>&1 | sed 's/^/     /'
else
  echo "  ② 백업 — 건너뜀 (IT_SKIP_BACKUP=1)"
fi

# ── 3. 빌드
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "  ③ 빌드 (1~2분)"
  npm run build >/tmp/pt-build.log 2>&1 || { tail -20 /tmp/pt-build.log; die "빌드 실패"; }
  echo "     $(grep -c '^├\|^└' /tmp/pt-build.log || echo '?')개 라우트"
else
  [[ -d .next ]] || die "빌드 결과(.next)가 없습니다. --skip-build 를 빼고 실행하세요."
  echo "  ③ 빌드 건너뜀"
fi

# ── 4. 접속 주소
# ★ IP 를 먼저 알려주면 안 된다. DHCP 라 바뀐다 —
#   실제로 192.168.0.10 → 192.168.0.20 로 바뀐 적이 있다.
# hostname 이 이미 .local 로 끝나는 경우가 있다 (macOS). 두 번 붙이지 않는다.
HOST="$(hostname)"
[[ "$HOST" == *.local ]] || HOST="${HOST}.local"
IPS="$(ipconfig getifaddr en0 2>/dev/null || true) $(ipconfig getifaddr en1 2>/dev/null || true)"

echo "────────────────────────────────────────────────"
echo
echo "  버전  v${VERSION}${AHEAD}"
[[ -n "$DESC" ]] && echo "        git ${DESC}"
echo
echo "  동료에게 알려줄 주소 ↓"
echo
echo "     http://${HOST}:${PORT}"
echo
for ip in $IPS; do
  [[ -n "$ip" ]] && echo "     (안 되면) http://${ip}:${PORT}"
done
echo
echo "  ⚠️  이 창을 닫으면 서버가 꺼집니다. 맥이 잠자기로 들어가도 끊깁니다."
echo "     시스템 설정 → 배터리 → '디스플레이가 꺼져도 잠자기 방지' 를 켜두세요."
echo
echo "────────────────────────────────────────────────"
echo

exec npx next start -p "$PORT" -H 0.0.0.0
