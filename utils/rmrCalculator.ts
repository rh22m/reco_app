// RMR(RECO Match Rating) v4 Calculator

export interface PointLog {
  scorer: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  setIndex: number;
  timestamp: number;
  duration: number;
}

export interface GameResult {
  playerA: { rmr: number; rd: number; name: string };
  playerB: { rmr: number; rd: number; name: string };
  team1Wins: number;
  team2Wins: number;
  pointLogs: PointLog[];
  isAbnormal: boolean;
}

export interface RMRAnalysis {
  newRMR_A: number;
  newRMR_B: number;
  newRD_A: number;
  newRD_B: number;
  analysis: {
    m_total: number;
    m_set: number;
    m_pd: number;
    m_flow: number;
    flowDetails: {
      clutch: number;
      com: number;
      cons: number;
      endurance: number;
      focus: number;
      tempo: number;
    };
  };
}

export const getRmrTier = (rmr: number): string => {
  if (rmr < 800) return 'Bronze 3';
  if (rmr < 900) return 'Bronze 2';
  if (rmr < 1000) return 'Bronze 1';
  if (rmr < 1100) return 'Silver 3';
  if (rmr < 1200) return 'Silver 2';
  if (rmr < 1300) return 'Silver 1';
  if (rmr < 1400) return 'Gold 3';
  if (rmr < 1500) return 'Gold 2';
  return 'Gold 1';
};

// 티어 배치
export const getDisplayTier = (rmr: number, rallyCount: number = 0): string => {
  const baseTier = getRmrTier(rmr);
  return rallyCount <= 3 ? `임시 ${baseTier}` : baseTier;
};

// 퀴즈 결과에 따른 초기 RMR 및 신뢰도(RD) 계산 함수
// 기획상 신규 선수는 최대 불확실성인 RD = 300에서 시작해야 하나,
// 룰 퀴즈 정답 수(이해도)에 따라 초기 불확실성을 동적으로 줄여주기 위해 변형 유지.
export const getInitialRMRAndRD = (correctQuizCount: number): { rmr: number; rd: number } => {
  const baseRMR = 1000; // 기본 RMR 값 1000
  let initialRD = 350; // 0문제 정답 (최대 불확실성)
  if (correctQuizCount === 3) initialRD = 200;
  else if (correctQuizCount === 2) initialRD = 250;
  else if (correctQuizCount === 1) initialRD = 300;

  return { rmr: baseRMR, rd: initialRD };
};

const RMR_CONSTANTS = {
  VOLATILITY_BASE: 12,
  VOLATILITY_MULTIPLIER: 0.08,
  FLOW_WEIGHTS: {
    CLUTCH: 0.25,
    COM: 0.20,
    CONS: 0.20,
    ENDURANCE: 0.15,
    FOCUS: 0.10,
    TEMPO: 0.05,
    MAX_RUN: 0.05,
  },
};

const tanh = (x: number) => (Math.exp(2 * x) - 1) / (Math.exp(2 * x) + 1);
const calculateExpectedScore = (rmrA: number, rmrB: number): number => 1 / (1 + Math.pow(10, (rmrB - rmrA) / 400));

/**
 * Volatility (변동성 계수) 공식
 * 공식: (0.08 * RD) + 12
 * 의미: 플레이어의 RD 값에 따라 1경기 결과가 RMR 점수에 미치는 민감도가 결정됨
 */
const calculateVolatility = (rd: number): number => RMR_CONSTANTS.VOLATILITY_MULTIPLIER * rd + RMR_CONSTANTS.VOLATILITY_BASE;

/**
 * 경기 후 RD 동적 감소 공식 (Glicko-2 철학 반영)
 * 의미: 상대방의 RD(불확실성)가 낮을수록(즉, 신뢰도가 높은 상대일수록)
 * 나의 RD가 더 많이 차감되어, 내 점수의 신뢰도가 빠르게 상승함.
 */
const calculateDynamicNewRD = (myRD: number, opponentRD: number): number => {
  // 상대방의 RD를 최대 불확실성(350) 기준으로 비율(Ratio) 계산
  const opponentUncertaintyRatio = Math.min(Math.max(opponentRD / 350, 0), 1);

  // 상대가 고인물(RD 30 근처)이면 감소율 최대 10%, 상대도 뉴비(RD 350)면 최소 2%
  const reductionRate = 0.10 - (0.08 * opponentUncertaintyRatio);

  // 계산된 차감률만큼 RD를 깎되, 최하한선인 30 이하로는 내려가지 않도록 방어
  return Math.max(Math.round(myRD - (myRD * reductionRate)), 30);
};

/**
 * 시간 경과에 따른 RD 부패(Decay) 공식
 * 의미: 오랫동안 경기를 하지 않으면 점수에 대한 불확실성이 다시 커짐 (신뢰도 하락)
 * 공식: RD_new = min(sqrt(RD_old^2 + c^2 * t), 350)
 * (t: 경과 개월 수, c: 시간 경과 상수 30)
 */
export const applyTimeDecayRD = (currentRD: number, lastMatchTimestamp: number): number => {
  if (!lastMatchTimestamp || lastMatchTimestamp <= 0) return currentRD;

  const now = Date.now();
  const diffMs = now - lastMatchTimestamp;

  // 밀리초를 월(Month) 단위로 변환 (1개월 = 약 30.44일로 단순화)
  const monthsElapsed = diffMs / (1000 * 60 * 60 * 24 * 30.44);

  // 아직 1개월도 지나지 않은 경우 등, 시간이 과거이거나 의미없으면 원본 유지
  if (monthsElapsed <= 0) return currentRD;

  const c = 30; // 시간 경과 상수
  // 제곱의 합에 루트를 씌워 완만하게 증가하는 부패 곡선 형성
  const decayedRD = Math.sqrt(Math.pow(currentRD, 2) + Math.pow(c, 2) * monthsElapsed);

  // 상한선인 350을 넘지 않도록 제한 후 반올림
  return Math.round(Math.min(decayedRD, 350));
};

export const printRMRLog = (data: GameResult, result: RMRAnalysis) => {
  const { playerA, playerB, team1Wins, team2Wins, pointLogs, isAbnormal } = data;
  const { newRMR_A, newRMR_B, analysis } = result;
  const { m_flow, flowDetails } = analysis;

  const totalScoreA = pointLogs.filter(l => l.scorer === 'A').length;
  const totalScoreB = pointLogs.filter(l => l.scorer === 'B').length;
  const winner = team1Wins > team2Wins ? 'A' : 'B';

  const longRallies = pointLogs.filter(l => l.duration >= 30);
  const longRallyWins = longRallies.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;

  const clutchPoints = pointLogs.filter(l => l.scoreA >= 20 && l.scoreB >= 20);
  const clutchWins = clutchPoints.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;

  const shortRallies = pointLogs.filter(l => l.duration < 30);
  const shortRallyWins = shortRallies.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;

  const set1Logs = pointLogs.filter(l => l.setIndex === 1);
  const lastSetLogs = pointLogs.filter(l => l.setIndex === Math.max(...pointLogs.map(p=>p.setIndex)));
  const getWinRate = (logs: PointLog[]) => logs.length ? (logs.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length / logs.length) * 100 : 0;
  const set1Rate = getWinRate(set1Logs);
  const lastSetRate = getWinRate(lastSetLogs);

  const E_A = calculateExpectedScore(playerA.rmr, playerB.rmr);
  const vol_A = calculateVolatility(playerA.rd);
  const vol_B = calculateVolatility(playerB.rd);

  console.log('\n========== 📊 RMR DETAILED ANALYSIS REPORT ==========');
  console.log(`📅 Match: ${playerA.name} (Team1) vs ${playerB.name} (Team2)`);
  console.log(`🏆 Winner: ${winner === 'A' ? 'Team 1 (Opponent)' : 'Team 2 (Me)'}`);
  console.log(`🔢 Score: ${team1Wins} : ${team2Wins} (Total Points: ${totalScoreA} : ${totalScoreB})`);
  console.log('---------------------------------------------');
  console.log(`[3] M_flow (경기 흐름 보정) -> ${m_flow.toFixed(2)}`);
  console.log(`    💪 Endurance (지구력): ${flowDetails.endurance.toFixed(2)}`);
  console.log(`    ⚡ Tempo (속도전): ${flowDetails.tempo.toFixed(2)}`);
  console.log('=============================================\n');
};

export const calculateRMR = (data: GameResult): RMRAnalysis => {
  const { playerA, playerB, team1Wins, team2Wins, pointLogs, isAbnormal } = data;
  let m_set = 1.0;
  if ((team1Wins === 2 && team2Wins === 0) || (team1Wins === 0 && team2Wins === 2)) m_set = 1.25;

  const totalScoreA = pointLogs.filter(l => l.scorer === 'A').length;
  const totalScoreB = pointLogs.filter(l => l.scorer === 'B').length;
  const scoreDiff = Math.abs(totalScoreA - totalScoreB);
  const m_pd = 1 + 0.5 * tanh((scoreDiff - 5) / 10);

  const winner = team1Wins > team2Wins ? 'A' : 'B';

  const longRallies = pointLogs.filter(l => l.duration >= 30);
  let enduranceVal = 0.5;
  if (longRallies.length > 0) {
      const wins = longRallies.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;
      enduranceVal = wins / longRallies.length;
  }

  const clutchLogs = pointLogs.filter(l => l.scoreA >= 20 && l.scoreB >= 20);
  let clutchVal = 0.5;
  if (clutchLogs.length > 0) {
    const wins = clutchLogs.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;
    clutchVal = wins / clutchLogs.length;
  }

  const shortRallies = pointLogs.filter(l => l.duration < 30);
  let tempoVal = 0.5;
  if (shortRallies.length > 0) {
      const wins = shortRallies.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length;
      tempoVal = wins / shortRallies.length;
  }

  const set1Logs = pointLogs.filter(l => l.setIndex === 1);
  const lastSetLogs = pointLogs.filter(l => l.setIndex === Math.max(...pointLogs.map(p=>p.setIndex)));
  const getWinRate = (logs: PointLog[]) => logs.length ? logs.filter(l => (winner === 'A' ? l.scorer === 'A' : l.scorer === 'B')).length / logs.length : 0;
  const focusVal = Math.max(0, getWinRate(lastSetLogs) - getWinRate(set1Logs) + 0.5);

  const comVal = 0.5;
  const consVal = 0.5;

  const { CLUTCH, COM, CONS, ENDURANCE, FOCUS, TEMPO } = RMR_CONSTANTS.FLOW_WEIGHTS;
  const flowScore =
      (clutchVal * CLUTCH) + (comVal * COM) + (consVal * CONS) +
      (enduranceVal * ENDURANCE) + (focusVal * FOCUS) + (tempoVal * TEMPO);

  const m_flow = 1.0 + flowScore;
  const integrity = isAbnormal ? 0.7 : 1.0;
  const m_total = ((0.3 * m_set) + (0.2 * m_pd) + (0.5 * m_flow)) * integrity;

  const E_A = calculateExpectedScore(playerA.rmr, playerB.rmr);
  const vol_A = calculateVolatility(playerA.rd);
  const vol_B = calculateVolatility(playerB.rd);

  const m_winner = m_total;
  const m_loser = 2.0 - m_winner;

  let rmrChangeA, rmrChangeB;

  if (winner === 'A') {
      rmrChangeA = (vol_A * m_winner) * (1 - E_A);
      rmrChangeB = (vol_B * m_loser) * (0 - (1 - E_A));
  } else {
      rmrChangeA = (vol_A * m_loser) * (0 - E_A);
      rmrChangeB = (vol_B * m_winner) * (1 - (1 - E_A));
  }

  return {
    newRMR_A: Math.round(playerA.rmr + rmrChangeA),
    newRMR_B: Math.round(playerB.rmr + rmrChangeB),
    // 기존의 단순 5% 차감 로직을 버리고, 상대방의 RD를 가중치로 사용하는 동적 차감 로직 적용
    newRD_A: calculateDynamicNewRD(playerA.rd, playerB.rd),
    newRD_B: calculateDynamicNewRD(playerB.rd, playerA.rd),
    analysis: {
      m_total, m_set, m_pd, m_flow,
      flowDetails: { clutch: clutchVal, com: comVal, cons: consVal, endurance: enduranceVal, focus: focusVal, tempo: tempoVal }
    }
  };
};