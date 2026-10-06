import { ArrowRight, ChevronRight, ClipboardList, PhoneOff, ScanLine, ShieldCheck, Ticket, Trash2 } from "lucide-react";
import Link from "next/link";
import { Brand, PassArt } from "./components/Sunflower";

export default function Home() {
  return (
    <main className="page has-cta">
      <div className="hero">
        <Brand />
        <h1>
          한 번만 알려 주세요.
          <br />
          <em>다시 묻지 않습니다.</em>
        </h1>
        <p>필요한 도움을 미리 등록하면, 인천공항 직원이 패스를 보고 먼저 다가와 안내합니다.</p>
      </div>
      <PassArt />

      <ol className="steps-list">
        <li>
          <span className="bubble">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>1. 필요한 도움을 등록합니다</strong>
            <span>항공편과 필요한 도움을 고릅니다. 2분쯤 걸립니다.</span>
          </div>
        </li>
        <li>
          <span className="bubble">
            <Ticket size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>2. 안내데스크에서 패스를 받습니다</strong>
            <span>접수 번호 네 자리를 보여 주시면 됩니다.</span>
          </div>
        </li>
        <li>
          <span className="bubble bubble-sun">
            <ScanLine size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>3. 직원이 알아보고 도와드립니다</strong>
            <span>패스를 목에 걸거나 여권에 끼워 두세요. 같은 설명을 반복하지 않아도 됩니다.</span>
          </div>
        </li>
      </ol>

      <div className="trust">
        <span className="chip">
          <PhoneOff size={15} aria-hidden="true" />
          연락처·진단명은 받지 않아요
        </span>
        <span className="chip">
          <Trash2 size={15} aria-hidden="true" />
          출발 후 삭제
        </span>
        <span className="chip">
          <ShieldCheck size={15} aria-hidden="true" />
          공항 직원만 열람
        </span>
      </div>

      <Link className="home-staff" href="/staff">
        공항 직원이신가요? 직원 화면으로
        <ChevronRight size={16} aria-hidden="true" />
      </Link>

      <div className="cta-bar">
        <div className="cta-inner">
          <Link className="btn btn-primary" href="/register">
            지원 등록하기
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
