export interface PollInfo {
  label: string;
  stale: boolean;
  aged?: boolean;
}

/** 운항 정보가 언제 것인지 항상 보여준다. 늦어지면 전광판을 보라고 알린다. */
export function PollBar({ poll }: { poll: PollInfo }) {
  return (
    <>
      <p className="muted small poll-label">{poll.label}</p>
      {poll.stale && (
        <p className="error" role="alert">
          운항 정보가 늦어지고 있습니다. 전광판을 확인하세요
        </p>
      )}
      {poll.aged && <p className="small poll-aged">받은 지 시간이 지났습니다. 탑승구는 전광판에서 한 번 더 확인하세요.</p>}
    </>
  );
}
