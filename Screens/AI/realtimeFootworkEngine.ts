// Screens/AI/realtimeFootworkEngine.ts

export type CourtZone = 'CENTER' | 'FRONT_LEFT' | 'FRONT_RIGHT' | 'MID_LEFT' | 'MID_RIGHT' | 'BACK_LEFT' | 'BACK_RIGHT';

export interface StepEvent {
  ts: number;
  zone: CourtZone;
  dwellMs: number;
  splitStepDetected: boolean;
  recoveryToCenterMs?: number;
  reactionMs?: number;
  kneeAngleMin?: number;
  trunkLeanDeg?: number;
  balanceScore?: number;
  confidence?: number;
}

export interface FootworkSetInput {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  calibrationScore: number;
  conditions: { fullBodyVisible: boolean; singlePlayerOnly: boolean; indoorLightingOk: boolean; courtDetected: boolean; };
  events: StepEvent[];
}

export interface FootworkSetSummary {
  durationSec: number;
  eventCount: number;
  averageReactionMs: number;
  averageRecoveryMs: number;
  splitStepRate: number;
  courtCoveragePct: number;
  averageKneeDepthScore: number;
  postureScore: number;
  footworkScore: number;
  totalScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendedDrill: string;
}

// ============================================================================
// ✅ [고도화 추가] 풋워크 게임 & 경기 실시간 분석: 코트 원근감 보정 (호모그래피)
// 카메라 원근감으로 인한 2D 픽셀 왜곡을 3x3 변환 행렬을 통해 실제 코트(Top-Down) 좌표로 변환합니다.
// ============================================================================

/**
 * 2D 픽셀 좌표를 Top-Down 코트 좌표로 변환하는 호모그래피 함수
 * 카메라 위치에 따라 사전에 계산된 3x3 투영 변환 행렬(H)이 필요합니다.
 */
export function applyHomography(
  cameraX: number,
  cameraY: number,
  H: number[][]
): { courtX: number; courtY: number } {
  // 행렬 내적 연산: w = H31*x + H32*y + H33
  const w = H[2][0] * cameraX + H[2][1] * cameraY + H[2][2];

  // 0으로 나누는 오류(Zero Division) 방지
  if (w === 0) return { courtX: cameraX, courtY: cameraY };

  // X' = (H11*x + H12*y + H13) / w
  const courtX = (H[0][0] * cameraX + H[0][1] * cameraY + H[0][2]) / w;

  // Y' = (H21*x + H22*y + H23) / w
  const courtY = (H[1][0] * cameraX + H[1][1] * cameraY + H[1][2]) / w;

  return { courtX, courtY };
}

/**
 * 보정된 코트 좌표계를 기반으로 실제 풋워크 스텝 이동 거리를 산출합니다.
 */
export function calculateTrueDistance(
  pos1: { courtX: number; courtY: number },
  pos2: { courtX: number; courtY: number }
): number {
  const dx = pos2.courtX - pos1.courtX;
  const dy = pos2.courtY - pos1.courtY;
  // 유클리드 거리 산출
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
function average(nums: number[]) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; }
function scoreReaction(ms: number) { if (ms <= 450) return 100; if (ms >= 1200) return 20; return clamp(100 - ((ms - 450) / 750) * 80); }
function scoreRecovery(ms: number) { if (ms <= 800) return 100; if (ms >= 2000) return 30; return clamp(100 - ((ms - 800) / 1200) * 70); }
function scoreKneeDepth(angle: number) { if (angle >= 110 && angle <= 145) return 100; if (angle < 80 || angle > 165) return 40; const dist = Math.min(Math.abs(angle - 127.5), 47.5); return clamp(100 - dist * 1.2); }
function scoreTrunkLean(deg: number) { if (deg >= 5 && deg <= 20) return 100; if (deg < 0 || deg > 35) return 40; return clamp(100 - Math.abs(deg - 15) * 3); }

export function summarizeFootworkSet(input: FootworkSetInput): FootworkSetSummary {
  const durationSec = Math.max(1, Math.round((input.endedAt - input.startedAt) / 1000));
  const eventCount = input.events.length;

  const reactionList = input.events.map(e => e.reactionMs).filter((v): v is number => typeof v === 'number');
  const recoveryList = input.events.map(e => e.recoveryToCenterMs).filter((v): v is number => typeof v === 'number');
  const balanceList = input.events.map(e => e.balanceScore).filter((v): v is number => typeof v === 'number');
  const kneeList = input.events.map(e => e.kneeAngleMin).filter((v): v is number => typeof v === 'number');
  const trunkList = input.events.map(e => e.trunkLeanDeg).filter((v): v is number => typeof v === 'number');

  const splitCount = input.events.filter(e => e.splitStepDetected).length;
  const splitStepRate = eventCount ? splitCount / eventCount : 0;
  const splitScore = splitStepRate * 100;

  const uniqueCorners = new Set(input.events.map(e => e.zone).filter(z => z !== 'CENTER' && z !== 'UNKNOWN' as any));
  const courtCoveragePct = Math.round((uniqueCorners.size / 6) * 100);

  const reactionScore = reactionList.length > 0 ? average(reactionList.map(scoreReaction)) : 70;
  const avgReactionMs = reactionList.length > 0 ? Math.round(average(reactionList)) : 0;

  const recoveryScore = recoveryList.length > 0 ? average(recoveryList.map(scoreRecovery)) : 70;
  const avgRecoveryMs = recoveryList.length > 0 ? Math.round(average(recoveryList)) : 0;

  const balanceScore = balanceList.length > 0 ? average(balanceList) : 75;
  const kneeDepthScore = kneeList.length > 0 ? average(kneeList.map(scoreKneeDepth)) : 75;
  const trunkScore = trunkList.length > 0 ? average(trunkList.map(scoreTrunkLean)) : 75;

  const postureScore = Math.round(kneeDepthScore * 0.4 + trunkScore * 0.3 + balanceScore * 0.3);
  // ✅ 반코트 버전의 정교한 점수 계산법 통합
  const footworkScore = Math.round(recoveryScore * 0.35 + courtCoveragePct * 0.3 + reactionScore * 0.2 + splitScore * 0.15);
  const totalScore = Math.round(postureScore * 0.4 + footworkScore * 0.6);

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (avgRecoveryMs > 0 && avgRecoveryMs <= 1000) strengths.push('스프링 같은 탄력! 타구 직후 중앙 홈 포지션으로 돌아오는 리커버리 속도가 선수급입니다.');
  else if (avgRecoveryMs > 0 && avgRecoveryMs <= 1400) strengths.push('안정적인 홈 포지션 복귀 능력을 갖추고 있어 연속 랠리 방어에 강점이 있습니다.');

  if (reactionScore >= 80) strengths.push('첫 반응 속도가 빨라 셔틀 대응이 매우 날카롭습니다.');
  if (splitScore >= 75) strengths.push('이동 전 스플릿 스텝 타이밍이 전반적으로 우수합니다.');

  if (courtCoveragePct >= 80) strengths.push('전후좌우 6코너를 골고루 누비는 엄청난 코트 장악력을 보여줍니다. 활동 반경이 매우 넓습니다.');

  if (postureScore >= 85) strengths.push('기동 중에도 상체가 들뜨지 않고 낮은 무게 중심(기마 자세)을 완벽하게 유지합니다.');
  else if (postureScore >= 70) strengths.push('스텝 간 하체 밸런스 붕괴가 적어 다음 스트로크 준비가 수월합니다.');

  if (avgRecoveryMs > 1600) weaknesses.push('사이드로 이동 후 중앙 복귀가 늦어 연속 공격(푸시/스매시)에 취약한 틈을 노출하고 있습니다.');
  if (reactionScore < 65) weaknesses.push('첫 출발 반응이 늦어 셔틀 대응이 한 박자 밀립니다.');
  if (splitScore < 60) weaknesses.push('스플릿 스텝이 누락되거나 타이밍이 불안정해 첫 보폭에 손해를 봅니다.');

  if (courtCoveragePct <= 30 && eventCount > 10) weaknesses.push('특정 구역(전위 또는 후위)에만 발이 묶여 있습니다. 코트를 넓게 쓰는 훈련이 필요합니다.');
  if (kneeDepthScore < 60) weaknesses.push('이동할 때 무릎이 펴지면서 상체가 들립니다. 셔틀콕에 시선이 흔들려 타점이 무너질 수 있습니다.');

  if (!strengths.length) strengths.push('지치지 않고 코트 내에서 랠리를 이어가는 집중력이 좋습니다.');
  if (!weaknesses.length) weaknesses.push('전반적인 기동력과 폼이 훌륭합니다. 이 페이스를 유지하세요.');

  let recommendedDrill = '사이드 스텝과 런지를 결합한 6코너 헌볼 훈련을 권장합니다.';
  if (avgRecoveryMs > 1600) recommendedDrill = '▶ 고무줄(저항 밴드)을 허리에 걸고 4코너로 나갔다가 탄력으로 튕겨 돌아오는 홈 포지션 복귀 특훈을 실시하세요.';
  else if (reactionScore < 65) recommendedDrill = '▶ 랜덤 방향 콜 풋워크 드릴을 통해 예측 출발을 억제하고 스플릿 스텝 직후 튕겨나가는 반응 속도를 높이세요.';
  else if (courtCoveragePct <= 30) recommendedDrill = '▶ 전위 대각선 푸시 후 후위 대각선 스매시로 이어지는 X자 크로스 스텝 훈련에 집중하세요.';
  else if (postureScore < 65) recommendedDrill = '▶ 메디신 볼이나 케틀벨을 가슴에 안고 코트를 도는 훈련으로 코어와 하체 중심을 묵직하게 낮추세요.';

  return {
    durationSec,
    eventCount,
    averageReactionMs: avgReactionMs,
    averageRecoveryMs: avgRecoveryMs,
    splitStepRate: Math.round(splitStepRate * 100) / 100,
    courtCoveragePct,
    averageKneeDepthScore: Math.round(kneeDepthScore),
    postureScore,
    footworkScore,
    totalScore,
    strengths,
    weaknesses,
    recommendedDrill
  };
}