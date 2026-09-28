import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { appEnv, cleanEnv, envOn } from "./db-url";
import { formatBytes } from "./format";
import { prisma } from "./prisma";

/**
 * 첨부파일 저장.
 *
 * ★ 파일은 저장소(git) 밖, `storage/` 아래에 둔다. `.gitignore` 에 등록돼 있다.
 *   사내 이슈의 스크린샷이므로 커밋되면 안 된다.
 *
 * ★ 사용자가 준 파일명을 경로에 쓰지 않는다.
 *   `../../etc/passwd` 같은 이름이 들어오면 저장소 밖에 쓰게 된다(경로 탈출).
 *   저장 이름은 UUID 로 만들고, 원본 이름은 DB 에만 둔다.
 *
 * ★★ **어디에 담느냐는 여기 한 곳에서만 정한다** (2026-09-20 신설).
 *   `IT_STORAGE=db` 면 디스크가 아니라 DB(`file_blobs`)에 담는다.
 *   무료 호스팅(Vercel 등)은 **디스크가 요청마다 사라지는** 곳이라 `storage/` 에
 *   써 봐야 다음 요청에서 없다. 그렇다고 부르는 쪽을 고치면
 *   등록·코멘트·첨부 **세 곳**이 각자 다르게 저장하게 된다.
 *   그래서 `saveFile` / `openStored` / `deleteFile` 의 **모양은 그대로 두고**
 *   안에서만 갈라놓는다 — `buildWhere()` · `people.ts` 와 같은 이유다.
 *
 *   | 값 | 어디에 | 쓰는 곳 |
 *   |---|---|---|
 *   | (없음) · `fs` | `storage/attachments/…` | 사내 서버 · 내 PC — **기본값** |
 *   | `db` | `file_blobs` 표 | 디스크가 없는 무료 호스팅(데모) |
 */

const ROOT = resolve(process.cwd(), "storage", "attachments");

/**
 * `db` 면 DB 에, 아니면 디스크에. 기본은 디스크 — **사내 운영은 아무것도 안 바뀐다.**
 *
 * ⚠️ **대소문자를 가리지 않는다.** 배포 화면에 손으로 넣다가 `DB` 로 들어간 적이 있다.
 *   `=== "db"` 로 두면 **조용히 디스크로 떨어져서**, 첨부가 올라간 것처럼 보이고
 *   다음 요청에 사라진다. 틀린 값으로 **조용히 다른 일을 하는 것**이 제일 나쁘다.
 */
const IN_DB = cleanEnv(appEnv("STORAGE")).toLowerCase() === "db";

/** 화면에서 바로 미리보기가 되는 형식만 이미지로 친다. */
export const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
]);

/** 허용 형식. QA 가 실제로 붙이는 것 위주 — 스크린샷과 로그·명세 파일. */
export const ALLOWED_TYPES = new Set([
  ...IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
]);

/**
 * 파일 한 개의 상한. 기본 10MB.
 *
 * ⚠️ **호스팅이 더 낮은 상한을 가질 수 있다.** 서버리스(Vercel)는 요청 본문이
 *   4.5MB 를 넘으면 **우리 코드에 닿기도 전에** 끊긴다. `next.config.ts` 의
 *   `bodySizeLimit` 을 올려도 그건 Next 의 상한이지 플랫폼의 상한이 아니다.
 *   그런 곳에서는 `IT_MAX_UPLOAD_MB=4` 로 낮춰서 **사용자에게 안내 문구가 뜨게** 한다.
 *   (안 낮추면 화면에는 빈 500 이 뜬다 — 2026-08-31 에 사내에서 겪은 것과 같은 길)
 */
export const MAX_BYTES = Number(cleanEnv(appEnv("MAX_UPLOAD_MB")) || 10) * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
  "image/webp": "webp", "image/avif": "avif", "application/pdf": "pdf",
  "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** `{프로젝트}/{연월}/{uuid}.{확장자}` — 프로젝트별·월별로 나눠 한 폴더가 비대해지지 않게 */
export async function saveFile(projectKey: string, file: File) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rel = join(projectKey, ym, `${randomUUID()}.${EXT[file.type] ?? "bin"}`);
  const buf = Buffer.from(await file.arrayBuffer());

  if (IN_DB) {
    await prisma.fileBlob.create({ data: { path: rel, data: buf } });
    return rel;
  }

  const abs = join(ROOT, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return rel;
}

/** 저장 경로로 실제 파일 위치를 구한다. 저장소 밖으로 나가면 거부한다. */
export function resolveStored(rel: string) {
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(ROOT)) throw new Error("잘못된 저장 경로입니다.");
  return abs;
}

/**
 * 저장된 파일을 읽어 온다. 없으면 `null`.
 *
 * ★ 내려주는 쪽(`/api/attachments/[id]`)이 `node:fs` 를 직접 부르지 않게 하려고 만들었다.
 *   거기서 직접 읽으면 **저장은 DB 에 했는데 읽기는 디스크에서** 하는 짝이 생긴다.
 */
export async function openStored(rel: string): Promise<Buffer | null> {
  try {
    if (IN_DB) {
      const row = await prisma.fileBlob.findUnique({ where: { path: rel } });
      return row ? Buffer.from(row.data) : null;
    }
    return await readFile(resolveStored(rel));
  } catch {
    // 지워졌거나 옮겨진 경우. 기록은 있는데 실물이 없다.
    return null;
  }
}

export async function deleteFile(rel: string) {
  try {
    if (IN_DB) {
      await prisma.fileBlob.delete({ where: { path: rel } });
      return;
    }
    await unlink(resolveStored(rel));
  } catch {
    // 이미 없으면 그냥 넘어간다. DB 기록을 지우는 게 더 중요하다.
  }
}

// 이 파일은 server-only 라 클라이언트에서 못 불러온다.
// 화면과 서버가 같은 표기를 쓰도록 format.ts 에 두고 다시 내보낸다.
export { formatBytes };

/**
 * FormData 의 파일들을 검사한다. 통과하면 File[] 을, 아니면 오류 메시지를 돌려준다.
 * 등록·코멘트·첨부 세 곳에서 같은 규칙을 쓰기 위해 한곳에 둔다.
 */
export function pickFiles(fd: FormData, field = "files") {
  const files = fd.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return { error: `${f.name} — 파일이 너무 큽니다 (최대 ${formatBytes(MAX_BYTES)})` };
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return { error: `${f.name} — 올릴 수 없는 형식입니다 (${f.type || "알 수 없음"})` };
    }
  }
  return { files };
}
