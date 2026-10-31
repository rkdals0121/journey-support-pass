"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, BellRing, Bot, CalendarCheck, CarFront, ClipboardCheck, Home, Navigation, Settings, Volume2, VolumeX } from "lucide-react";
import { TextSizeControl } from "./TextSizeControl";
import { useViewSettings } from "./viewSettings";
import { useSpeech } from "./useSpeech";
import styles from "./mobility-home.module.css";

export function MobilityHome({en=false,homeHref="/",place="",returnTo=""}: {en?:boolean;homeHref?:string;place?:string;returnTo?:string}) {
  const t=(ko:string,english:string)=>en?english:ko;
  const view=useViewSettings();
  const {supported,speaking,speak,stop}=useSpeech(en?"en":"ko",true);
  useEffect(()=>{
    document.documentElement.style.setProperty("--scale",String(view.scale??1));
    return ()=>{document.documentElement.style.removeProperty("--scale");};
  },[view.scale]);
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
    {title:t("하늘이 동행","Walk with Haneuli"),detail:t("로봇과 함께 가는 길","Guidance with Journey Bot"),Icon:Bot,url:href("/help",{topic:"mobility",flow:"robot",fresh:"1"})},
    {title:t("내 신청","My requests"),detail:t("직원이 오는지 확인","Check your request status"),Icon:ClipboardCheck,url:href("/requests")},
  ];
  const menuText=t("무엇을 도와드릴까요? 길 안내, 전동차 타기, 하늘이 동행, 내 신청 중에서 선택해 주세요.","How can we help? Choose directions, electric cart, walk with Haneuli, or my requests.");
  return <div data-mobility-home className={`pretrip-site ${styles.page}`} lang={en?"en":"ko"}>
    <a className="public-skip" href="#public-main">{t("본문 바로가기","Skip to content")}</a>
    <header className="pretrip-header"><nav className={styles.toolbar} aria-label={t("화면 메뉴","Screen menu")}>
      <Link href={homeHref}><ArrowLeft aria-hidden="true"/><span>{t("이전","Back")}</span></Link>
      <Link href={homeHref}><Home aria-hidden="true"/><span>{t("처음으로","Home")}</span></Link>
      <details className={styles.settings}><summary><Settings aria-hidden="true"/><span>{t("설정","Settings")}</span></summary>
        <div className={styles.settingsPanel}><strong>{t("글자 크기","Text size")}</strong><TextSizeControl en={en}/><Link href={href("/help",{topic:"mobility"},!en)}>{en?"한국어":"English"}</Link></div>
      </details>
      <button className={styles.listen} type="button" disabled={!supported} aria-pressed={speaking} aria-label={speaking?t("소리 안내 멈추기","Stop voice"):t("소리로 듣기","Listen")} onClick={()=>speaking?stop():speak(menuText)}>{speaking?<VolumeX aria-hidden="true"/>:<Volume2 aria-hidden="true"/>}</button>
      <Link className={styles.call} href={staff}><BellRing aria-hidden="true"/><span>{t("도움 요청하기","Request help")}</span></Link>
    </nav></header>
    <main id="public-main" className={styles.content}>
      <div className={styles.welcome}><Image src="/images/haneuli/friend.webp" width={160} height={160} alt={t("안내 도우미 하늘이","Haneuli, your airport guide")} priority/><h1>{t("무엇을 도와드릴까요?","How can we help?")}</h1></div>
      <div className={styles.cards}>{cards.map(({title,detail,Icon,url},i)=><Link key={title} data-mobility-action={["directions","cart","robot","requests"][i]} href={url} className={`${styles.card} ${i===0?styles.featured:""}`}><Icon aria-hidden="true"/><strong>{title}</strong><span>{detail}</span></Link>)}</div>
    </main>
    <footer className={styles.footer}><Link href={homeHref}>{t("안내 끝내기","Finish")}</Link><Link href={href("/visits")}><CalendarCheck aria-hidden="true"/>{t("만남 예약 확인","Appointments")}</Link></footer>
  </div>;
}
