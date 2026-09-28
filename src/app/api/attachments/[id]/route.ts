import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMAGE_TYPES, openStored } from "@/lib/storage";

/**
 * 첨부파일 내려주기.
 *
 * ★ 정적 파일로 그냥 뿌리지 않고 이 경로를 거치게 한 이유:
 *   사내 이슈의 스크린샷이다. **로그인한 사람만** 볼 수 있어야 한다.
 *   `public/` 에 두면 주소만 알면 누구나 열린다.
 *
 * ★ **어디서 읽는지는 여기가 정하지 않는다** (2026-09-20).
 *   예전엔 이 파일이 `node:fs` 로 직접 읽었다. 그러면 저장하는 쪽(`saveFile`)이
 *   담는 곳을 바꿔도 **읽는 쪽은 여전히 디스크를 본다.** `openStored` 한 곳에 맡긴다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.attachment.findUnique({ where: { id: Number(id) } });
  if (!att) return new Response("Not Found", { status: 404 });

  const buf = await openStored(att.storedPath);
  // DB 기록은 있는데 실물이 없는 경우. 지워졌거나 옮겨졌다.
  if (!buf) return new Response("File Missing", { status: 410 });

  const isImage = IMAGE_TYPES.has(att.mimeType);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(buf.byteLength),
      // 이미지는 화면에 바로 보여주고(inline), 나머지는 내려받게 한다(attachment).
      // 파일명에 따옴표·줄바꿈이 들어가도 헤더가 깨지지 않게 인코딩한다.
      "Content-Disposition":
        `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      // 로그인한 사람에게만 주는 파일이므로 공용 캐시에 남기지 않는다.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
