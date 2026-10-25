export interface RequestAlert {
  acknowledgedAt: string | null;
  acknowledgedZone: string | null;
  queued: number;
  accepted: number;
  received: number;
  failed: number;
  stopped: number;
  targets: number;
}
