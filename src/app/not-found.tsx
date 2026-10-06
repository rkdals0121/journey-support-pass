import { Compass } from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/Sunflower";

export default function NotFound() {
  return (
    <main className="page">
      <Brand />
      <div className="empty">
        <span className="bubble">
          <Compass size={26} aria-hidden="true" />
        </span>
        <strong>찾는 화면이 없습니다</strong>
        <p>주소가 바뀌었거나 잘못 들어온 것 같습니다.</p>
      </div>
      <Link className="btn btn-primary" href="/">
        첫 화면으로
      </Link>
    </main>
  );
}
