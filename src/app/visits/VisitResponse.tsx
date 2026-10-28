"use client";
import { useState } from "react";
import {
  GATE_PICKUP_POINTS,
  nearestFacilities,
  placeOf,
  routeOptionsOf,
  routeToGateFrom,
} from "@/lib/airport";
import { hubOf, type VisitView } from "@/lib/service-hubs";
import { useSpeech } from "../components/useSpeech";
import styles from "../components/support-journey.module.css";
export function VisitResponse({
  visit,
  en = false,
  busy = false,
  onComplete,
  onHandover,
}: {
  visit: VisitView;
  en?: boolean;
  busy?: boolean;
  onComplete: () => void;
  onHandover: () => void;
}) {
  const [topic, setTopic] = useState("gate"),
    [gate, setGate] = useState("");
  const t = (ko: string, english: string) => (en ? english : ko);
  const hub = hubOf(visit.hubId)!,
    from = placeOf(hub.placeId)!;
  const target = GATE_PICKUP_POINTS.find((g) => g.gate === Number(gate));
  const route =
    topic === "gate" && target
      ? routeToGateFrom(
          from,
          target.place.area,
          target.gate,
          routeOptionsOf(visit.choices),
        )
      : undefined;
  const facility = topic.startsWith("facility:")
    ? nearestFacilities(from, routeOptionsOf(visit.choices)).find(
        (f) => f.kind === topic.slice(9),
      )
    : undefined;
  const guidance = route ?? facility?.route;
  const speech = useSpeech(en ? "en" : "ko");
  return (
    <section
      className={styles.panel}
      aria-label={t("로봇 직접 안내", "Robot guidance")}
    >
      <h2>{t("어디로 가시겠어요?", "Where would you like to go?")}</h2>
      <div className={styles.field}>
        <label htmlFor="robot-topic">{t("안내받을 곳", "Destination")}</label>
        <select
          id="robot-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="gate">{t("탑승구", "Boarding gate")}</option>
          <option value="location">
            {t("현재 만남 장소", "This meeting point")}
          </option>
          <option value="support">
            {t("직원이 필요한 지원", "Assistance requiring staff")}
          </option>
          {!from.landside && (
            <>
              <option value="facility:restroom">
                {t("화장실", "Restroom")}
              </option>
              <option value="facility:nursing">
                {t("영유아 휴게실", "Nursing room")}
              </option>
              <option value="facility:pharmacy">{t("약국", "Pharmacy")}</option>
              <option value="facility:food">{t("식사할 곳", "Food")}</option>
            </>
          )}
        </select>
      </div>
      {topic === "gate" && (
        <div className={styles.field}>
          <label htmlFor="robot-gate">{t("탑승구 번호", "Gate number")}</label>
          <input
            id="robot-gate"
            inputMode="numeric"
            maxLength={3}
            value={gate}
            placeholder={t("예: 116", "e.g. 116")}
            onChange={(e) => setGate(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      )}
      {topic === "gate" && gate && !route && (
        <p role="status">
          {t(
            "이 장소에서 연결되는 탑승구인지 확인해 주세요. 다른 터미널 이동은 직원에게 안내받으세요.",
            "Check that this gate is reachable from here. Ask staff about travelling to another terminal.",
          )}
        </p>
      )}
      {topic === "location" && <p>{en ? hub.en : hub.landmark}</p>}
      {topic === "support" && (
        <p>
          {t(
            "휠체어·이동 동행이 필요하면 아래에서 직원에게 연결하세요. 이미 입력한 내용은 그대로 전달돼요.",
            "For a wheelchair or escort, connect to staff below. Your existing assistance details stay with the same request.",
          )}
        </p>
      )}
      {facility && (
        <p>
          {t(
            `${facility.nearGate}번 탑승구 부근`,
            `Near gate ${facility.nearGate}`,
          )}
        </p>
      )}
      {guidance && (
        <div className={styles.inlineNotice}>
          <p>
            <strong>
              {t(
                `약 ${guidance.minutes}분 · ${Math.round(guidance.meters)}m`,
                `About ${guidance.minutes} min · ${Math.round(guidance.meters)}m`,
              )}
            </strong>
          </p>
          <ol>
            {guidance.steps.map((step, i) => (
              <li key={i}>
                {step.kind === "walk"
                  ? t(
                      `${step.towardGate ?? "시설"} 방향으로 ${Math.round(step.meters)}m 이동`,
                      `Walk ${Math.round(step.meters)}m towards ${step.towardGate ?? "the facility"}`,
                    )
                  : step.kind === "elevator"
                    ? t("엘리베이터를 이용하세요", "Take the lift")
                    : step.kind === "shuttle"
                      ? t("셔틀트레인을 이용하세요", "Take the shuttle train")
                      : step.kind === "security"
                        ? t(
                            "보안검색·출국심사를 마친 뒤 안내를 이어가세요",
                            "Continue after security and immigration",
                          )
                        : t(
                            "안내 표지에 따라 층을 이동하세요",
                            "Follow the signs to the next level",
                          )}
              </li>
            ))}
          </ol>
          <p className={styles.demo}>
            {t(
              "시연 지도 기준이며 실제 현장 안내를 우선하세요.",
              "Prototype map estimate. Follow the airport signs and staff instructions.",
            )}
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              speech.speak(
                t(
                  `약 ${guidance.minutes}분, ${Math.round(guidance.meters)}미터입니다. 안내 표지를 따라 이동해 주세요.`,
                  `About ${guidance.minutes} minutes, ${Math.round(guidance.meters)} metres. Follow the airport signs.`,
                ),
              )
            }
          >
            {t("안내 읽어주기", "Read guidance aloud")}
          </button>
        </div>
      )}
      {topic.startsWith("facility:") && !facility && (
        <p>
          {t(
            "이 구역의 시설 정보가 없어 직원 확인이 필요해요.",
            "This facility is not mapped here. Please ask staff.",
          )}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={onComplete}
        >
          {t("안내를 받았어요 · 완료", "That helped · finish")}
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={onHandover}
        >
          {t("직원 도움이 필요해요", "I need staff assistance")}
        </button>
      </div>
    </section>
  );
}
