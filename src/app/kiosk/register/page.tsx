import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("현장 등록");
/** Retired sticker workflow: use the existing boarding-pass registration flow. */
export default function KioskRegisterPage() { redirect("/kiosk/entry"); }
