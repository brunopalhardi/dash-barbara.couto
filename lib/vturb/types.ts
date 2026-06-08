/** Métricas de um player num único dia (já parseadas pra número). */
export interface PlayerDayInput {
  views: number;
  plays: number;
  finished: number;
  clicks: number;
  overPitch: number;
  underPitch: number;
  /** engagement_rate em % (0-100) reportado pelo VTurb */
  engagementRate: number;
  durationSec: number;
  /** 0 = pitch não configurado no VTurb */
  pitchTimeSec: number;
}

/** Métricas agregadas de uma página num dia (soma dos players). */
export interface PageDayAgg {
  views: number;
  plays: number;
  finished: number;
  clicks: number;
  overPitch: number;
  underPitch: number;
  playRate: number;        // %
  engagementRate: number;  // %
  avgWatchedSec: number;
  /** null quando nenhum player da página tem pitch configurado */
  pitchRetentionRate: number | null;
}

/** Ponto da curva: % do vídeo (0-100, inteiro) → usuários. */
export interface CurveBucket {
  pct: number;
  users: number;
}

/** grouped_timed cru do endpoint /times/user_engagement */
export interface GroupedTimed {
  timed: number;       // segundo do vídeo
  total_users: number;
}
