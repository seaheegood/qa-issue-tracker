/** 파일 크기를 사람이 읽는 단위로. 서버·클라이언트 양쪽에서 쓴다. */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
