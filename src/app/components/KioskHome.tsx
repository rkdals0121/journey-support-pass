import Link from "next/link";
import { ArrowRight, CalendarCheck, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { KioskReturn } from "@/lib/help-entry";
import { TaskLauncher } from "./TaskLauncher";

/**
 * 키오스크·안내로봇의 처음 화면 틀.
 * 왼쪽(세로 화면에서는 위): 지금 있는 곳, 무엇을 하는 화면인지, 미리 등록한 여객이 쓰는 「탑승권으로 내 도움 불러오기」.
 * 오른쪽(세로 화면에서는 아래): 바로 쓰는 서비스. 만남 예약 확인도 같은 모양의 칸으로 둔다.
 * 직원 부르기는 화면 위 도움 줄(call-dock)에 늘 같은 자리로 있다.
 */
export function KioskHome({
  en,
  here,
  title,
  lead,
  figure,
  pass,
  listen,
  topics,
  returnTo,
  appointmentLabel,
}: {
  en: boolean;
  here: string;
  title: string;
  lead: string;
  /** 안내로봇 얼굴처럼 제목 위에 두는 그림. */
  figure?: ReactNode;
  /** 미리 등록한 도움을 불러오는 칸(탑승권, 번호). */
  pass: ReactNode;
  listen: ReactNode;
  topics?: readonly string[];
  returnTo: KioskReturn;
  appointmentLabel: string;
}) {
  return (
    <div className="kx-home">
      <section className="kx-home-intro">
        <p className="kx-here">
          <MapPin aria-hidden="true" />
          <span>
            <span className="sr-only">
              {en ? "You are here: " : "현재 위치: "}
            </span>
            {here}
          </span>
        </p>
        {figure}
        <h1>{title}</h1>
        <p className="kx-lead">{lead}</p>
        <div className="kx-pass">{pass}</div>
        <div className="kx-listen">{listen}</div>
      </section>
      <section className="kx-home-services" aria-labelledby="kx-services-title">
        <h2 id="kx-services-title">
          {en ? "Use a service now" : "바로 이용하기"}
        </h2>
        <div
          className={
            "kx-tiles" + (topics && topics.length <= 2 ? " kx-tiles-few" : "")
          }
        >
          <TaskLauncher en={en} returnTo={returnTo} field topics={topics} />
          <article className="task-action task-action-appointment">
            <CalendarCheck
              aria-hidden="true"
              className="task-action-icon"
              strokeWidth={1.7}
            />
            <Link
              href={"/kiosk/visits" + (en ? "?lang=en" : "")}
              className="task-action-link"
            >
              <span>
                <strong>{appointmentLabel}</strong>
                <small>
                  {en
                    ? "Enter your 8-character reference"
                    : "확인번호 8자리로 찾기"}
                </small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
