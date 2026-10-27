"use client";

import { BookOpen, Camera, Download, Flag, Lock, Palette, QrCode, RotateCcw, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Scanner } from "../components/Scanner";
import {
  CHECKPOINTS,
  EMPTY,
  GOAL,
  THEME_IDS,
  THEMES,
  checkpointOf,
  countOf,
  makeCertId,
  nextStop,
  type BookState,
  type ThemeId,
} from "@/lib/stamp-book";
import { Emblem, Mongge, Portrait, StampMark } from "./art";
import { PhotoFilter } from "./PhotoFilter";
import "./stamp.css";

type View = "themes" | "cover" | "home" | "scan" | "got" | "done" | "camera";

const KEY = "jsp:stamp-book";

function load(): BookState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
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
  const [typed, setTyped] = useState("");
  const [welcome, setWelcome] = useState("");

  // 처음 열 때 저장된 수첩을 읽는다. QR 주소로 들어왔으면 도장부터 찍는다.
  useEffect(() => {
    let st = load();
    let first: View = !st.theme ? "themes" : !st.name ? "cover" : "home";
    if (scanned) {
      const i = checkpointOf(scanned);
      if (i >= 0) {
        const again = i in st.stamps;
        if (!again) st = { ...st, stamps: { ...st.stamps, [i]: Date.now() } };
        setGot({ i, again });
        if (first === "home") first = "got";
        else setWelcome("도장을 하나 받았어요! 먼저 수첩을 준비해요.");
      }
      // 새로 고쳐도 같은 도장을 다시 찍은 것처럼 보이지 않게 주소를 스탬프북 첫 주소로 바꿔 둔다.
      window.history.replaceState(null, "", "/stamp");
    }
    setS(st);
    setView(first);
  }, [scanned]);

  useEffect(() => {
    if (s) save(s);
  }, [s]);

  if (!s) return <div className="sb" data-theme="pick" />;

  const update = (p: Partial<BookState>) => setS({ ...s, ...p });
  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  if (view === "themes" || !s.theme)
    return (
      <ThemePicker
        current={s.theme}
        note={welcome}
        onPick={(theme) => {
          update({ theme, role: THEMES[theme].roles[0].id });
          go(s.name ? "home" : "cover");
        }}
      />
    );

  const theme = s.theme;
  const t = THEMES[theme];
  const n = countOf(s);
  const role = t.roles.find((r) => r.id === s.role) ?? t.roles[0];

  function award(i: number) {
    const again = i in s!.stamps;
    if (!again) update({ stamps: { ...s!.stamps, [i]: Date.now() } });
    setGot({ i, again });
    setScanErr("");
    setTyped("");
    go("got");
  }

  function onScan(text: string) {
    const i = checkpointOf(text);
    if (i < 0) setScanErr("스탬프북 QR이 아니에요. 체크포인트의 QR을 비춰 주세요.");
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
          {welcome && <p className="sb-welcome" role="status">{welcome}</p>}
          <section className="sb-idcard">
            <div className="sb-photo-slot">
              {s.photo ? <img src={s.photo} alt={`${s.name}의 인증 사진`} /> : <><User aria-hidden="true" /><span>{t.photoSlot}</span></>}
            </div>
            <div className="sb-fields">
              <label>
                {t.nameLabel}
                <input value={s.name} maxLength={12} placeholder="이름을 입력해요" onChange={(e) => update({ name: e.target.value })} />
              </label>
              <label>
                {t.gateLabel}
                <input value={s.gate} maxLength={4} inputMode="numeric" placeholder="게이트 번호 (선택)" className="sb-dashed" onChange={(e) => update({ gate: e.target.value.replace(/\D/g, "") })} />
              </label>
            </div>
          </section>
          {s.certId ? <CertCard theme={theme} s={s} badge={role.badge} /> : <p className="sb-promise">{t.promise}</p>}
          <div className="sb-actions">
            <button
              type="button"
              className="sb-btn sb-btn-cta"
              onClick={() => {
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
                  if (!confirm("모은 도장과 사진을 모두 지우고 처음부터 할까요?")) return;
                  setS(EMPTY);
                  setGot(null);
                  go("themes");
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
            <span className="sb-badge">{t.unit} {n} / {GOAL}</span>
          </header>
          <nav className="sb-tools" aria-label="수첩 메뉴">
            <button type="button" onClick={() => go("cover")}><BookOpen aria-hidden="true" /> 내 수첩</button>
            <button type="button" onClick={() => go("themes")}><Palette aria-hidden="true" /> 테마 바꾸기</button>
          </nav>
          <div className="sb-tabs" role="tablist" aria-label="사용 방식">
            {(["play", "route"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={s.mode === m} onClick={() => update({ mode: m })}>
                {m === "play" ? "놀이형" : "경로형"}
              </button>
            ))}
          </div>
          <Progress theme={theme} n={n} />
          {s.mode === "play" ? <PlayList s={s} /> : <RouteMap s={s} />}
          <div className="sb-actions sb-sticky">
            {n >= GOAL ? (
              <button type="button" className="sb-btn sb-btn-accent" onClick={() => go("done")}>완성 보상 받으러 가기</button>
            ) : (
              <button type="button" className="sb-btn sb-btn-main" onClick={() => go("scan")}><QrCode aria-hidden="true" /> QR 스캔하기</button>
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
              ready: t.scanHint((nextStop(s) >= 0 ? nextStop(s) : 0) + 1),
              read: "읽었어요!",
              none: "카메라를 쓸 수 없어요. 아래에 체크포인트 번호를 눌러 주세요.",
              switchCamera: "카메라 바꾸기",
            }}
          />
          {scanErr && <p className="sb-error" role="alert">{scanErr}</p>}
          <form
            className="sb-typed"
            onSubmit={(e) => {
              e.preventDefault();
              onScan(typed);
            }}
          >
            <label htmlFor="sb-code">QR이 안 찍히면 체크포인트에 적힌 번호(세 글자)를 눌러요</label>
            <div>
              <input id="sb-code" value={typed} maxLength={3} autoCapitalize="characters" autoComplete="off" placeholder="예: K7Q" onChange={(e) => setTyped(e.target.value.toUpperCase())} />
              <button type="submit" className="sb-btn sb-btn-cta" disabled={typed.length < 3}>찍기</button>
            </div>
          </form>
          <button type="button" className="sb-btn sb-btn-line sb-on-dark" onClick={() => go("home")}>수첩으로 돌아가기</button>
        </main>
      )}

      {view === "got" && got && (
        <main className="sb-got">
          <div className="sb-got-top" aria-hidden="true">
            <QrCode />
          </div>
          <section className="sb-sheet">
            <div className="sb-stamp-pop">
              {theme === "friend" ? <Mongge size={170} wink /> : <StampMark theme={theme} size={140} />}
            </div>
            <h1>{got.again ? "이미 받은 도장이에요" : t.got(t.stops[got.i])}</h1>
            <p className="sb-sub-ink">{got.again ? `${t.stops[got.i]} · 다른 체크포인트를 찾아봐요` : t.gotSub(t.stops[got.i], n)}</p>
            {theme === "friend" && <Stars n={n} />}
            <Progress theme={theme} n={n} note />
            <div className="sb-actions">
              <button type="button" className={`sb-btn ${n >= GOAL ? "sb-btn-accent" : "sb-btn-main"}`} onClick={() => go(n >= GOAL ? "done" : "home")}>
                {n >= GOAL ? "완성 보상 받으러 가기" : t.next}
              </button>
            </div>
          </section>
        </main>
      )}

      {view === "done" && (
        <main className="sb-page">
          <header className="sb-head">
            <h1>{n >= GOAL ? t.doneTitle : t.title}</h1>
            <span className="sb-badge sb-badge-accent">{t.unit} {n} / {GOAL}</span>
          </header>
          {n < GOAL ? (
            <p className="sb-promise">{t.remain(GOAL - n)}</p>
          ) : (
            <>
              <figure className="sb-portrait">
                {s.photo ? <img src={s.photo} alt={`${role.filter}로 찍은 인증 사진`} /> : <><Portrait role={role.id} /><figcaption>{role.filter}</figcaption></>}
              </figure>
              {t.roles.length > 1 && !s.certId && (
                <div className="sb-roles" role="radiogroup" aria-label="필터 고르기">
                  {t.roles.map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={role.id === r.id} onClick={() => update({ role: r.id })}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {s.certId && <CertCard theme={theme} s={s} badge={role.badge} />}
              <div className="sb-actions">
                {s.photo && (
                  <a className="sb-btn sb-btn-main" href={s.photo} download={`${s.certId || "stamp"}.jpg`}>
                    <Download aria-hidden="true" /> 사진 저장하기
                  </a>
                )}
                <button type="button" className={`sb-btn ${s.photo ? "sb-btn-line" : "sb-btn-accent"}`} onClick={() => go("camera")}>
                  <Camera aria-hidden="true" /> {s.photo ? "다시 찍기" : t.takePhoto}
                </button>
                {!s.certId && (
                  <button type="button" className="sb-link" onClick={() => update({ certId: makeCertId(theme, new Date()), certAt: Date.now() })}>
                    사진 없이 인증 ID만 받기
                  </button>
                )}
                <button type="button" className="sb-link" onClick={() => go("cover")}>
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
              update({ photo, certId: s.certId || makeCertId(theme, new Date()), certAt: s.certAt || Date.now() });
              go("done");
            }}
          />
        </main>
      )}
    </div>
  );
}

function ThemePicker({ current, note, onPick }: { current: ThemeId | null; note: string; onPick: (t: ThemeId) => void }) {
  return (
    <div className="sb" data-theme="pick">
      <main className="sb-page">
        <h1 className="sb-pick-title">어떤 수첩으로<br />공항을 여행할까요?</h1>
        {note && <p className="sb-welcome" role="status">{note}</p>}
        <p className="sb-pick-sub">나중에 바꿔도 모은 도장은 그대로예요.</p>
        <ul className="sb-pick">
          {THEME_IDS.map((id) => (
            <li key={id}>
              <button type="button" data-theme={id} aria-pressed={current === id} onClick={() => onPick(id)}>
                <span className="sb-pick-art"><Emblem theme={id} size={64} /></span>
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
      </main>
    </div>
  );
}

function Progress({ theme, n, note }: { theme: ThemeId; n: number; note?: boolean }) {
  const t = THEMES[theme];
  const label = theme === "explorer" ? "탐험 진행도" : theme === "friend" ? "도장 진행도" : "비행 진행도";
  return (
    <section className="sb-progress">
      <div>
        <span>{label}</span>
        <strong>{n} / {GOAL}</strong>
      </div>
      <div className="sb-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={GOAL} aria-valuenow={n}>
        <i style={{ width: `${(n / GOAL) * 100}%` }} />
      </div>
      {note && <p>{t.remain(GOAL - n)}</p>}
    </section>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <p className="sb-stars" aria-label={`별 ${n}개`}>
      {CHECKPOINTS.map((_, i) => (
        <span key={i} className={i < n ? "on" : ""} aria-hidden="true">★</span>
      ))}
    </p>
  );
}

/** 놀이형: 순서 없이 공항을 돌며 모은다. 각 체크포인트가 어디 있는지 함께 보여 준다. */
function PlayList({ s }: { s: BookState }) {
  const theme = s.theme!;
  const t = THEMES[theme];
  const next = nextStop(s);
  return (
    <>
      <p className="sb-hint">순서 없이 가까운 곳부터 찍어도 돼요.</p>
      <ol className="sb-list">
        {CHECKPOINTS.map((c, i) => {
          const done = i in s.stamps;
          return (
            <li key={c.code} className={done ? "done" : i === next ? "next" : ""}>
              <span className="sb-node">{done ? <StampMark theme={theme} size={48} /> : i === next ? <QrCode aria-hidden="true" /> : <Lock aria-hidden="true" />}</span>
              <span className="sb-stop">
                <strong>{t.stops[i]}</strong>
                <small>{done ? `${t.unit} 획득 완료` : c.place}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** 경로형: 게이트로 가는 길 위 체크포인트를 차례로 들른다. 지그재그 지도로 그린다. */
function RouteMap({ s }: { s: BookState }) {
  const theme = s.theme!;
  const t = THEMES[theme];
  const next = nextStop(s);
  const gate = s.gate ? `${s.gate}번 게이트` : "탑승 게이트";
  const rows = GOAL + 1;
  // 줄마다 왼쪽(20%)·오른쪽(80%)을 오가며 놓고, 동그라미 가운데(줄 높이의 35%)끼리 곡선으로 잇는다.
  const x = (i: number) => (i % 2 ? 80 : 20);
  const y = (i: number) => (i + 0.35) * 10;
  const path = Array.from({ length: rows - 1 }, (_, i) => {
    const my = (y(i) + y(i + 1)) / 2;
    return `M${x(i)} ${y(i)}C${x(i)} ${my} ${x(i + 1)} ${my} ${x(i + 1)} ${y(i + 1)}`;
  }).join("");
  return (
    <>
      <p className="sb-hint">{next >= 0 ? `다음은 「${t.stops[next]}」 · ${CHECKPOINTS[next].place}` : `${gate}로 가요!`}</p>
      <div className="sb-route">
        <svg viewBox={`0 0 100 ${rows * 10}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        <ol>
          {CHECKPOINTS.map((c, i) => {
            const done = i in s.stamps;
            return (
              <li key={c.code} className={`${i % 2 ? "right" : "left"} ${done ? "done" : i === next ? "next" : ""}`}>
                <span className="sb-node">{done ? <StampMark theme={theme} size={52} /> : i === next ? <QrCode aria-hidden="true" /> : <Lock aria-hidden="true" />}</span>
                <span className="sb-stop">
                  <strong>{t.stops[i]}</strong>
                  {i === next && <small>여기서 QR을 스캔해요</small>}
                </span>
              </li>
            );
          })}
          <li className={`sb-gate ${GOAL % 2 ? "right" : "left"}`}>
            <span className="sb-node"><Flag aria-hidden="true" /></span>
            <span className="sb-stop"><strong>{gate}</strong></span>
          </li>
        </ol>
      </div>
    </>
  );
}

function CertCard({ theme, s, badge }: { theme: ThemeId; s: BookState; badge: string }) {
  const t = THEMES[theme];
  const date = new Date(s.certAt || Date.now()).toLocaleDateString("ko-KR");
  return (
    <section className="sb-cert" aria-label="인증 ID">
      <span className="sb-cert-mark"><Emblem theme={theme} size={52} /></span>
      <span>
        <small className="sb-cert-kicker">{t.idKicker}</small>
        <strong>{badge}</strong>
        <small>{s.name} · {t.unit} {GOAL} / {GOAL} 완료 · {date}</small>
        <small className="sb-cert-id num">{s.certId}</small>
      </span>
    </section>
  );
}
