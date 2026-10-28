"use client";

import {
  BookOpen,
  Camera,
  Download,
  Lock,
  Palette,
  QrCode,
  RotateCcw,
  Shuffle,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Scanner } from "../components/Scanner";
import {
  AREA_LABEL,
  CHECKPOINTS,
  EMPTY,
  GOAL,
  THEME_IDS,
  THEMES,
  checkpointOf,
  makeCertId,
  type BookState,
  type ThemeId,
} from "@/lib/stamp-book";
import { EXITS, courseFits, gateProblem, makeCourse, stampEligibility } from "@/lib/stamp-routing";
import { Emblem, Haneul, Portrait, StampMark } from "./art";
import { PhotoFilter } from "./PhotoFilter";
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
export function StampBook({ scanned }: { scanned?: string }) {
  const [s, setS] = useState<BookState | null>(null);
  const [view, setView] = useState<View>("themes");
  const [got, setGot] = useState<{ i: number; again: boolean } | null>(null);
  const [scanErr, setScanErr] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [typed, setTyped] = useState("");
  const [welcome, setWelcome] = useState("");
  const [clock, setClock] = useState(0);

  // 처음 열 때 저장된 수첩을 읽는다. QR 주소로 들어왔으면 도장부터 찍는다.
  useEffect(() => {
    let st = load();
    let first: View = !st.theme ? "themes" : !st.name ? "cover" : "home";
    if (scanned) {
      const i = checkpointOf(scanned);
      const eligible = stampEligibility(st);
      if (i >= 0 && eligible.indices.includes(i)) {
        const again = i in st.stamps;
        if (!again) st = { ...st, stamps: { ...st.stamps, [i]: Date.now() } };
        setGot({ i, again });
        if (first === "home") first = "got";
        else setWelcome("도장을 하나 받았어요! 먼저 수첩을 준비해요.");
      } else {
        const message =
          eligible.reason ||
          "이 체크포인트는 지금 코스·경로에 없어요. 수첩 목록에 있는 체크포인트를 찾아봐요.";
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
        "/stamp",
      );
      if (first !== "themes")
        window.history.pushState({ ...window.history.state, sb: first }, "");
    }
    setS(st);
    setView(first);
  }, [scanned]);

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
        current={s.theme}
        note={welcome}
        mine={
          s.theme && s.name
            ? `${THEMES[s.theme].title} · ${THEMES[s.theme].unit} ${stampEligibility(s).indices.filter((i) => i in s.stamps).length}개`
            : ""
        }
        onOpen={() => go("cover")}
        onPick={(theme) => {
          update({ theme, role: THEMES[theme].roles[0].id });
          go(s.name ? "home" : "cover");
        }}
      />
    );

  const theme = s.theme;
  const t = THEMES[theme];
  const itinerary = stampEligibility(s, clock || Date.now());
  const goal = itinerary.indices.length;
  const n = itinerary.indices.filter((i) => i in s.stamps).length;
  const complete = goal > 0 && n >= goal;
  const role = t.roles.find((r) => r.id === s.role) ?? t.roles[0];

  function award(i: number) {
    const again = i in s!.stamps;
    if (!again) update({ stamps: { ...s!.stamps, [i]: Date.now() } });
    setGot({ i, again });
    setScanErr("");
    setTyped("");
    go("got", true);
  }

  function onScan(text: string) {
    const i = checkpointOf(text);
    if (i < 0)
      setScanErr("스탬프북 QR이 아니에요. 체크포인트의 QR을 비춰 주세요.");
    else if (!stampEligibility(s!, Date.now()).indices.includes(i))
      setScanErr(
        itinerary.reason || "이 체크포인트는 지금 코스·경로에 없어요. 수첩 목록에 있는 체크포인트를 찾아봐요.",
      );
    else award(i);
  }

  return (
    <div className="sb" data-theme={theme}>
      {view === "cover" && (
        <main className="sb-cover">
          <p className="sb-kicker">{t.kicker}</p>
          <Emblem theme={theme} />
          <h1 className="sb-title">{t.title}</h1>
          <p className="sb-sub">{t.subtitle}</p>
          {welcome && (
            <p className="sb-welcome" role="status">
              {welcome}
            </p>
          )}
          <section className="sb-idcard">
            <div className="sb-photo-slot">
              {s.photo ? (
                <img src={s.photo} alt={`${s.name}의 인증 사진`} />
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
                  placeholder="이름을 입력해요"
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                {t.gateLabel}
                <input
                  value={s.gate}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="탑승구 번호 (필수)"
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
                  {gateErr}
                </p>
              )}
            </div>
          </section>
          {s.certId ? (
            <CertCard theme={theme} s={s} badge={role.badge} />
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
                if (!s.name.trim()) update({ name: "꼬마 여행자" });
                const fromQr = !!welcome && !!got;
                setWelcome("");
                go(fromQr ? "got" : "home");
              }}
            >
              {n > 0 ? "수첩 이어 보기" : t.start}
            </button>
            {s.name && (
              <button
                type="button"
                className="sb-link"
                onClick={() => {
                  if (
                    !confirm("모은 도장과 사진을 모두 지우고 처음부터 할까요?")
                  )
                    return;
                  setS(EMPTY);
                  setGot(null);
                  go("themes", true);
                }}
              >
                <RotateCcw aria-hidden="true" /> 처음부터 다시 하기
              </button>
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
          <nav className="sb-tools" aria-label="수첩 메뉴">
            <button type="button" onClick={() => go("cover")}>
              <BookOpen aria-hidden="true" /> 내 수첩
            </button>
            <button type="button" onClick={() => go("themes")}>
              <Palette aria-hidden="true" /> 테마 바꾸기
            </button>
          </nav>
          <div className="sb-tabs" role="tablist" aria-label="사용 방식">
            {(["play", "route"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={s.mode === m}
                onClick={() => update({ mode: m })}
              >
                {m === "play" ? "놀이형" : "경로형"}
              </button>
            ))}
          </div>
          {scanErr && (
            <p className="sb-error" role="alert">
              {scanErr}
            </p>
          )}
          <Progress theme={theme} n={n} goal={goal} />
          {
            <section className="sb-fields" aria-label="경로 설정">
              <label>
                탑승구 번호
                <input
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
                <label>
                  지금 있는 곳 · 출국심사를 마친 뒤
                  <select
                    value={s.startHub || ""}
                    onChange={(e) => update({ startHub: e.target.value, course: [] })}
                  >
                    <option value="" disabled>
                      지금 있는 곳 고르기
                    </option>
                    <optgroup label="출국심사를 막 마쳤어요">
                      {EXITS.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </optgroup>
                    {(["T1", "CONCOURSE", "T2"] as const).map((a) => (
                      <optgroup key={a} label={`이 체크포인트 근처예요 · ${AREA_LABEL[a]}`}>
                        {CHECKPOINTS.filter((c) => c.area === a).map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} · {c.place}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              <label>
                탑승 시각 · 한국시간 · 선택
                <input
                  type="datetime-local"
                  value={s.boardingAt || ""}
                  onChange={(e) => update({ boardingAt: e.target.value })}
                />
              </label>
              {itinerary.reason ? (
                <p role="status">{itinerary.reason}</p>
              ) : (
                <p>
                  {s.mode === "play" ? "코스 6곳을 도는 데" : "도장을 모으며 탑승구까지"} 약{" "}
                  {itinerary.minutes}분 · 걸음이 느린 가족 기준 추정이에요.
                  {s.mode === "route" && " 탑승 전 여유 15분은 따로 두세요."}
                  {s.mode === "play" && " 너무 길다 싶으면 다른 코스로 바꿔 보세요."}
                </p>
              )}
              {s.mode === "play" && !gateProblem(s.gate) && (
                <button
                  type="button"
                  className="sb-link"
                  onClick={() => update({ course: makeCourse(s.gate) })}
                >
                  <Shuffle aria-hidden="true" /> 다른 코스로 바꾸기
                </button>
              )}
            </section>
          }
          {s.mode === "play" ? <PlayList s={s} /> : <RouteMap s={s} />}
          <div className="sb-actions sb-sticky">
            {complete ? (
              <button
                type="button"
                className="sb-btn sb-btn-accent"
                onClick={() => go("done")}
              >
                완성 보상 받으러 가기
              </button>
            ) : (
              <button
                type="button"
                className="sb-btn sb-btn-main"
                disabled={!!itinerary.reason}
                onClick={() => go("scan")}
              >
                <QrCode aria-hidden="true" /> QR 스캔하기
              </button>
            )}
          </div>
        </main>
      )}

      {view === "scan" && (
        <main className="sb-scan">
          <h1 className="sr-only">QR 스캔</h1>
          <Scanner
            onScan={onScan}
            imageLabel="QR 사진으로 찍기"
            text={{
              starting: "카메라를 켜는 중이에요…",
              ready: "현재 구역의 체크포인트 QR을 비춰 주세요",
              read: "읽었어요!",
              none: "카메라를 쓸 수 없어요. 아래에 체크포인트 번호를 눌러 주세요.",
              switchCamera: "카메라 바꾸기",
            }}
          />
          {scanErr && (
            <p className="sb-error" role="alert">
              {scanErr}
            </p>
          )}
          <form
            className="sb-typed"
            onSubmit={(e) => {
              e.preventDefault();
              onScan(typed);
            }}
          >
            <label htmlFor="sb-code">
              QR이 안 찍히면 체크포인트에 적힌 번호(세 글자)를 눌러요
            </label>
            <div>
              <input
                id="sb-code"
                value={typed}
                maxLength={3}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="예: A07"
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
              />
              <button
                type="submit"
                className="sb-btn sb-btn-cta"
                disabled={typed.length < 3}
              >
                찍기
              </button>
            </div>
          </form>
          <button
            type="button"
            className="sb-btn sb-btn-line sb-on-dark"
            onClick={() => go("home")}
          >
            수첩으로 돌아가기
          </button>
        </main>
      )}

      {view === "got" && got && (
        <main className="sb-got">
          <div className="sb-got-top" aria-hidden="true">
            <QrCode />
          </div>
          <section className="sb-sheet">
            <div className="sb-stamp-pop">
              {theme === "friend" ? (
                <Haneul size={170} mood="joy" hands />
              ) : (
                <StampMark theme={theme} size={140} />
              )}
            </div>
            <h1>
              {got.again ? "이미 받은 도장이에요" : t.got(stopName(t.stops, itinerary.indices, got.i))}
            </h1>
            <p className="sb-sub-ink">
              {got.again
                ? `${CHECKPOINTS[got.i].place} · 다른 체크포인트를 찾아봐요`
                : t.gotSub(stopName(t.stops, itinerary.indices, got.i), n)}
            </p>
            <p className="sb-hint">
              {CHECKPOINTS[got.i].code} · {CHECKPOINTS[got.i].place}
            </p>
            {theme === "friend" && <Stars n={n} goal={goal} />}
            <Progress theme={theme} n={n} goal={goal} note />
            <div className="sb-actions">
              <button
                type="button"
                className={`sb-btn ${complete ? "sb-btn-accent" : "sb-btn-main"}`}
                onClick={() => go(complete ? "done" : "home")}
              >
                {complete ? "완성 보상 받으러 가기" : t.next}
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
                : "현재 거점과 탑승구를 먼저 확인해 주세요."}
            </p>
          ) : (
            <>
              <figure className="sb-portrait">
                {s.photo ? (
                  <img src={s.photo} alt={`${role.filter}로 찍은 인증 사진`} />
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
                  aria-label="필터 고르기"
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
              {s.certId && <CertCard theme={theme} s={s} badge={role.badge} />}
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
                    <Download aria-hidden="true" /> 사진 저장하기
                  </a>
                )}
                <button
                  type="button"
                  className={`sb-btn ${s.photo ? "sb-btn-line" : "sb-btn-accent"}`}
                  onClick={() => go("camera")}
                >
                  <Camera aria-hidden="true" />{" "}
                  {s.photo ? "다시 찍기" : t.takePhoto}
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
                    사진 없이 인증 ID만 받기
                  </button>
                )}
                <button
                  type="button"
                  className="sb-link"
                  onClick={() => go("cover")}
                >
                  <BookOpen aria-hidden="true" /> 내 수첩 보기
                </button>
              </div>
            </>
          )}
        </main>
      )}

      {view === "camera" && (
        <main className="sb-page sb-dark">
          <h1 className="sb-camera-title">{role.filter}</h1>
          <PhotoFilter
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
  current,
  note,
  mine,
  onPick,
  onOpen,
}: {
  current: ThemeId | null;
  note: string;
  mine: string;
  onPick: (t: ThemeId) => void;
  onOpen: () => void;
}) {
  return (
    <div className="sb" data-theme="pick">
      <main className="sb-page">
        <h1 className="sb-pick-title">
          어떤 수첩으로
          <br />
          공항을 여행할까요?
        </h1>
        {note && (
          <p className="sb-welcome" role="status">
            {note}
          </p>
        )}
        <p className="sb-pick-sub">나중에 바꿔도 모은 도장은 그대로예요.</p>
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
                  <strong>{THEMES[id].title}</strong>
                  <span>{THEMES[id].subtitle}</span>
                  <span className="sb-pick-stamps" aria-hidden="true">
                    <StampMark theme={id} size={26} />
                    <StampMark theme={id} size={26} />
                    <StampMark theme={id} size={26} />
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
            <BookOpen aria-hidden="true" /> 내 수첩 열어 보기{" "}
            <small>({mine})</small>
          </button>
        )}
      </main>
    </div>
  );
}

function Progress({
  theme,
  n,
  note,
  goal = GOAL,
}: {
  theme: ThemeId;
  n: number;
  note?: boolean;
  goal?: number;
}) {
  const t = THEMES[theme];
  const label =
    theme === "explorer"
      ? "탐험 진행도"
      : theme === "friend"
        ? "도장 진행도"
        : "비행 진행도";
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
            : "현재 거점과 탑승구를 먼저 확인해 주세요."}
        </p>
      )}
    </section>
  );
}

/** 코스·경로에서 몇 번째 도장인지에 따른 테마 이름. 코스 밖 체크포인트면 위치 이름. */
function stopName(stops: string[], indices: number[], i: number) {
  const k = indices.indexOf(i);
  return k >= 0 ? stops[Math.min(k, stops.length - 1)] : CHECKPOINTS[i].place;
}

function Stars({ n, goal }: { n: number; goal: number }) {
  return (
    <p className="sb-stars" aria-label={`별 ${n}개`}>
      {Array.from({ length: goal }, (_, i) => (
        <span key={i} className={i < n ? "on" : ""} aria-hidden="true">
          ★
        </span>
      ))}
    </p>
  );
}

/** 놀이형: 구역 곳곳에 흩어진 6곳 코스. 순서 없이 찍어도 되고, 마지막 도장은 탑승구 근처다. */
function PlayList({ s }: { s: BookState }) {
  const plan = stampEligibility(s);
  if (plan.reason) return null;
  return (
    <>
      <p className="sb-hint">
        {AREA_LABEL[CHECKPOINTS[plan.indices[0]].area]} 곳곳에 숨은 도장을 찾아 돌아다니는 탐험 코스예요.
        순서 없이 찍어도 되고, 마지막 도장은 {s.gate}번 탑승구 근처라 다 모으면 바로 탑승하러 가면 돼요.
      </p>
      <Stops s={s} indices={plan.indices} gate={s.gate} />
    </>
  );
}

/** 경로형: 지금 있는 곳에서 탑승구까지 가는 길 위 체크포인트를 차례로. */
function RouteMap({ s }: { s: BookState }) {
  const plan = stampEligibility(s);
  if (plan.reason) return null;
  return (
    <section aria-label="탑승구 방향 거점">
      <p className="sb-hint">위에서부터 차례로 들르면 마지막 체크포인트가 {s.gate}번 탑승구 바로 근처예요.</p>
      <Stops s={s} indices={plan.indices} gate={s.gate} />
    </section>
  );
}

function Stops({ s, indices, gate }: { s: BookState; indices: number[]; gate?: string }) {
  const theme = s.theme!;
  const t = THEMES[theme];
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
                  {done ? `${t.unit} 획득 완료 · ` : ""}
                  {c.code} · {c.place}
                  {gate && k === indices.length - 1 ? ` · ${gate}번 탑승구 근처` : ""}
                  {c.train ? " · 셔틀트레인" : ""}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sb-hint">탑승구 위치 © OpenStreetMap contributors</p>
    </>
  );
}

function CertCard({
  theme,
  s,
  badge,
}: {
  theme: ThemeId;
  s: BookState;
  badge: string;
}) {
  const t = THEMES[theme];
  const date = new Date(s.certAt || Date.now()).toLocaleDateString("ko-KR");
  return (
    <section className="sb-cert" aria-label="인증 ID">
      <span className="sb-cert-mark">
        <Emblem theme={theme} size={52} />
      </span>
      <span>
        <small className="sb-cert-kicker">{t.idKicker}</small>
        <strong>{badge}</strong>
        <small>
          {s.name} · {t.unit} {s.certGoal || GOAL} / {s.certGoal || GOAL} 완료 ·{" "}
          {date}
        </small>
        <small className="sb-cert-id num">{s.certId}</small>
      </span>
    </section>
  );
}
