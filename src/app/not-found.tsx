import { Compass } from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/Sunflower";

// 어느 말로 쓰던 여객인지 알 수 없으므로 한국어와 영어를 함께 적는다.
export default function NotFound() {
  return (
    <main className="page">
      <Brand />
      <div className="empty">
        <span className="bubble">
          <Compass size={26} aria-hidden="true" />
        </span>
        <strong>찾는 화면이 없습니다</strong>
        <p lang="en" className="muted">
          This page could not be found.
        </p>
        <p>주소가 바뀌었거나 잘못 들어온 것 같습니다.</p>
        <p lang="en" className="muted">
          The address may have changed or may be incorrect.
        </p>
      </div>
      <Link className="btn btn-primary" href="/">
        <span>
          첫 화면으로 · <span lang="en">Home</span>
        </span>
      </Link>
    </main>
  );
}
