import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff-page";
import { PrintButton } from "./PrintButton";
import { StaffNav } from "../../../components/StaffNav";
import { MorePasses } from "./MorePasses";

export const dynamic = "force-dynamic";

// 미사용 패스 인쇄용. 한 장에는 QR 과 패스 번호 네 자리만 넣는다.
// 이름·날짜·그 밖의 글자는 넣지 않는다. 안내데스크 권한으로만 열린다.
export default async function PassSheetPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff");

  const db = await getDb();
  const passes = await db.query<{ token: string; pass_no: string }>(
    "select token, pass_no from passes where state = 'idle' order by pass_no",
  );
  const cells = await Promise.all(
    passes.map(async (p) => ({
      passNo: p.pass_no,
      svg: await QRCode.toString(`${config.baseUrl}/p/${p.token}`, {
        type: "svg",
        errorCorrectionLevel: "M",
        // 여백이 좁으면 어두운 화면이나 종이 가장자리에서 인식이 안 된다. 규격의 최소 여백(4칸)을 둔다.
        margin: 4,
      }),
    })),
  );

  return (
    <main className="sheet-page">
      <div className="no-print">
        <div className="topbar">
          <Link className="icon-btn" href="/staff/desk" aria-label="안내데스크로">
            <ChevronLeft size={26} aria-hidden="true" />
          </Link>
          <span className="topbar-title">안내데스크</span>
        </div>
        <h1>미사용 패스 {cells.length}장</h1>
        <p className="muted">
          한 장에는 QR과 패스 번호 네 자리만 들어갑니다. 이름이나 날짜는 넣지 않습니다. QR 주소는{" "}
          <code>{config.baseUrl}</code> 기준입니다.
        </p>
        <div className="row">
          <PrintButton />
          <MorePasses />
        </div>
      </div>
      <div className="sheet">
        {cells.map((c) => (
          <div className="sheet-pass" key={c.passNo}>
            <div dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="sheet-no">{c.passNo}</div>
          </div>
        ))}
      </div>
      <StaffNav isDesk />
    </main>
  );
}
