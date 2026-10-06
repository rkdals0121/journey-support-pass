import Link from "next/link";
import { Sunflower } from "./components/Sunflower";

export default function Home() {
  return (
    <main className="page">
      <div className="home-hero">
        <Sunflower />
        <h1>
          한 번만 알려 주세요.
          <br />
          공항 직원이 다시 묻지 않습니다.
        </h1>
        <p>필요한 도움을 미리 등록하면, 인천공항 직원이 패스를 보고 먼저 다가와 안내합니다.</p>
      </div>

      <ol className="home-steps">
        <li>
          <b>1</b>
          <span>필요한 도움과 항공편을 등록합니다. 2분쯤 걸립니다.</span>
        </li>
        <li>
          <b>2</b>
          <span>안내데스크에서 접수 번호를 보여 주고 패스를 받습니다.</span>
        </li>
        <li>
          <b>3</b>
          <span>패스를 여권에 끼워 두면 직원이 알아보고 도와드립니다.</span>
        </li>
      </ol>

      <Link className="btn btn-primary" href="/register">
        지원 등록하기
      </Link>
      <Link className="home-staff" href="/staff">
        공항 직원이신가요? 직원 화면으로
      </Link>
    </main>
  );
}
