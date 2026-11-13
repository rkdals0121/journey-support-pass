"use client";

import {
  ArrowLeft,
  BookOpen,
  Camera,
  Download,
  Gift,
  Lock,
  Palette,
  QrCode,
  RotateCcw,
  Shuffle,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { areaName, exitName, stampCopy, themeFor, type StampLang } from "./copy";
import { Scanner } from "../components/Scanner";
import {
  CHECKPOINTS,
  EMPTY,
  GOAL,
  THEME_IDS,
  checkpointOf,
  checkpointPlace,
  makeCertId,
  type BookState,
  type ThemeId,
} from "@/lib/stamp-book";
import { EXITS, courseFits, gateProblem, makeCourse, stampEligibility } from "@/lib/stamp-routing";
import { Emblem, Portrait, StampMark } from "./art";
import { PhotoFilter } from "./PhotoFilter";
import { Burst, NarangiSays, StampBoard, boardLine, cheerLine } from "./Cheer";
import { StartMap } from "./StartMap";
import { PublicShell } from "../components/PublicShell";
import { useViewSettings } from "../components/viewSettings";
import "./stamp.css";

type View = "themes" | "cover" | "home" | "scan" | "got" | "done" | "camera";

const KEY = "jsp:stamp-book";

function load(): BookState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw);
    if (
      saved.checkpointVersion !== 3 &&
      (Object.keys(saved.stamps ?? {}).length || saved.certId)
    )
      return {
        ...EMPTY,
        ...saved,
        checkpointVersion: 3,
        stamps: {},
        course: [],
        startHub: "",
        certId: "",
        certAt: 0,
        certGoal: undefined,
        telemetry: [],
      };
    return { ...EMPTY, ...saved, checkpointVersion: 3 };
  } catch {
    return EMPTY;
  }
}

function save(s: BookState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장 공간이 모자라면 사진만 빼고라도 도장은 남긴다.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...s, photo: "" }));
    } catch {
      // 저장소를 못 쓰는 브라우저(사생활 보호 창 등)에서는 이 화면을 닫으면 사라진다.
    }
  }
}

/**
 * 가족 여행객 전자 스탬프북. 기록은 이 휴대전화에만 남는다(서버로 보내지 않는다).
 * scanned: 휴대전화 기본 카메라로 체크포인트 QR 을 찍어 /stamp/c/{번호} 로 들어온 경우 그 번호.
 */
export function StampBook({ scanned, lang = "ko" }: { scanned?: string; lang?: "ko" | "en" }) {
  const tr = useMemo(() => stampCopy(lang), [lang]);
  const [s, setS] = useState<BookState | null>(null);
  const [view, setView] = useState<View>("themes");
  const [got, setGot] = useState<{ i: number; again: boolean } | null>(null);
  const [scanErr, setScanErr] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [typed, setTyped] = useState("");
  const [welcome, setWelcome] = useState("");
  const [clock, setClock] = useState(0);
  const settings = useViewSettings();

  // 입구의 공용 바에서 고른 글자 크기는 전용 수집 화면에서도 이어 쓴다.
  useEffect(() => {
    document.documentElement.style.setProperty("--scale", String(settings.scale ?? 1));
    return () => { document.documentElement.style.removeProperty("--scale"); };
  }, [settings.scale, view]);

  // 처음 열 때 저장된 수첩을 읽는다. QR 주소로 들어왔으면 도장부터 찍는다.
  useEffect(() => {
    let st = load();
    // 스탬프북에 새로 들어오면(메인 화면의 스탬프북 버튼 등) 수첩을 시작했든 안 했든 늘 테마 고르기부터 연다.
    // 이어서 하려면 테마 고르기 아래 "내 수첩 열어 보기"를 누른다. 새로 고침·뒤로가기는 보던 화면을 이어 쓴다(아래 kept).
    // QR로 들어왔을 때만 고른 수첩으로 바로 가서 도장을 찍는다(수첩을 아직 준비하지 않았으면 표지).
    let first: View = !scanned || !st.theme ? "themes" : !st.name ? "cover" : "home";
    if (scanned) {
      const i = checkpointOf(scanned);
      const eligible = stampEligibility(st);
      if (i >= 0 && eligible.indices.includes(i)) {
        const again = i in st.stamps;
        if (!again) st = { ...st, stamps: { ...st.stamps, [i]: Date.now() } };
        setGot({ i, again });
        if (first === "home") first = "got";
        else setWelcome(tr("도장을 하나 받았어요! 먼저 수첩을 준비해요."));
      } else {
        const message =
          eligible.reason ||
          tr("이 체크포인트는 지금 코스·경로에 없어요. 수첩 목록에 있는 체크포인트를 찾아봐요.");
        setWelcome(message);
        setScanErr(message);
      }
    }
    // 화면 이동을 브라우저 기록에 남겨 휴대전화 뒤로가기로 앞 화면에 돌아오게 한다.
    // 맨 밑에는 늘 테마 고르기를 깔아 둔다. 저장된 수첩으로 바로 열려도 뒤로가기 한 번이면 테마 고르기가 나온다.
    // QR 주소로 들어왔으면 주소를 스탬프북 첫 주소로 바꿔, 새로 고쳐도 같은 도장을 다시 찍은 것처럼 보이지 않게 한다.
    // 새로 고침·되돌아오기라 이미 기록이 있으면 기록을 더 쌓지 않고 그 화면을 이어 쓴다(카메라·도장 화면은 수첩 홈으로).
    const kept = (window.history.state as { sb?: View } | null)?.sb;
    if (kept && !scanned && st.theme && st.name)
      first =
        kept === "themes" || kept === "cover" || kept === "done"
          ? kept
          : "home";
    else {
      window.history.replaceState(
        { ...window.history.state, sb: "themes" },
        "",
        "/stamp" + (lang === "en" ? "?lang=en" : ""),
      );
      if (first !== "themes")
        window.history.pushState({ ...window.history.state, sb: first }, "");
    }
    setS(st);
    setView(first);
  }, [scanned, lang, tr]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const v = (e.state as { sb?: View } | null)?.sb;
      if (v) setView(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (s) save(s);
  }, [s]);

  // 놀이형은 탑승구가 정해지면 그 탑승구 근처에서 끝나는 코스를 만든다. 탑승구를 바꾸면 새로 만든다.
  useEffect(() => {
    if (s?.mode === "play" && !gateProblem(s.gate) && !courseFits(s.course, s.gate))
      setS({ ...s, course: makeCourse(s.gate) });
  }, [s]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!s?.theme || !s.name) return;
    const route = stampEligibility(s, clock || Date.now());
    const goal = route.indices.length;
    const n = route.indices.filter((i) => i in s.stamps).length;
    const events = [
      "stamp_start",
      ...(goal > 0 && n >= goal ? ["stamp_finish"] : []),
    ].filter((k) => !s.telemetry?.includes(k));
    if (!events.length) return;
    setS((old) =>
      old ? { ...old, telemetry: [...(old.telemetry || []), ...events] } : old,
    );
    for (const kind of events)
      void fetch("/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      }).catch(() => {});
  }, [s, clock]);

  if (!s) return <div className="sb" data-theme="pick" />;

  const update = (p: Partial<BookState>) => setS({ ...s, ...p });
  // replace: 지금 화면을 기록에서 바꿔 끼운다. 뒤로가기로 다시 오면 어색한 화면(스캔 직후의 카메라, 찍은 뒤의 촬영 화면)에 쓴다.
  const go = (v: View, replace = false) => {
    const state = { ...window.history.state, sb: v };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setView(v);
    window.scrollTo(0, 0);
  };

  if (view === "themes" || !s.theme)
    return (
      <ThemePicker
        lang={lang}
        current={s.theme}
        note={tr(welcome)}
        mine={
          s.theme && s.name
            ? `${themeFor(s.theme, lang).title} · ${themeFor(s.theme, lang).unit} ${stampEligibility(s).indices.filter((i) => i in s.stamps).length}${lang === "ko" ? "개" : ""}`
            : ""
        }
        onOpen={() => go("cover")}
        onPick={(theme) => {
          update({ theme, role: themeFor(theme, lang).roles[0].id });
          go(s.name ? "home" : "cover");
        }}
      />
    );

  const theme = s.theme;
  const t = themeFor(theme, lang);
  const itinerary = stampEligibility(s, clock || Date.now());
  const goal = itinerary.indices.length;
  const n = itinerary.indices.filter((i) => i in s.stamps).length;
  const complete = goal > 0 && n >= goal;
  // 나랑이가 알려 줄 다음 도장 자리와 보상 이름
  const nextStop = itinerary.indices.find((i) => !(i in s.stamps));
  const nextPlace = nextStop === undefined ? "" : checkpointPlace(CHECKPOINTS[nextStop], lang);
  const reward = lang === "en" ? "photo filter" : "인증 사진 필터";
  // 첫 도장을 받으면 설정(탑승구·지금 있는 곳·지도·탑승 시각)은 접고, 진행도·탑승 정보·체크포인트만 보여 준다.
  const started = n > 0;
  // 탑승구·지금 있는 곳(경로형)·탑승 시각 설정. 첫 도장 전에는 펼쳐 두고, 뒤에는 "탑승 정보 바꾸기" 안에 접는다.
  const setup = (
    <section className="sb-fields" aria-label={tr("경로 설정")}>
      <label>
        {tr("탑승구 번호 ")}<input
          value={s.gate}
          inputMode="numeric"
          maxLength={4}
          required
          onChange={(e) =>
            update({ gate: e.target.value.replace(/\D/g, "") })
          }
        />
      </label>
      {s.mode === "route" && (
        <>
          <StartMap lang={lang}
            gate={s.gate}
            value={s.startHub}
            onPick={(id) => update({ startHub: id, course: [] })}
          />
          {/* 지도가 불편하거나 화면 읽기 프로그램을 쓰면 목록으로 고른다. */}
          <details className="sb-map-list">
            <summary>{tr("목록으로 고르기")}</summary>
            <label>
              {tr("지금 있는 곳 · 출국심사를 마친 뒤 ")}<select
                value={s.startHub || ""}
                onChange={(e) => update({ startHub: e.target.value, course: [] })}
              >
                <option value="" disabled>
                  {tr("지금 있는 곳 고르기 ")}</option>
                <optgroup label={tr("출국심사를 막 마쳤어요")}>
                  {EXITS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {exitName(e.id, e.label, lang)}
                    </option>
                  ))}
                </optgroup>
                {(["T1", "CONCOURSE", "T2"] as const).map((a) => (
                  <optgroup key={a} label={tr(`이 체크포인트 근처예요 · ${areaName(a, lang)}`)}>
                    {CHECKPOINTS.filter((c) => c.area === a).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {checkpointPlace(c, lang)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </details>
        </>
      )}
      <label>
        {tr("탑승 시각 · 한국시간 · 선택 ")}<input
          type="datetime-local"
          value={s.boardingAt || ""}
          onChange={(e) => update({ boardingAt: e.target.value })}
        />
      </label>
      {itinerary.reason ? (
        <p role="status">{tr(itinerary.reason)}</p>
      ) : (
        <p>
          {lang === "en" ? <>
            About {itinerary.minutes} minutes {s.mode === "play" ? "for all 6 stops" : "to your gate while collecting stamps"}, estimated for a family walking slowly.
            {s.mode === "route" ? " Allow 15 extra minutes before boarding." : " Try another course if this is too long."}
          </> : <>
            {s.mode === "play" ? "코스 6곳을 도는 데" : "도장을 모으며 탑승구까지"} 약{" "}
            {itinerary.minutes}분 · 걸음이 느린 가족 기준 추정이에요.
            {s.mode === "route" && " 탑승 전 여유 15분은 따로 두세요."}
            {s.mode === "play" && " 너무 길다 싶으면 다른 코스로 바꿔 보세요."}
          </>}
        </p>
      )}
      {s.mode === "play" && !gateProblem(s.gate) && (
        <button
          type="button"
          className="sb-link"
          onClick={() => update({ course: makeCourse(s.gate) })}
        >
          <Shuffle aria-hidden="true" /> {tr("다른 코스로 바꾸기 ")}</button>
      )}
    </section>
  );
  const role = t.roles.find((r) => r.id === s.role) ?? t.roles[0];

  function award(i: number) {
    const again = i in s!.stamps;
    if (!again) update({ stamps: { ...s!.stamps, [i]: Date.now() } });
    setGot({ i, again });
    setScanErr("");
    setTyped("");
    go("got", true);
  }

  // typed: 고유번호를 손으로 넣은 경우. 「QR을 비춰 주세요」 대신 번호를 다시 보라고 한다
  function onScan(text: string, typed = false) {
    const i = checkpointOf(text);
    if (i < 0)
      setScanErr(
        typed
          ? lang === "en"
            ? "That code does not match a checkpoint. Check the 6 characters under the QR poster."
            : "맞는 고유번호가 아니에요. QR 포스터 아래 6자리를 다시 확인해 주세요."
          : tr("스탬프북 QR이 아니에요. 체크포인트의 QR을 비춰 주세요."),
      );
    else if (!stampEligibility(s!, Date.now()).indices.includes(i))
      setScanErr(
        itinerary.reason || tr("이 체크포인트는 지금 코스·경로에 없어요. 수첩 목록에 있는 체크포인트를 찾아봐요."),
      );
    else award(i);
  }

  return (
    <div className="sb" data-theme={theme} lang={lang}>
      <nav className="sb-return" lang={lang} aria-label={lang === "en" ? "Leave the stamp book" : tr("스탬프북 나가기")}>
        <Link href={"/services" + (lang === "en" ? "?lang=en" : "")} className="sb-link">
          <ArrowLeft aria-hidden="true" /> {lang === "en" ? "Back to services" : tr("서비스로 돌아가기")}
        </Link>
      </nav>
      {view === "cover" && (
        <main className="sb-cover">
          <p className="sb-kicker">{t.kicker}</p>
          <Emblem theme={theme} />
          <h1 className="sb-title">{t.title}</h1>
          <p className="sb-sub">{t.subtitle}</p>
          {welcome && (
            <p className="sb-welcome" role="status">
              {tr(welcome)}
            </p>
          )}
          <section className="sb-idcard">
            <div className="sb-photo-slot">
              {s.photo ? (
                <img src={s.photo} alt={tr(`${s.name}의 인증 사진`)} />
              ) : (
                <>
                  <User aria-hidden="true" />
                  <span>{t.photoSlot}</span>
                </>
              )}
            </div>
            <div className="sb-fields">
              <label>
                {t.nameLabel}
                <input
                  value={s.name}
                  maxLength={12}
                  placeholder={tr("이름을 입력해요")}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                {t.gateLabel}
                <input
                  value={s.gate}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder={tr("탑승구 번호 (필수)")}
                  className="sb-dashed"
                  required
                  aria-invalid={!!gateErr}
                  aria-describedby={gateErr ? "sb-gate-err" : undefined}
                  onChange={(e) => {
                    setGateErr("");
                    update({ gate: e.target.value.replace(/\D/g, "") });
                  }}
                />
              </label>
              {gateErr && (
                <p id="sb-gate-err" className="sb-error" role="alert">
                  {tr(gateErr)}
                </p>
              )}
            </div>
          </section>
          {s.certId ? (
            <CertCard lang={lang} theme={theme} s={s} badge={role.badge} />
          ) : (
            <p className="sb-promise">{t.promise}</p>
          )}
          <div className="sb-actions">
            <button
              type="button"
              className="sb-btn sb-btn-cta"
              onClick={() => {
                const bad = gateProblem(s.gate);
                if (bad) return setGateErr(bad);
                if (!s.name.trim()) update({ name: tr("꼬마 여행자") });
                const fromQr = !!welcome && !!got;
                setWelcome("");
                go(fromQr ? "got" : "home");
              }}
            >
              {n > 0 ? tr("수첩 이어 보기") : t.start}
            </button>
            {s.name && (
              <button
                type="button"
                className="sb-link"
                onClick={() => {
                  if (
                    !confirm(tr("모은 도장과 사진을 모두 지우고 처음부터 할까요?"))
                  )
                    return;
                  setS(EMPTY);
                  setGot(null);
                  go("themes", true);
                }}
              >
                <RotateCcw aria-hidden="true" /> {tr("처음부터 다시 하기 ")}</button>
            )}
          </div>
        </main>
      )}

      {view === "home" && (
        <main className="sb-page">
          <header className="sb-head">
            <h1>{t.title}</h1>
            <span className="sb-badge">
              {t.unit} {n} / {goal}
            </span>
          </header>
          <nav className="sb-tools" aria-label={tr("수첩 메뉴")}>
            <button type="button" onClick={() => go("cover")}>
              <BookOpen aria-hidden="true" /> {tr("내 수첩 ")}</button>
            <button type="button" onClick={() => go("themes")}>
              <Palette aria-hidden="true" /> {tr("테마 바꾸기 ")}</button>
          </nav>
          {!started && (
          <div className="sb-tabs" role="tablist" aria-label={tr("사용 방식")}>
            {(["play", "route"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={s.mode === m}
                onClick={() => update({ mode: m })}
              >
                {m === "play" ? tr("놀이형") : tr("경로형")}
              </button>
            ))}
          </div>
          )}
          {scanErr && (
            <p className="sb-error" role="alert">
              {tr(scanErr)}
            </p>
          )}
          {goal > 0 ? (
            <section className="sb-board-card" aria-label={lang === "en" ? "Stamp board" : "도장판"}>
              <div className="sb-board-head">
                <span>{lang === "en" ? "My stamps" : `모은 ${t.unit}`}</span>
                <strong className="num">
                  {n}
                  <small> / {goal}</small>
                </strong>
              </div>
              <StampBoard theme={theme} n={n} goal={goal} lang={lang} />
              <NarangiSays size="sm" face={n === 0 ? "guide" : n >= goal ? "cheer" : "goodluck"} text={boardLine(n, goal, nextPlace, reward, lang)} />
            </section>
          ) : (
            <Progress lang={lang} theme={theme} n={n} goal={goal} />
          )}
          {started ? (
            <>
              <TripInfo lang={lang} gate={s.gate} boardingAt={s.boardingAt} now={clock || Date.now()} />
              <details className="sb-trip-edit">
                <summary>{tr("탑승 정보 바꾸기")}</summary>
                {setup}
              </details>
            </>
          ) : (
            setup
          )}
          {s.mode === "play" ? <PlayList lang={lang} s={s} /> : <RouteMap lang={lang} s={s} />}
          <div className="sb-actions sb-sticky">
            {complete ? (
              <button
                type="button"
                className="sb-btn sb-btn-accent"
                onClick={() => go("done")}
              >
                {tr("완성 보상 받으러 가기 ")}</button>
            ) : (
              <button
                type="button"
                className="sb-btn sb-btn-main"
                disabled={!!itinerary.reason}
                onClick={() => go("scan")}
              >
                <QrCode aria-hidden="true" /> {tr("QR 스캔하기 ")}</button>
            )}
          </div>
        </main>
      )}

      {view === "scan" && (
        <main className="sb-scan">
          <h1 className="sr-only">{tr("QR 스캔")}</h1>
          <NarangiSays
            face="guide"
            size="sm"
            text={
              lang === "en"
                ? `Find the QR poster at ${nextPlace || "a checkpoint"} and scan it!`
                : `「${nextPlace || "체크포인트"}」의 QR 포스터를 찾아 비춰 주세요!`
            }
          />
          <Scanner
            onScan={onScan}
            imageLabel={tr("QR 사진으로 찍기")}
            text={{
              starting: tr("카메라를 켜는 중이에요…"),
              ready: tr("현재 구역의 체크포인트 QR을 비춰 주세요"),
              read: tr("읽었어요!"),
              none: tr("카메라를 쓸 수 없어요. 아래에 QR 포스터의 고유번호를 눌러 주세요."),
              switchCamera: tr("카메라 바꾸기"),
            }}
          />
          {scanErr && (
            <p className="sb-error" role="alert">
              {tr(scanErr)}
            </p>
          )}
          <form
            className="sb-typed"
            onSubmit={(e) => {
              e.preventDefault();
              onScan(typed, true);
            }}
          >
            <label htmlFor="sb-code">
              {tr("QR이 안 찍히면 QR 포스터 아래 고유번호(6자리)를 눌러요 ")}</label>
            <div>
              <input
                id="sb-code"
                value={typed}
                maxLength={7}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder={tr("예: 7KQ4MD")}
                onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button
                type="submit"
                className="sb-btn sb-btn-cta"
                disabled={typed.length < 6}
              >
                {tr("찍기 ")}</button>
            </div>
          </form>
          <button
            type="button"
            className="sb-btn sb-btn-line sb-on-dark"
            onClick={() => go("home")}
          >
            {tr("수첩으로 돌아가기 ")}</button>
        </main>
      )}

      {view === "got" && got && (
        <main className={`sb-got${got.again ? " is-again" : ""}`}>
          {/* 도장을 받은 순간: 도장이 「쾅」 찍히고 반짝이가 퍼진 뒤 나랑이가 튀어나와 한마디 한다 */}
          <div className="sb-got-stage">
            <div className="sb-stamp-pop">
              {!got.again && <Burst />}
              {/* 나랑이는 아래 말풍선에서 말한다. 무대에는 모든 테마가 도장을 크게 찍는다 */}
              <StampMark theme={theme} size={150} />
            </div>
            {!got.again && goal > 0 && (
              <p className="sb-plus" aria-hidden="true">
                +1
              </p>
            )}
          </div>
          <section className="sb-sheet">
            <p className="sb-got-kicker">
              {got.again
                ? lang === "en" ? "Already stamped" : "이미 찍은 곳"
                : lang === "en" ? `Stamp ${n}!` : `${n}번째 도장 쾅!`}
            </p>
            {/* 제목은 그 도장의 이름(테마마다 다름). 「도장 쾅!」과 같은 말을 두 번 하지 않는다 */}
            <h1>
              {got.again ? tr("이미 받은 도장이에요") : stopName(t.stops, itinerary.indices, got.i, lang)}
            </h1>
            <p className="sb-hint">
              {CHECKPOINTS[got.i].code} · {checkpointPlace(CHECKPOINTS[got.i], lang)}
            </p>
            {goal > 0 && (
              <div className="sb-score" aria-label={lang === "en" ? `${n} of ${goal} stamps` : `도장 ${goal}개 중 ${n}개`}>
                <strong className="num">{n}</strong>
                <span className="num">/ {goal}</span>
              </div>
            )}
            <StampBoard theme={theme} n={n} goal={goal} fresh={got.again ? undefined : itinerary.indices.indexOf(got.i) >= 0 ? n - 1 : undefined} lang={lang} />
            <NarangiSays
              pop={!got.again}
              face={got.again ? "sorry" : n >= goal ? "cheer" : "surprised"}
              text={
                got.again
                  ? lang === "en"
                    ? "You already have this one. Let's find another stop!"
                    : "여긴 이미 찍었어요. 다른 곳을 찾아봐요!"
                  : cheerLine(n, goal, lang)
              }
            />
            {goal > 0 && n < goal && (
              <p className="sb-reward-left">
                <Lock aria-hidden="true" />
                {t.remain(Math.max(0, goal - n))}
              </p>
            )}
            <div className="sb-actions">
              <button
                type="button"
                className={`sb-btn ${complete ? "sb-btn-accent" : "sb-btn-main"}`}
                onClick={() => go(complete ? "done" : "home")}
              >
                {complete ? tr("완성 보상 받으러 가기") : t.next}
              </button>
            </div>
          </section>
        </main>
      )}

      {view === "done" && (
        <main className="sb-page">
          <header className="sb-head">
            <h1>{complete ? t.doneTitle : t.title}</h1>
            <span className="sb-badge sb-badge-accent">
              {t.unit} {n} / {goal}
            </span>
          </header>
          {!complete ? (
            <p className="sb-promise">
              {goal > 0
                ? t.remain(Math.max(0, goal - n))
                : tr("현재 거점과 탑승구를 먼저 확인해 주세요.")}
            </p>
          ) : (
            <>
              {/* 완성 축하: 꽉 찬 도장판과 나랑이의 축하. 아직 인증을 받지 않았을 때만(받은 뒤엔 인증 카드가 주인공) */}
              {!s.certId && (
                <section className="sb-finish" aria-label={lang === "en" ? "Course complete" : "코스 완성"}>
                  <Burst />
                  <StampBoard theme={theme} n={n} goal={goal} lang={lang} />
                  <NarangiSays
                    face="cheer"
                    pop
                    text={
                      lang === "en"
                        ? `All ${goal} stamps! Pick a photo filter and get your certificate.`
                        : `도장 ${goal}개를 다 모았어요! 사진 필터를 골라 인증을 받아요!`
                    }
                  />
                </section>
              )}
              <figure className="sb-portrait">
                {s.photo ? (
                  <img src={s.photo} alt={tr(`${role.filter}로 찍은 인증 사진`)} />
                ) : (
                  <>
                    <Portrait role={role.id} />
                    <figcaption>{role.filter}</figcaption>
                  </>
                )}
              </figure>
              {t.roles.length > 1 && !s.certId && (
                <div
                  className="sb-roles"
                  role="radiogroup"
                  aria-label={tr("필터 고르기")}
                >
                  {t.roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={role.id === r.id}
                      onClick={() => update({ role: r.id })}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {s.certId && <CertCard lang={lang} theme={theme} s={s} badge={role.badge} />}
              <div className="sb-actions">
                {s.photo && (
                  <a
                    className="sb-btn sb-btn-main"
                    href={s.photo}
                    onClick={() => {
                      if (!s.telemetry?.includes("stamp_share")) {
                        update({
                          telemetry: [...(s.telemetry || []), "stamp_share"],
                        });
                        void fetch("/api/experience", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ kind: "stamp_share" }),
                        }).catch(() => {});
                      }
                    }}
                    download={`${s.certId || "stamp"}.jpg`}
                  >
                    <Download aria-hidden="true" /> {tr("사진 저장하기 ")}</a>
                )}
                <button
                  type="button"
                  className={`sb-btn ${s.photo ? "sb-btn-line" : "sb-btn-accent"}`}
                  onClick={() => go("camera")}
                >
                  <Camera aria-hidden="true" />{" "}
                  {/* 인증 ID를 이미 받았으면 「인증 ID 받기」가 맞지 않다. 사진만 더하는 일 */}
                  {s.photo ? tr("다시 찍기") : s.certId ? (lang === "en" ? "Add a photo" : "인증 사진도 찍기") : t.takePhoto}
                </button>
                {!s.certId && (
                  <button
                    type="button"
                    className="sb-link"
                    onClick={() =>
                      update({
                        certId: makeCertId(theme, new Date()),
                        certAt: Date.now(),
                        certGoal: goal,
                      })
                    }
                  >
                    {tr("사진 없이 인증 ID만 받기 ")}</button>
                )}
                <button
                  type="button"
                  className="sb-link"
                  onClick={() => go("cover")}
                >
                  <BookOpen aria-hidden="true" /> {tr("내 수첩 보기 ")}</button>
              </div>
            </>
          )}
        </main>
      )}

      {view === "camera" && (
        <main className="sb-page sb-dark">
          <h1 className="sb-camera-title">{role.filter}</h1>
          <PhotoFilter lang={lang}
            role={role.id}
            caption={`${t.title} · ${s.name} · ${role.badge}`}
            onCancel={() => go("done")}
            onDone={(photo) => {
              update({
                photo,
                certId: s.certId || makeCertId(theme, new Date()),
                certAt: s.certAt || Date.now(),
                certGoal: goal,
              });
              // 찍은 사진은 내 수첩의 인증 사진 자리에 들어간다. 바로 보여 준다.
              go("cover", true);
            }}
          />
        </main>
      )}
    </div>
  );
}

function ThemePicker({
  lang,
  current,
  note,
  mine,
  onPick,
  onOpen,
}: {
  lang: "ko" | "en";
  current: ThemeId | null;
  note: string;
  mine: string;
  onPick: (t: ThemeId) => void;
  onOpen: () => void;
}) {
  const tr = stampCopy(lang);
  return (
    <PublicShell lang={lang}>
    <main className="sb sb-entry" data-theme="pick" id="public-main" lang={lang}>
      <div className="sb-page">
        <h1 className="sb-pick-title">
          {tr("어떤 수첩으로 ")}<br />
          {tr("공항을 여행할까요? ")}</h1>
        {note && (
          <p className="sb-welcome" role="status">
            {tr(note)}
          </p>
        )}
        <NarangiSays
          size="sm"
          text={
            lang === "en"
              ? "Pick a notebook and let's go! Fill it with stamps and I'll give you a special photo filter."
              : "수첩을 골라 같이 떠나요! 도장을 다 모으면 특별한 사진 필터를 줄게요."
          }
        />
        <p className="sb-pick-sub">{tr("나중에 바꿔도 모은 도장은 그대로예요.")}</p>
        <ul className="sb-pick">
          {THEME_IDS.map((id) => (
            <li key={id}>
              <button
                type="button"
                data-theme={id}
                aria-pressed={current === id}
                onClick={() => onPick(id)}
              >
                <span className="sb-pick-art">
                  <Emblem theme={id} size={64} />
                </span>
                <span className="sb-pick-text">
                  <strong>{themeFor(id, lang).title}</strong>
                  <span>{themeFor(id, lang).subtitle}</span>
                  <span className="sb-pick-stamps" aria-hidden="true">
                    <StampMark theme={id} size={26} />
                    <StampMark theme={id} size={26} />
                    <StampMark theme={id} size={26} />
                  </span>
                  {/* 무엇을 받는지 먼저 보여 준다(게임의 「완성 보상」) */}
                  <span className="sb-pick-reward">
                    <Gift aria-hidden="true" />
                    {lang === "en" ? "Reward · " : "완성 보상 · "}
                    {themeFor(id, lang).roles.map((r) => r.label).join(lang === "en" ? " / " : "·")}
                    {lang === "en" ? " photo" : " 사진"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {mine && (
          <button
            type="button"
            className="sb-link sb-pick-mine"
            onClick={onOpen}
          >
            <BookOpen aria-hidden="true" /> {tr("내 수첩 열어 보기")}{" "}
            <small>({mine})</small>
          </button>
        )}
      </div>
    </main>
    </PublicShell>
  );
}

function Progress({
  lang,
  theme,
  n,
  note,
  goal = GOAL,
}: {
  lang: StampLang;
  theme: ThemeId;
  n: number;
  note?: boolean;
  goal?: number;
}) {
  const tr = stampCopy(lang);
  const t = themeFor(theme, lang);
  const label =
    theme === "explorer"
      ? tr("탐험 진행도")
      : theme === "friend"
        ? tr("도장 진행도")
        : tr("비행 진행도");
  return (
    <section className="sb-progress">
      <div>
        <span>{label}</span>
        <strong>
          {n} / {goal}
        </strong>
      </div>
      <div
        className="sb-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, goal)}
        aria-valuenow={n}
      >
        <i style={{ width: `${(n / Math.max(1, goal)) * 100}%` }} />
      </div>
      {note && (
        <p>
          {goal > 0
            ? t.remain(Math.max(0, goal - n))
            : tr("현재 거점과 탑승구를 먼저 확인해 주세요.")}
        </p>
      )}
    </section>
  );
}

/** 코스·경로에서 몇 번째 도장인지에 따른 테마 이름. 코스 밖 체크포인트면 위치 이름. */
function stopName(stops: string[], indices: number[], i: number, lang: StampLang) {
  const k = indices.indexOf(i);
  return k >= 0 ? stops[Math.min(k, stops.length - 1)] : checkpointPlace(CHECKPOINTS[i], lang);
}


/** 첫 도장 뒤 수첩 홈에 보이는 탑승 정보: 탑승구와 탑승 시각(몇 분 남았는지). */
function TripInfo({ gate, boardingAt, now, lang }: { gate: string; boardingAt?: string; now: number; lang: StampLang }) {
  const tr = stampCopy(lang);
  const at = boardingAt ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(boardingAt) ? boardingAt + "+09:00" : boardingAt).getTime() : NaN;
  const left = Math.round((at - now) / 60000);
  const time = Number.isFinite(at)
    ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(at)
    : "";
  return (
    <dl className="sb-trip">
      <div>
        <dt>{tr("탑승구")}</dt>
        <dd>{gate}{lang === "ko" ? "번" : ""}</dd>
      </div>
      <div>
        <dt>{tr("탑승 시각")}</dt>
        <dd>
          {time ? (
            <>
              {time}
              <small>{left > 0 ? lang === "en"
                ? `${left >= 60 ? `${Math.floor(left / 60)}h ` : ""}${left % 60}min left`
                : `${left >= 60 ? `${Math.floor(left / 60)}시간 ` : ""}${left % 60}분 남았어요`
                : tr("탑승 시각이에요")}</small>
            </>
          ) : (
            <small>{tr("입력하지 않았어요")}</small>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** 놀이형: 구역 곳곳에 흩어진 6곳 코스. 순서 없이 찍어도 되고, 마지막 도장은 탑승구 근처다. */
function PlayList({ s, lang }: { s: BookState; lang: StampLang }) {
  const plan = stampEligibility(s);
  if (plan.reason) return null;
  return (
    <>
      {/* 긴 설명 문단 대신 한 줄. 다음 도장 자리는 위 도장판에서 나랑이가 말한다. */}
      <p className="sb-hint">
        {lang === "en"
          ? `Any order is fine · the last stop is near Gate ${s.gate}`
          : `순서는 자유 · 마지막 도장은 ${s.gate}번 탑승구 근처`}
      </p>
      <Stops lang={lang} s={s} indices={plan.indices} gate={s.gate} />
    </>
  );
}

/** 경로형: 지금 있는 곳에서 탑승구까지 가는 길 위 체크포인트를 차례로. */
function RouteMap({ s, lang }: { s: BookState; lang: StampLang }) {
  const tr = stampCopy(lang);
  const plan = stampEligibility(s);
  if (plan.reason) return null;
  return (
    <section aria-label={tr("탑승구 방향 거점")}>
      <p className="sb-hint">{lang === "en" ? `Visit these stops from top to bottom. The last is near Gate ${s.gate}.` : `위에서부터 차례로 들르면 마지막 체크포인트가 ${s.gate}번 탑승구 바로 근처예요.`}</p>
      <Stops lang={lang} s={s} indices={plan.indices} gate={s.gate} />
    </section>
  );
}

function Stops({ s, indices, gate, lang }: { s: BookState; indices: number[]; gate?: string; lang: StampLang }) {
  const tr = stampCopy(lang);
  const theme = s.theme!;
  const t = themeFor(theme, lang);
  const next = indices.find((i) => !(i in s.stamps));
  return (
    <>
      <ol className="sb-list">
        {indices.map((i, k) => {
          const c = CHECKPOINTS[i];
          const done = i in s.stamps;
          return (
            <li key={c.code} className={done ? "done" : i === next ? "next" : ""}>
              <span className="sb-node">
                {done ? <StampMark theme={theme} size={48} /> : i === next ? <QrCode aria-hidden="true" /> : <Lock aria-hidden="true" />}
              </span>
              <span className="sb-stop">
                <strong>
                  {k + 1}. {t.stops[Math.min(k, t.stops.length - 1)]}
                </strong>
                <small>
                  {/* 찍은 칸은 도장 그림이 말해 준다. 「획득 완료」 글을 되풀이하지 않는다 */}
                  {c.code} · {checkpointPlace(c, lang)}
                  {gate && k === indices.length - 1 ? tr(` · ${gate}번 탑승구 근처`) : ""}
                  {c.train ? tr(" · 셔틀트레인") : ""}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sb-hint">{tr("탑승구 위치: 인천국제공항 공식 지도")}</p>
    </>
  );
}

function CertCard({
  lang,
  theme,
  s,
  badge,
}: {
  lang: StampLang;
  theme: ThemeId;
  s: BookState;
  badge: string;
}) {
  const tr = stampCopy(lang);
  const t = themeFor(theme, lang);
  const date = new Date(s.certAt || Date.now()).toLocaleDateString(lang === "en" ? "en-GB" : "ko-KR");
  return (
    <section className="sb-cert" aria-label={tr("인증 ID")}>
      <span className="sb-cert-mark">
        <Emblem theme={theme} size={52} />
      </span>
      <span>
        <small className="sb-cert-kicker">{t.idKicker}</small>
        <strong>{badge}</strong>
        <small>
          {s.name} · {t.unit} {s.certGoal || GOAL} / {s.certGoal || GOAL} {tr("완료 ·")}{" "}
          {date}
        </small>
        <small className="sb-cert-id num">{s.certId}</small>
      </span>
    </section>
  );
}
