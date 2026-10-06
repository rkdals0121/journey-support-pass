import { config } from "@/lib/config";
import { RegisterFlow } from "./RegisterFlow";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="page has-cta">
      <RegisterFlow mock={config.dataMode === "mock"} />
    </main>
  );
}
