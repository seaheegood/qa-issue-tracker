#!/usr/bin/env bash
#
# 예시 데이터로 바로 둘러보기 — 로컬 DB 에 가공의 프로젝트·사람·이슈를 넣는다.
#
#     npm run demo              # DB 가 비어 있을 때만
#     npm run demo -- --reset   # ⚠️ 지금 DB 를 전부 지우고 예시 데이터로 다시
#
# ★ **이미 쓰고 있는 DB 는 건드리지 않는다.** 프로젝트가 하나라도 있으면 멈춘다.
#   `prisma/seed-demo.ts` 는 대상 DB 를 **비우고** 채우는 스크립트라, 한 줄 잘못 치면
#   내 이슈가 전부 사라진다. `--reset` 을 직접 적어야만 지운다.
# ★ seed-demo 의 두 겹 잠금(`IT_DEMO_SEED` · `IT_DEMO_SEED_LOCAL`)은 그대로다 —
#   여기서 **확인을 마친 뒤에** 켜서 부른다.
#
# 데이터는 전부 지어낸 것이다 (가공의 쇼핑몰·예약 서비스 · 가공의 이름).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${IT_DB_CONTAINER:-qait-mysql}"
RESET=0
[[ "${1:-}" == "--reset" ]] && RESET=1

die() { echo "❌ $*" >&2; exit 1; }

[[ -f .env ]] || die ".env 가 없습니다.  cp .env.example .env"
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || die "DB('$CONTAINER')가 꺼져 있습니다.  docker compose up -d"

echo "▸ 표 만들기"
npx prisma migrate deploy 2>&1 | grep -E "applied|No pending|Error" | sed 's/^/  /' || true

urldecode() { printf '%b' "${1//%/\\x}"; }
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
_u="${DATABASE_URL#mysql://}"; DB_USER="$(urldecode "${_u%%:*}")"; _r="${_u#*:}"
DB_PASS="$(urldecode "${_r%%@*}")"; DB_NAME="${_u##*/}"; DB_NAME="${DB_NAME%%\?*}"
n="$(docker exec -e MYSQL_PWD="$DB_PASS" "$CONTAINER" mysql -u"$DB_USER" -N -B "$DB_NAME" \
      -e 'SELECT COUNT(*) FROM projects' 2>/dev/null || echo "?")"

if [[ "$n" != "0" && $RESET -eq 0 ]]; then
  die "이미 프로젝트가 ${n}개 있습니다. 지우고 예시 데이터로 다시 채우려면:  npm run demo -- --reset"
fi
if [[ $RESET -eq 1 && "$n" != "0" ]]; then
  echo "⚠️  지금 DB($DB_NAME)의 프로젝트 ${n}개와 이슈가 전부 지워집니다."
  printf "   계속하려면 DB 이름을 그대로 입력하세요 (%s): " "$DB_NAME"
  read -r typed
  [[ "$typed" == "$DB_NAME" ]] || die "입력이 달라 중단했습니다."
fi

echo "▸ 예시 데이터 넣기"
IT_DEMO_SEED=1 IT_DEMO_SEED_LOCAL=1 npx tsx prisma/seed-demo.ts | sed 's/^/  /'

echo
echo "✅ 준비됐습니다."
echo "   npm run dev   →  http://localhost:3000"
echo "   로그인        demo / demo1234  (관리자)"
echo
