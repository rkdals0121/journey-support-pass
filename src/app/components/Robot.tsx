// 공항 도우미 로봇(키오스크의 얼굴). 탑승권을 찍기 전에는 자고, 찍으면 깨어난다.
// 그림일 뿐이므로 화면 읽기 프로그램에는 감춘다(말풍선 글이 같은 내용을 전한다).

export function Robot({ mood, size = 220 }: { mood: "sleep" | "awake" | "happy"; size?: number }) {
  const awake = mood !== "sleep";
  return (
    <svg className={`robot robot-${mood}`} width={size} height={size} viewBox="0 0 220 220" aria-hidden="true">
      {/* 몸 */}
      <ellipse cx="110" cy="196" rx="62" ry="14" fill="rgba(0,0,0,.12)" />
      <rect x="62" y="140" width="96" height="58" rx="28" fill="#f1f8f4" stroke="#b8d4c3" strokeWidth="3" />
      <rect x="96" y="156" width="28" height="12" rx="6" fill="#1c6b49" opacity=".85" />
      {/* 머리 */}
      <rect x="34" y="34" width="152" height="118" rx="54" fill="#ffffff" stroke="#b8d4c3" strokeWidth="3" />
      {/* 헤드폰 */}
      <rect x="18" y="72" width="26" height="46" rx="12" fill="#1c6b49" />
      <rect x="176" y="72" width="26" height="46" rx="12" fill="#1c6b49" />
      <path d="M44 66 Q110 6 176 66" fill="none" stroke="#1c6b49" strokeWidth="8" strokeLinecap="round" />
      {/* 얼굴 판 */}
      <rect x="54" y="58" width="112" height="74" rx="34" fill={awake ? "#0f231b" : "#1a3a2c"} />
      {awake ? (
        <>
          <ellipse cx="88" cy="94" rx="11" ry={mood === "happy" ? 6 : 13} fill="#b9edcf" />
          <ellipse cx="132" cy="94" rx="11" ry={mood === "happy" ? 6 : 13} fill="#b9edcf" />
          <path d="M96 114 Q110 124 124 114" fill="none" stroke="#b9edcf" strokeWidth="5" strokeLinecap="round" />
          <circle cx="70" cy="110" r="6" fill="#ff9fb7" opacity=".7" />
          <circle cx="150" cy="110" r="6" fill="#ff9fb7" opacity=".7" />
        </>
      ) : (
        <>
          <path d="M77 96 Q88 104 99 96" fill="none" stroke="#b9edcf" strokeWidth="5" strokeLinecap="round" />
          <path d="M121 96 Q132 104 143 96" fill="none" stroke="#b9edcf" strokeWidth="5" strokeLinecap="round" />
          <path d="M103 116 Q110 119 117 116" fill="none" stroke="#b9edcf" strokeWidth="4" strokeLinecap="round" />
          <text x="164" y="44" className="robot-z" fill="#ffffff" fontSize="22" fontWeight="700">
            z
          </text>
          <text x="182" y="26" className="robot-z robot-z2" fill="#ffffff" fontSize="16" fontWeight="700">
            z
          </text>
        </>
      )}
      {mood === "happy" && (
        <>
          <path d="M20 40 l10 6" stroke="#ffd34d" strokeWidth="5" strokeLinecap="round" />
          <path d="M200 40 l-10 6" stroke="#ffd34d" strokeWidth="5" strokeLinecap="round" />
          <path d="M110 4 v12" stroke="#ffd34d" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
