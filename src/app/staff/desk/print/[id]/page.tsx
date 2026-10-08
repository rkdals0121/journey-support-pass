import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { activePassOf } from "@/lib/passes";
import { getRegistration } from "@/lib/registrations";
import { requireStaff } from "@/lib/staff-page";
import { PrintButton } from "../../passes/PrintButton";

export const dynamic = "force-dynamic";

// 한 여객의 패스를 인쇄한다. 여객 휴대전화에 뜬 것과 같은 QR 이다.
// 안내데스크나 키오스크에서 뽑아 여권에 끼우게 한다. 종이에는 QR 과 패스 번호만 찍고 이름은 찍지 않는다.
export default async function PrintPassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff");

  const db = await getDb();
  const reg = await getRegistration(db, id);
  const pass = reg && reg.status === "active" ? await activePassOf(db, reg.id) : null;
  if (!reg || !pass) redirect("/staff/desk");

  const svg = await QRCode.toString(`${config.baseUrl}/p/${pass.token}`, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
  });

  return (
    <main className="page">
      <div className="no-print">
        <div className="topbar">
          <Link className="icon-btn" href="/staff/desk" aria-label="안내데스크로">
            <ChevronLeft size={26} aria-hidden="true" />
          </Link>
          <span className="topbar-title">패스 인쇄</span>
        </div>
        <h1>{reg.name} 님의 패스</h1>
        <p className="muted">
          여객 휴대전화에 뜬 것과 같은 QR입니다. 인쇄해서 여권에 끼우거나 목에 걸게 해 주세요. 종이에는 QR과 패스 번호만
          찍힙니다.
        </p>
      </div>
      <div className="print-pass">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="sheet-no">{pass.passNo}</div>
      </div>
      <div className="no-print">
        <PrintButton label="패스 인쇄" primary />
      </div>
    </main>
  );
}
