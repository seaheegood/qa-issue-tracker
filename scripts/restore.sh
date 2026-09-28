#!/usr/bin/env bash
#
# 백업에서 되돌린다.
#
#   npm run restore                      # 백업 목록 보기
#   npm run restore -- pt-20260821-1530  # 그 시점으로 되돌리기
#
# ★ 되돌리기 직전에 지금 상태를 먼저 백업한다.
#   "복구했는데 엉뚱한 백업이었다" 가 가장 흔한 사고다. 그때 돌아올 자리를 만들어 둔다.
#   IT_RESTORE_NO_SAFETY=1 로 끌 수 있지만, 끄지 않는 게 좋다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${IT_DB_CONTAINER:-qait-mysql}"
BACKUP_ROOT="${IT_BACKUP_DIR:-$ROOT/backups}"

die() { echo "❌ $*" >&2; exit 1; }
urldecode() { printf '%b' "${1//%/\\x}"; }

# ── 접속 정보
[[ -f .env ]] || die ".env 가 없습니다."
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
_u="${DATABASE_URL#mysql://}"
DB_USER="$(urldecode "${_u%%:*}")"
_rest="${_u#*:}"
DB_PASS="$(urldecode "${_rest%%@*}")"
DB_NAME="${_u##*/}"; DB_NAME="${DB_NAME%%\?*}"

mysql_q() { docker exec -e MYSQL_PWD="$DB_PASS" -i "$CONTAINER" \
              mysql -u"$DB_USER" -N -B --default-character-set=utf8mb4 "$@" 2>/dev/null; }

# ── 인자가 없으면 목록만 보여준다
if [[ $# -eq 0 || -z "${1:-}" ]]; then
  echo
  echo "백업 목록  ($BACKUP_ROOT)"
  echo "────────────────────────────────────────────────"
  found=0
  for d in $(ls -1d "$BACKUP_ROOT"/pt-* 2>/dev/null | sort -r); do
    found=1
    name="$(basename "$d")"
    when="$(grep '^시각' "$d/manifest.txt" 2>/dev/null | sed 's/^시각 *: *//')"
    rows="$(grep '^복구 검증' "$d/manifest.txt" 2>/dev/null | sed 's/^복구 검증 *: *//')"
    printf "  %-22s %s\n" "$name" "$when"
    printf "  %-22s   %s · %s\n" "" "$(du -sh "$d" | cut -f1)" "$rows"
  done
  [[ $found -eq 1 ]] || echo "  (없습니다.  npm run backup)"
  echo "────────────────────────────────────────────────"
  echo "  되돌리기:  npm run restore -- <이름>"
  echo
  exit 0
fi

# ── 대상 확인
SRC="$1"
[[ -d "$SRC" ]] || SRC="$BACKUP_ROOT/$1"
[[ -d "$SRC" ]] || die "'$1' 을 찾을 수 없습니다.  npm run restore  로 목록을 보세요."
[[ -f "$SRC/db.sql.gz" ]] || die "'$SRC' 에 db.sql.gz 가 없습니다."

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || die "'$CONTAINER' 가 떠 있지 않습니다.  docker compose up -d"

echo
echo "되돌릴 백업"
echo "────────────────────────────────────────────────"
sed 's/^/  /' "$SRC/manifest.txt"
echo "────────────────────────────────────────────────"
echo
echo "⚠️  지금 DB(\`$DB_NAME\`)의 내용이 **전부 지워지고** 위 상태로 바뀝니다."

# ── 확인
if [[ "${IT_RESTORE_YES:-}" != "1" ]]; then
  printf "   되돌리려면 DB 이름을 그대로 입력하세요 (%s): " "$DB_NAME"
  read -r typed
  [[ "$typed" == "$DB_NAME" ]] || die "입력이 달라 중단했습니다."
fi

# ── 되돌리기 직전 백업
if [[ "${IT_RESTORE_NO_SAFETY:-}" != "1" ]]; then
  echo
  echo "▸ 되돌리기 전에 지금 상태를 먼저 백업합니다."
  "$ROOT/scripts/backup.sh" --quick
fi

echo
echo "▸ 복구 중"

# DB
mysql_q -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;
            CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gunzip -c "$SRC/db.sql.gz" | docker exec -e MYSQL_PWD="$DB_PASS" -i "$CONTAINER" \
  mysql -u"$DB_USER" --default-character-set=utf8mb4 "$DB_NAME" 2>/dev/null \
  || die "복구 실패. DB 가 비어 있는 상태일 수 있습니다."
echo "  ① DB 복구 완료"

# 첨부파일 — 지금 것을 지우지 않고 옆으로 치운다
if [[ -f "$SRC/storage.tar.gz" ]]; then
  if [[ -d storage && -n "$(find storage -type f -print -quit 2>/dev/null)" ]]; then
    aside="storage.before-restore-$(date +%Y%m%d-%H%M%S)"
    mv storage "$aside"
    echo "  ② 기존 첨부는 $aside 로 옮겨 뒀습니다"
  fi
  tar -xzf "$SRC/storage.tar.gz" -C "$ROOT"
  echo "  ② 첨부파일 복구 완료 ($(find storage -type f | wc -l | tr -d ' ')개)"
else
  echo "  ② 첨부파일 없음 (건너뜀)"
fi

# ── 결과
echo
echo "복구 후 건수"
tables="$(mysql_q -e "SELECT table_name FROM information_schema.tables
                      WHERE table_schema='$DB_NAME' AND table_type='BASE TABLE' ORDER BY table_name;")"
q=""
while read -r t; do
  [[ -n "$t" ]] && q+="SELECT '$t' AS t, COUNT(*) AS c FROM \`$DB_NAME\`.\`$t\` UNION ALL "
done <<< "$tables"
[[ -n "$q" ]] && mysql_q -e "${q% UNION ALL } ORDER BY t;" | awk '{printf "  %-24s %8d\n", $1, $2}'

echo
echo "✅ 복구 완료.  서버를 다시 시작하세요 —  npm run dev"
echo
