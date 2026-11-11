"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BellRing, Bot, CalendarCheck, CarFront, ClipboardCheck, MapPin, Navigation, Volume2, VolumeX } from "lucide-react";
import { PublicShell } from "./PublicShell";
import { useSpeech } from "./useSpeech";
import styles from "./mobility-home.module.css";

export function MobilityHome({en=false,homeHref="/",place="",returnTo=""}: {en?:boolean;homeHref?:string;place?:string;returnTo?:string}) {
  const t=(ko:string,english:string)=>en?english:ko;
  const {supported,speaking,speak,stop}=useSpeech(en?"en":"ko",true);
  function href(path:string,extra:Record<string,string>={},language=en) {
    const q=new URLSearchParams(extra);
    if(language)q.set("lang","en");
    else q.delete("lang");
    if(place)q.set("place",place);
    if(returnTo)q.set("returnTo",returnTo);
    return path+(q.size?"?"+q.toString():"");
  }
  const staff=href("/help",{topic:"mobility",flow:"staff",fresh:"1"});
  const cards=[
    {title:t("길 안내","Directions"),detail:t("탑승구 · 화장실 · 쉼터","Gates · restrooms · rest areas"),Icon:Navigation,url:href("/navigate",{entry:"mobility"})},
    {title:t("전동차 타기","Electric cart"),detail:t("직원과 이동할 곳을 정해요","Arrange your ride with staff"),Icon:CarFront,url:href("/help",{topic:"mobility",flow:"staff",task:"mobility-vehicle",fresh:"1"})},
    {title:t("안내로봇 동행","Guide robot assistance"),detail:t("로봇과 함께 가는 길","Walk with a guide robot"),Icon:Bot,url:href("/help",{topic:"mobility",flow:"robot",fresh:"1"})},
    {title:t("내 신청","My requests"),detail:t("직원·로봇 지원과 예약 확인","Staff, robot & meeting status"),Icon:ClipboardCheck,url:href("/requests",{entry:"mobility"})},
  ];
  const menuText=t("무엇을 도와드릴까요? 길 안내, 전동차 타기, 안내로봇 동행, 내 신청 중에서 선택해 주세요.","How can we help? Choose directions, electric cart, guide robot assistance, or my requests.");
  return <PublicShell lang={en?"en":"ko"}>
    <main id="public-main" data-mobility-home data-kiosk={!!place} className={styles.content}>
      <header className={`ph-hero ${styles.intro}`}>
        <div className="ph-hero-copy">
          <div className={`service-kicker ${styles.introTop}`}>
            <Link href={homeHref} className="public-back"><ArrowLeft aria-hidden="true"/>{t("이전","Back")}</Link>
            <span><MapPin aria-hidden="true"/>{t("공항 현장 서비스","Airport assistance")}</span>
          </div>
          <h1>{t("이동 도움받기","Mobility assistance")}</h1>
          <p>{t("필요한 도움을 골라 주세요.","Choose the help you need.")}</p>
        </div>
      </header>
      <section className={styles.assistance} aria-labelledby="mobility-welcome">
      <div className={styles.welcome}><Image src="/images/haneuli/narangi.webp" width={160} height={160} alt={t("안내 도우미 나랑이","Narangi, your airport guide")} priority/><h2 id="mobility-welcome">{t("무엇을 도와드릴까요?","How can we help?")}</h2></div>
      <div className={styles.toolbar}>
        <button className={styles.listen} type="button" disabled={!supported} aria-pressed={speaking} aria-label={speaking?t("소리 안내 멈추기","Stop voice"):t("소리로 듣기","Listen")} onClick={()=>speaking?stop():speak(menuText)}>{speaking?<VolumeX aria-hidden="true"/>:<Volume2 aria-hidden="true"/>}<span>{t("소리로 듣기","Listen")}</span></button>
        <Link className={styles.call} href={staff}><BellRing aria-hidden="true"/><span>{t("도움 요청하기","Request help")}</span></Link>
      </div>
      </section>
      <div className={styles.cards}>{cards.map(({title,detail,Icon,url},i)=><Link key={title} data-mobility-action={["directions","cart","robot","requests"][i]} href={url} className={`${styles.card} ${i===0?styles.featured:""}`}><Icon aria-hidden="true"/><strong>{title}</strong><span>{detail}</span></Link>)}</div>
    <div className={styles.footer} role="group" aria-label={t("안내 마무리","Finish assistance")}><Link href={homeHref}>{t("안내 끝내기","Finish")}</Link><Link href={href("/visits")}><CalendarCheck aria-hidden="true"/>{t("만남 예약 확인","Appointments")}</Link></div>
    </main>
  </PublicShell>;
}
