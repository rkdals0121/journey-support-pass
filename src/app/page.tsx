import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1>Journey Support Pass</h1>
      <p className="lead">필요한 도움을 한 번 등록하면, 공항 직원이 다시 묻지 않고 안내합니다.</p>
      <Link className="btn btn-primary" href="/register">
        지원 등록하기
      </Link>
      <Link className="btn" href="/staff">
        직원 화면
      </Link>
    </main>
  );
}
