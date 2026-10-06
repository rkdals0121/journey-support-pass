const PETALS = 12;

/** 해바라기 표식에서 가져온 표. 장식이므로 화면 읽기 프로그램에는 감춘다. */
export function Sunflower() {
  return (
    <svg className="sunflower" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {Array.from({ length: PETALS }, (_, i) => (
        <ellipse key={i} cx="24" cy="9" rx="4.2" ry="8" fill="#f7c63f" transform={`rotate(${(360 / PETALS) * i} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="8.5" fill="#1c6b49" />
    </svg>
  );
}

/** 화면 위쪽의 이름표. */
export function Brand() {
  return (
    <div className="brand">
      <Sunflower />
      Journey Support Pass
    </div>
  );
}

// 그림으로만 쓰는 QR 모양. 실제로 읽히지 않는다.
const QR_ART = [
  "1111111001011",
  "1000001011001",
  "1011101001101",
  "1011101010011",
  "1011101011101",
  "1000001001001",
  "1111111010101",
  "0000000011010",
  "1101011100111",
  "0110100111001",
  "1011011010110",
  "0101101101011",
  "1110010110101",
];

/** 첫 화면에 놓는 패스 그림. 목걸이에 달린 카드에 해바라기, QR, 패스 번호가 있다. */
export function PassArt() {
  return (
    <div className="pass-art" aria-hidden="true">
      <div className="pass-art-strap" />
      <div className="pass-art-card">
        <svg className="qr" viewBox="0 0 13 13" shapeRendering="crispEdges">
          <rect width="13" height="13" fill="#fff" />
          {QR_ART.flatMap((row, y) =>
            [...row].map((c, x) =>
              c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0f231b" /> : null,
            ),
          )}
        </svg>
        <div className="pass-art-meta">
          <Sunflower />
          <small>PASS NO.</small>
          <b>0427</b>
        </div>
      </div>
    </div>
  );
}
