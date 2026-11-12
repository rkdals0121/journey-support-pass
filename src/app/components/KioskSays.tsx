import Image from "next/image";

/**
 * 키오스크 번호 입력 화면(고유 일련 번호·항공 예약번호·만남 예약 확인번호)의 안내.
 * 나랑이(정면)가 말풍선으로 제목과 설명을 말한다. 첫 화면·여권 화면처럼 나랑이와 함께 진행하는 느낌을 잇는다.
 */
export function KioskSays({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="kx-says">
      <Image className="kx-says-face" src="/images/haneuli/narangi.webp" alt="" width={320} height={320} priority />
      <div className="kx-says-bubble">
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
    </div>
  );
}
