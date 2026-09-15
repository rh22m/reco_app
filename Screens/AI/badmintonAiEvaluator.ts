import {
  analyzeCourtPosition,
  analyzeFootwork,
  analyzeSwing,
} from './badmintonKinematicAnalyzer';

export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type CourtCalibration = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  serviceY: number;
  confidence: number;
};

export type PoseSnapshot = {
  ts: number;
  landmarks: Partial<Record<string, PoseLandmark>>;
  court: CourtCalibration;
};

export type AiFootworkEvaluation = {
  totalScore: number;
  postureScore: number;
  footworkScore: number;
  swingScore: number;
  courtScore: number;
  playerScore: number;
  detectedStepCount: number;
  strengths: string[];
  weaknesses: string[];
  overall: string;
  postureDetail: string;
  footworkDetail: string;
  swingDetail: string;
  proComparison: string;
  recommendedDrill: string;
};

const PRO_REFERENCE = {
  readyKneeAngle: { min: 105, max: 145 },
  lungeKneeAngle: { min: 80, max: 125 },
  trunkLean: { min: 8, max: 26 },
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function angle(a?: PoseLandmark, b?: PoseLandmark, c?: PoseLandmark) {
  if (!a || !b || !c) return undefined;

  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLen = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const cbLen = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  if (!abLen || !cbLen) return undefined;

  const cos = Math.max(-1, Math.min(1, dot / (abLen * cbLen)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function distance(a?: PoseLandmark, b?: PoseLandmark) {
  if (!a || !b) return undefined;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a?: PoseLandmark, b?: PoseLandmark): PoseLandmark | undefined {
  if (!a || !b) return undefined;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function rangeScore(value: number | undefined, min: number, max: number) {
  if (value === undefined || Number.isNaN(value)) return 62;
  if (value >= min && value <= max) return 100;

  const center = (min + max) / 2;
  const width = (max - min) / 2;
  const diff = Math.abs(value - center) - width;

  return clamp(100 - diff * 2.2, 35, 100);
}

function playerVisibilityScore(snapshot: PoseSnapshot) {
  const required = [
    'left_shoulder',
    'right_shoulder',
    'left_hip',
    'right_hip',
    'left_knee',
    'right_knee',
    'left_ankle',
    'right_ankle',
  ];

  const visible = required.filter(key => (snapshot.landmarks[key]?.visibility ?? 0) >= 0.45).length;
  return clamp((visible / required.length) * 100);
}

// ============================================================================
// ✅ [고도화 추가] 스윙/랠리 모드: 신뢰도(Visibility) 기반 이상치 제거 및 선형 보간
// 고속 스윙 시 모션 블러로 인해 좌표가 튀는 현상을 막고 빈 프레임을 자연스럽게 채웁니다.
// ============================================================================
function applyConfidenceFilter(snapshots: PoseSnapshot[], threshold = 0.5): PoseSnapshot[] {
  if (!snapshots.length) return snapshots;

  // 원본 데이터를 훼손하지 않기 위해 깊은 복사 수행
  const filtered = snapshots.map(s => ({
    ...s,
    landmarks: { ...s.landmarks }
  }));

  // 전체 스냅샷에 존재하는 모든 랜드마크 키 수집
  const allKeys = new Set<string>();
  filtered.forEach(s => Object.keys(s.landmarks).forEach(k => allKeys.add(k)));

  for (const key of allKeys) {
    let lastValidIdx = -1;

    for (let i = 0; i < filtered.length; i++) {
      const lm = filtered[i].landmarks[key];
      const isVisible = lm && (lm.visibility ?? 1) >= threshold;

      if (isVisible) {
        lastValidIdx = i;
      } else {
        // 현재 프레임의 신뢰도가 낮을 경우, 미래의 유효한 프레임(nextValidIdx) 탐색
        let nextValidIdx = -1;
        for (let j = i + 1; j < filtered.length; j++) {
          const nextLm = filtered[j].landmarks[key];
          if (nextLm && (nextLm.visibility ?? 1) >= threshold) {
            nextValidIdx = j;
            break;
          }
        }

        if (lastValidIdx !== -1 && nextValidIdx !== -1) {
          // 과거와 미래의 유효한 값이 모두 존재하면 Timestamp 기반 선형 보간(Linear Interpolation) 수행
          const prev = filtered[lastValidIdx];
          const next = filtered[nextValidIdx];
          const prevLm = prev.landmarks[key]!;
          const nextLm = next.landmarks[key]!;

          const t0 = prev.ts;
          const t1 = next.ts;
          const t = filtered[i].ts;
          const ratio = t1 === t0 ? 0 : (t - t0) / (t1 - t0);

          filtered[i].landmarks[key] = {
            x: prevLm.x + (nextLm.x - prevLm.x) * ratio,
            y: prevLm.y + (nextLm.y - prevLm.y) * ratio,
            z: (prevLm.z !== undefined && nextLm.z !== undefined)
              ? prevLm.z + (nextLm.z - prevLm.z) * ratio
              : undefined,
            visibility: lm?.visibility // 보간된 값이므로 원본의 낮은 visibility 유지 (후속 연산 참고용)
          };
        } else if (lastValidIdx !== -1) {
          // 미래 값이 없으면 과거의 유효한 좌표로 고정 (Fallback)
          filtered[i].landmarks[key] = { ...filtered[lastValidIdx].landmarks[key]!, visibility: lm?.visibility };
        } else if (nextValidIdx !== -1) {
          // 과거 값이 없으면 미래의 유효한 좌표로 당겨옴
          filtered[i].landmarks[key] = { ...filtered[nextValidIdx].landmarks[key]!, visibility: lm?.visibility };
        }
      }
    }
  }

  return filtered;
}
// ============================================================================

function estimatePostureScore(snapshots: PoseSnapshot[]) {
  const kneeScores: number[] = [];
  const trunkScores: number[] = [];
  const balanceScores: number[] = [];
  const visibilityScores: number[] = [];

  for (const snapshot of snapshots) {
    const l = snapshot.landmarks;
    const leftKnee = angle(l.left_hip, l.left_knee, l.left_ankle);
    const rightKnee = angle(l.right_hip, l.right_knee, l.right_ankle);
    const kneeMin = Math.min(leftKnee ?? 180, rightKnee ?? 180);

    const shoulderMid = midpoint(l.left_shoulder, l.right_shoulder);
    const hipMid = midpoint(l.left_hip, l.right_hip);

    let trunkLean = 15;
    if (shoulderMid && hipMid) {
      const dx = Math.abs(shoulderMid.x - hipMid.x);
      const dy = Math.abs(shoulderMid.y - hipMid.y);
      trunkLean = (Math.atan2(dx, Math.max(0.001, dy)) * 180) / Math.PI;
    }

    const ankleWidth = distance(l.left_ankle, l.right_ankle) ?? 0.18;
    const shoulderWidth = distance(l.left_shoulder, l.right_shoulder) ?? 0.18;
    const stanceRatio = ankleWidth / Math.max(0.001, shoulderWidth);
    const balanceScore = clamp(100 - Math.abs(stanceRatio - 1.35) * 35, 45, 100);

    kneeScores.push(
      Math.max(
        rangeScore(kneeMin, PRO_REFERENCE.readyKneeAngle.min, PRO_REFERENCE.readyKneeAngle.max),
        rangeScore(kneeMin, PRO_REFERENCE.lungeKneeAngle.min, PRO_REFERENCE.lungeKneeAngle.max),
      ),
    );
    trunkScores.push(rangeScore(trunkLean, PRO_REFERENCE.trunkLean.min, PRO_REFERENCE.trunkLean.max));
    balanceScores.push(balanceScore);
    visibilityScores.push(playerVisibilityScore(snapshot));
  }

  return {
    postureScore: Math.round(avg(kneeScores) * 0.38 + avg(trunkScores) * 0.25 + avg(balanceScores) * 0.22 + avg(visibilityScores) * 0.15),
    playerScore: Math.round(avg(visibilityScores)),
  };
}

function fallbackPostureScore(events: any[]) {
  if (!events.length) return 65;

  const balanceAvg = avg(
    events
      .map(event => event.balanceScore)
      .filter((value): value is number => typeof value === 'number'),
  );

  return Math.round(clamp(balanceAvg || 70));
}

export function evaluateBadmintonAiSet(params: {
  snapshots?: PoseSnapshot[];
  events?: any[];
  courtConfidence?: number;
}): AiFootworkEvaluation {
  // ✅ 파이프라인 진입 직전, 신뢰도 기반 필터링(보간)을 우선 적용하여 노이즈 제거
  const rawSnapshots = params.snapshots ?? [];
  const snapshots = applyConfidenceFilter(rawSnapshots, 0.5);

  const events = params.events ?? [];
  const courtConfidence = params.courtConfidence ?? 0.76;

  const posture = estimatePostureScore(snapshots);
  const court = analyzeCourtPosition(snapshots, courtConfidence);
  const footwork = analyzeFootwork(snapshots, events, courtConfidence);
  const swing = analyzeSwing(snapshots, footwork);

  const postureScore = snapshots.length ? posture.postureScore : fallbackPostureScore(events);
  const playerScore = snapshots.length ? posture.playerScore : court.playerScore;

  const totalScore = Math.round(
    postureScore * 0.26 +
      footwork.footworkScore * 0.34 +
      swing.swingScore * 0.25 +
      court.courtScore * 0.15,
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (postureScore >= 78) strengths.push('준비 자세와 중심 유지가 안정적입니다.');
  else weaknesses.push('준비 자세가 높아지는 구간이 있어 첫 출발이 늦어질 수 있습니다.');

  if (footwork.footworkScore >= 78) strengths.push('양발 이동, 중앙 복귀, 스플릿스텝 흐름이 안정적입니다.');
  else weaknesses.push('중앙 복귀 속도와 스플릿스텝 타이밍을 더 일정하게 만들어야 합니다.');

  if (swing.swingScore >= 78) strengths.push('어깨-팔꿈치-손목 흐름과 이동 후 스윙 연결성이 좋은 편입니다.');
  else weaknesses.push('이동 중 라켓 준비가 늦어져 스윙 시작 타이밍이 밀릴 수 있습니다.');

  if (court.courtScore >= 78) strengths.push('코트 기준 위치 정규화와 전후좌우 이동 패턴이 비교적 명확합니다.');
  else weaknesses.push('단식 반면 전체와 선수 전신이 화면 안에 더 안정적으로 들어오도록 촬영 구도를 조정해야 합니다.');

  const overall =
    totalScore >= 85
      ? '프로 선수 기준에 가까운 안정적인 경기 흐름입니다. 낮은 중심, 빠른 중앙 복귀, 이동 후 스윙 준비가 잘 연결됩니다.'
      : totalScore >= 70
        ? '전체적인 경기 흐름은 좋지만 프로 선수들과 비교하면 중앙 복귀 후 라켓 준비와 스플릿스텝 타이밍의 일관성이 더 필요합니다.'
        : '현재는 풋워크, 중앙 복귀, 스윙 준비가 분리되는 경향이 있습니다. 먼저 코트 중앙 복귀와 라켓 준비 동작을 함께 묶는 연습이 필요합니다.';

  const postureDetail =
    postureScore >= 75
      ? '기동 중에도 무릎 굽힘과 상체 기울기가 적절히 유지되며, 타구 후 착지 시 하체 밸런스가 매우 단단하게 고정되어 있습니다.'
      : '이동 시 상체가 과도하게 세워지거나 무릎이 펴지는 경향이 있습니다. 빠른 공수 전환을 위해 전반적인 무게 중심을 더 낮게 유지해야 합니다.';

  const footworkDetail = footwork.footworkDetail;
  const swingDetail = swing.swingDetail;

  const proComparison =
    totalScore >= 75
      ? '프로 선수의 실전 역학 데이터와 비교했을 때, 무게 중심의 안정성과 공수 전환의 리듬감이 매우 유사한 훌륭한 수준입니다.'
      : '프로 선수의 기동 패턴과 비교 시, 이동 전 스플릿 스텝을 통한 사전 준비와 이동 후 즉각적인 홈 포지션 회귀 능력을 가장 먼저 보완해야 합니다.';

  const recommendedDrill =
    footwork.footworkScore < 72
      ? '랜덤 6코너 풋워크 20초 x 5세트 후, 매 이동마다 중앙 복귀를 강제하세요.'
      : swing.connectionScore < 72
        ? '4코너 풋워크에 라켓 준비 동작을 결합해 이동 직후 바로 스윙 준비 자세를 만드는 연습을 하세요.'
        : postureScore < 72
          ? '낮은 준비 자세 유지 30초 + 런지 정지 2초 드릴을 반복하세요.'
          : '4코너 풋워크에 스윙 준비 동작을 결합해 20초 x 5세트 수행하세요.';

  return {
    totalScore,
    postureScore,
    footworkScore: footwork.footworkScore,
    swingScore: swing.swingScore,
    courtScore: court.courtScore,
    playerScore,
    detectedStepCount: footwork.detectedStepCount,
    strengths,
    weaknesses,
    overall,
    postureDetail,
    footworkDetail,
    swingDetail,
    proComparison,
    recommendedDrill,
  };
}