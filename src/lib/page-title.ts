import type { Metadata } from "next";

const SITE = "Journey Support Pass";

/**
 * 화면마다 브라우저 탭·화면 읽기 프로그램이 읽는 제목을 붙인다(예: 「서비스 찾기 · Journey Support Pass」).
 * 모든 화면 제목이 같으면 탭을 여러 개 연 사람이나 화면 읽기 프로그램을 쓰는 사람이 어느 화면인지 알 수 없다(WCAG 2.4.2).
 * 영어 제목을 주면 주소에 ?lang=en 이 있을 때 영어로 붙인다.
 */
export function pageTitle(ko: string, en?: string) {
  return async ({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> => {
    const lang = en ? (await searchParams)?.lang : undefined;
    return { title: `${lang === "en" ? en : ko} · ${SITE}` };
  };
}
