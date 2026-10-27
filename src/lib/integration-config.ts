import {
  INTEGRATION_CHANNELS,
  type IntegrationChannel,
  type IntegrationReadiness,
} from "./integration-model";
export interface BridgeConfig {
  url: string;
  token: string;
  webhookSecret: string;
  resources: Record<string, string>;
}
export type IntegrationEnvironment = Readonly<
  Record<string, string | undefined>
>;
export function bridgeConfig(
  channel: IntegrationChannel,
  env: IntegrationEnvironment = process.env,
): BridgeConfig | IntegrationReadiness {
  const prefix = "EXTERNAL_" + channel.toUpperCase(),
    url = env[prefix + "_URL"],
    token = env[prefix + "_TOKEN"],
    webhookSecret = env[prefix + "_WEBHOOK_SECRET"];
  if (!url || !token || !webhookSecret)
    return {
      channel,
      state: "not_configured",
      message: "기관·제조사 명세 및 시험 접속 정보 대기",
    };
  // A real-device protocol must be implemented and verified separately. This release cannot enable live commands.
  if (
    env.EXTERNAL_CONNECTION_MODE !== "sandbox" ||
    env[prefix + "_ADAPTER"] !== "jsp-gateway-v1"
  )
    return {
      channel,
      state: "blocked",
      message: "승인된 시험 중계 규격 설정 필요 · 실물 명령 비활성",
    };
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !u.hostname.includes(".") ||
      u.hostname === "localhost" ||
      /^\d|:/.test(u.hostname) ||
      u.hostname.endsWith(".local")
    )
      throw Error();
    if (token.trim().length < 16 || webhookSecret.length < 32) throw Error();
    const hosts = (env.EXTERNAL_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase());
    if (!hosts.includes(u.hostname.toLowerCase())) throw Error();
    const resources = JSON.parse(env.EXTERNAL_RESOURCE_MAP ?? "{}");
    if (
      !resources ||
      typeof resources !== "object" ||
      Array.isArray(resources) ||
      Object.values(resources).some(
        (v) => typeof v !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(v),
      )
    )
      throw Error();
    return { url: u.toString(), token, webhookSecret, resources };
  } catch {
    return {
      channel,
      state: "blocked",
      message: "시험 서버 주소·인증·허용 호스트 설정 확인 필요",
    };
  }
}
export function integrationReadiness(
  env: IntegrationEnvironment = process.env,
): IntegrationReadiness[] {
  return INTEGRATION_CHANNELS.map((channel) => {
    const c = bridgeConfig(channel, env);
    return "state" in c
      ? c
      : {
          channel,
          state: "sandbox",
          message: "시험 중계 규격 준비 · 실물 장비와 연결되지 않음",
        };
  });
}
