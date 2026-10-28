import { requireStaff } from "@/lib/staff-page";
import { DesignSamples } from "./DesignSamples";
export default async function DesignGallery() {
  await requireStaff();
  return (
    <main className="page design-gallery">
      <header className="workspace-page-head">
        <div>
          <p className="eyebrow">디자인 기준</p>
          <h1>화면 부품 미리보기</h1>
        </div>
      </header>
      <p>실제 접수 없이 색·선택·초점·안내 상태를 확인하는 화면입니다.</p>
      <DesignSamples />
    </main>
  );
}
