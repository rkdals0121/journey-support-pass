/**
 * 화면에 보여 줄 오류 문구. 우리 서버가 보낸 문구(쉬운 한국어)는 그대로 쓰고,
 * 브라우저가 낸 연결 오류(「Failed to fetch」 등 영어 원문)는 쉬운 말로 바꾼다.
 */
export function userErrorMessage(e: unknown, en: boolean): string {
  if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError"))
    return en ? "The connection is slow. Please try again in a moment." : "연결이 느려요. 잠시 후 다시 눌러 주세요.";
  // fetch 가 서버에 닿지 못하면 TypeError 를 던진다(인터넷 끊김, 서버 꺼짐).
  if (e instanceof TypeError)
    return en ? "Connection lost. Check the internet and try again." : "연결이 끊겼어요. 인터넷 연결을 확인하고 다시 눌러 주세요.";
  if (e instanceof Error && e.message) return e.message;
  return en ? "Something went wrong. Please try again." : "잠시 문제가 생겼어요. 다시 눌러 주세요.";
}
