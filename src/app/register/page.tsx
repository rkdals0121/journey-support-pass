import { config } from "@/lib/config";
import { Brand } from "../components/Sunflower";
import { RegisterFlow } from "./RegisterFlow";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="page">
      <Brand />
      <RegisterFlow mock={config.dataMode === "mock"} />
    </main>
  );
}
