import { PublicShell } from "../../components/PublicShell";
import { OfficialMapPanel } from "../../components/OfficialMapPanel";
const desks = [
  {
    name: "제1터미널",
    en: "Terminal 1",
    rows: [
      ["3층 일반지역 · 8번 출입구 앞", "3F public area · Entrance 8"],
      [
        "3층 면세지역 · 엔틀러 입구 동·서편",
        "3F duty-free area · east and west of the antler entrance",
      ],
      ["1층 도착장 · 5번·10번 출입구 앞", "1F arrivals · Entrances 5 and 10"],
    ],
  },
  {
    name: "탑승동",
    en: "Concourse",
    rows: [
      [
        "3층 면세지역 · 중앙 안내데스크",
        "3F duty-free area · central information desk",
      ],
    ],
  },
  {
    name: "제2터미널",
    en: "Terminal 2",
    rows: [
      [
        "3층 일반지역 · 2번·7번 출입구 앞",
        "3F public area · Entrances 2 and 7",
      ],
      [
        "3층 면세지역 · 1번 출국장 인근",
        "3F duty-free area · near Departure Area 1",
      ],
      ["1층 도착장 · 2번·5번 출입구 앞", "1F arrivals · Entrances 2 and 5"],
    ],
  },
];
export default async function DeskLocations({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <main id="public-main" className="booking-lookup desk-locations">
        <h1>{en ? "Information desk locations" : "안내데스크 위치"}</h1>
        <OfficialMapPanel en={en} />
        {desks.map((d) => (
          <section key={d.name}>
            <h2>{en ? d.en : d.name}</h2>
            <ul>
              {d.rows.map((row) => (
                <li key={row[0]}>{row[en ? 1 : 0]}</li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <a href="tel:15772600">
            {en ? "Airport information 1577-2600" : "공항 고객센터 1577-2600"}
          </a>
        </p>
        <a
          href="https://iasc.airport.kr/faqbbs/ap_ko/faqBbsArtclList.do"
          target="_blank"
          rel="noreferrer"
        >
          {en
            ? "Source: Incheon Airport information service"
            : "출처: 인천공항 안내서비스"}
        </a>
      </main>
    </PublicShell>
  );
}
