import siteManifest from "@/app/manifest";
import { TOKEN_RE } from "@/lib/pass-format";

// 패스 화면을 휴대전화 홈 화면에 추가(설치)할 때 쓰는 매니페스트. 패스 화면(page.tsx)이 이 주소를 건다.
// 사이트 전체의 것(app/manifest.ts)은 첫 화면("/")을 열어, 그대로 두면 홈 화면 아이콘이 패스가 아니라 첫 화면을 연다.
// 그래서 이 패스의 주소를 시작 주소로 삼는다. 색·아이콘은 사이트 전체의 것을 그대로 쓴다.
// QR 값의 모양만 본다. 등록된 패스인지 찾아보지 않으며, 항공편이나 고른 항목은 넣지 않는다.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.toUpperCase();
  if (!TOKEN_RE.test(token)) return new Response("Not Found", { status: 404 });
  // 주소는 휴대전화에 남겨 두는 패스 화면(public/sw.js)과 같은 모양(/p/ 소문자 + 대문자 값)으로 맞춘다. 인터넷 없이 열어도 남겨 둔 화면이 나온다.
  const path = `/p/${token}`;
  return Response.json(
    {
      ...siteManifest(),
      name: "Journey Support Pass",
      // 홈 화면 아이콘 아래 이름. 영어로 등록한 여객도 이 패스를 쓰므로, 사이트 전체의 한국어 이름("지원 패스")만 두면
      // 인터넷 없는 공항에서 자기 패스 아이콘을 찾지 못한다. 패스가 어느 언어인지는 찾아보지 않으므로 두 언어를 함께 쓴다.
      short_name: "지원 패스 Pass",
      description: "인천공항 교통약자 지원 패스 · Incheon Airport accessibility support pass",
      // 이름과 설명에 두 언어가 섞여 있어 한국어(ko)로 적지 않는다. undefined 는 JSON 으로 바꿀 때 빠진다.
      lang: undefined,
      id: path,
      start_url: path,
      scope: path,
      display: "standalone",
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
