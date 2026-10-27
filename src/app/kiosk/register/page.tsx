import { redirect } from "next/navigation";
/** Retired sticker workflow: use the existing boarding-pass registration flow. */
export default function KioskRegisterPage() { redirect("/kiosk/entry"); }
