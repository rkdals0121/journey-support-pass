"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/Sunflower";

// 화면을 그리다 문제가 생겼을 때.
// 여객이 어느 말로 쓰던 화면인지 여기서는 알 수 없으므로, 영어 패스 화면에서 나도 읽을 수 있게 한국어와 영어를 함께 적는다.
export default function ErrorPage() {
  return (
    <main className="page">
      <Brand />
      <div className="empty">
        <span className="bubble bubble-sun">
          <CircleAlert size={26} aria-hidden="true" />
        </span>
        <strong>화면을 불러오지 못했습니다</strong>
        <p lang="en" className="muted">
          This screen could not be loaded.
        </p>
        <p>잠시 후 다시 시도해 주세요. 급하시면 가까운 안내데스크나 직원에게 말씀해 주세요.</p>
        <p lang="en" className="muted">
          Please try again in a moment. If it is urgent, please speak to the nearest information desk or staff member.
        </p>
      </div>
      {/* Next 가 넘겨 주는 reset() 은 이 화면만 지우고 서버가 보낸 내용(오류가 든 그대로)을 다시 그린다.
          DB 가 잠깐 끊겨 서버에서 난 오류라면 같은 오류 화면이 바로 다시 나와 단추가 먹지 않는 것처럼 보인다.
          화면을 통째로 다시 불러 서버에 새로 묻는다. 패스 화면이면 주소가 그대로라 여객의 패스가 다시 열린다.
          단추 글자는 한 덩이로 묶는다. 단추가 flex 라 묶지 않으면 한국어와 영어가 따로 떨어져 좁은 화면에서 어긋나게 줄바꿈된다. */}
      <button className="btn btn-primary" onClick={() => window.location.reload()}>
        <span>
          다시 시도 · <span lang="en">Try again</span>
        </span>
      </button>
      <Link className="btn" href="/">
        <span>
          첫 화면으로 · <span lang="en">Home</span>
        </span>
      </Link>
    </main>
  );
}
