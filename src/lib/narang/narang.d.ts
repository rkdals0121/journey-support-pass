// 나랑이 3D 모듈(narang.js)의 타입. 모듈 원본은 github.com/rkdals0121/narang-3d 의 v3/narang.js(팀 저장소)를 그대로 복사한 것이다.
export type NarangMood = "sleep" | "awake" | "happy";
export interface NarangApi {
  setMood(mood: NarangMood): void;
  readonly mood: NarangMood;
  readonly pose: "sit" | "lie" | "awake";
  sleep(pose?: "sit" | "lie"): void;
  wake(): void;
  jump(): void;
  wave(): void;
  setExpression(name: string): void;
  setReducedMotion(on: boolean): void;
  dispose(options?: { releaseContext?: boolean }): void;
}
export interface NarangOptions {
  model: string;
  sleepModel?: string;
  mood?: NarangMood;
  sleepPose?: "sit" | "lie";
  reducedMotion?: boolean;
  lookAtPointer?: boolean;
  dragToRotate?: boolean;
  tapToJump?: boolean;
  background?: string | null;
  maxPixelRatio?: number;
  onReady?: (api: NarangApi) => void;
  onError?: (err: unknown) => void;
}
export function canRender3D(): boolean;
export function createNarang(canvas: HTMLCanvasElement, options: NarangOptions): NarangApi;
