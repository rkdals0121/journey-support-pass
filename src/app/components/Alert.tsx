import { CircleAlert, Info } from "lucide-react";

/** 오류 문구. 그림과 함께 보여 색을 구분하기 어려운 사람도 알아볼 수 있게 한다. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="error" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** 주의해서 볼 안내. */
export function Banner({ children, role }: { children: React.ReactNode; role?: "status" | "alert" }) {
  return (
    <p className="banner" role={role}>
      <Info size={20} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
