const PETALS = 12;

/** 해바라기 표식에서 가져온 표. 장식이므로 화면 읽기 프로그램에는 감춘다. */
export function Sunflower() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {Array.from({ length: PETALS }, (_, i) => (
        <ellipse key={i} cx="24" cy="9" rx="4.2" ry="8" fill="#f6c445" transform={`rotate(${(360 / PETALS) * i} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="8.5" fill="#1f6b4a" />
    </svg>
  );
}

/** 여객 화면 위쪽의 이름표. */
export function Brand() {
  return (
    <div className="brand">
      <Sunflower />
      Journey Support Pass
    </div>
  );
}
