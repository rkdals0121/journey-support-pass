import { Banner, ErrorNote } from "./Alert";

export interface PollInfo {
  label: string;
  stale: boolean;
  aged?: boolean;
}

/** 운항 정보가 언제 것인지 항상 보여준다. 늦어지면 전광판을 보라고 알린다. */
export function PollBar({ poll, light = false }: { poll: PollInfo; light?: boolean }) {
  return (
    <>
      <p className={`poll ${light ? "poll-light" : ""}`}>
        <i className={`poll-dot ${poll.stale ? "stale" : poll.aged ? "aged" : ""}`} aria-hidden="true" />
        {poll.label}
      </p>
      {poll.stale && <ErrorNote>운항 정보가 늦어지고 있습니다. 전광판을 확인하세요</ErrorNote>}
      {poll.aged && <Banner>받은 지 시간이 지났습니다. 탑승구는 전광판에서 한 번 더 확인하세요.</Banner>}
    </>
  );
}
