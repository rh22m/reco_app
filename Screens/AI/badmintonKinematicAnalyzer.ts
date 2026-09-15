import type { CourtCalibration, PoseLandmark, PoseSnapshot } from './badmintonAiEvaluator';

export type CourtArea =
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'MID_LEFT'
  | 'MID_RIGHT'
  | 'BACK_LEFT'
  | 'BACK_RIGHT'
  | 'CENTER'
  | 'UNKNOWN';

export type FootworkMetrics = {
  footworkScore: number;
  detectedStepCount: number;
  averageRecoveryMs: number;
  splitStepRate: number;
  zoneCoverage: number;
  movementPattern: CourtArea[];
  footworkDetail: string;
};

export type SwingPhase = {
  startTs: number;
  impactTs: number;
  followThroughTs: number;
  peakSpeed: number;
};

export type SwingMetrics = {
  swingScore: number;
  racketReadyScore: number;
  connectionScore: number;
  swingPhaseCount: number;
  phases: SwingPhase[];
  swingDetail: string;
};

export type CourtMetrics = {
  courtScore: number;
  playerScore: number;
  normalizedPositions: Array<{ ts: number; x: number; y: number; zone: CourtArea }>;
  frontMidBackPattern: string[];
  courtDetail: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function distance(a?: PoseLandmark, b?: PoseLandmark) {
  if (!a || !b) return 0;
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

function visible(point?: PoseLandmark, minVisibility = 0.35) {
  return !!point && (point.visibility ?? 0) >= minVisibility;
}

// ============================================================================
// ✅ [고도화 추가] 준비 자세 모드: 지수 이동 평균(EMA) 필터
// 정적 모션에서 발생하는 좌표의 미세한 떨림(Jittering)을 보정합니다.
// ============================================================================
export class PointEMAFilter {
  private alpha: number;
  private smoothedPoint: PoseLandmark | null = null;

  constructor(alpha: number = 0.2) {
    this.alpha = alpha;
  }

  public filter(currentPoint?: PoseLandmark): PoseLandmark | undefined {
    if (!currentPoint) return undefined;

    if (!this.smoothedPoint) {
      this.smoothedPoint = { ...currentPoint };
      return this.smoothedPoint;
    }

    this.smoothedPoint.x = this.alpha * currentPoint.x + (1 - this.alpha) * this.smoothedPoint.x;
    this.smoothedPoint.y = this.alpha * currentPoint.y + (1 - this.alpha) * this.smoothedPoint.y;

    if (currentPoint.z !== undefined && this.smoothedPoint.z !== undefined) {
      this.smoothedPoint.z = this.alpha * currentPoint.z + (1 - this.alpha) * this.smoothedPoint.z;
    }

    // 가시성(Visibility)은 최신 프레임의 상태를 그대로 반영
    this.smoothedPoint.visibility = currentPoint.visibility;

    return { ...this.smoothedPoint };
  }
}

/**
 * 전체 스냅샷 배열에 EMA 필터를 적용하여 분석 전 데이터의 노이즈를 제거하는 래퍼 함수
 * 사용법: const smoothedData = smoothSnapshots(rawSnapshots, 0.2);
 */
export function smoothSnapshots(snapshots: PoseSnapshot[], alpha = 0.2): PoseSnapshot[] {
  if (snapshots.length === 0) return [];

  const landmarkKeys = Object.keys(snapshots[0].landmarks);
  const filters: Record<string, PointEMAFilter> = {};

  landmarkKeys.forEach(key => {
    filters[key] = new PointEMAFilter(alpha);
  });

  return snapshots.map(snapshot => {
    const smoothedLandmarks: Record<string, any> = {};
    for (const key of landmarkKeys) {
      const pt = snapshot.landmarks[key];
      const smoothedPt = filters[key].filter(pt);
      if (smoothedPt) {
        smoothedLandmarks[key] = smoothedPt;
      }
    }
    return {
      ...snapshot,
      landmarks: smoothedLandmarks
    };
  });
}
// ============================================================================


// ✅ 사다리꼴 원근감 공식을 단일 모듈로 완벽히 통합 (가로 모드 기반)
export function getPerspectiveZone(landmarks: Record<string, any>): { zone: CourtArea, nx: number, ny: number } {
  const l = landmarks;
  const lAnkle = l.left_ankle;
  const rAnkle = l.right_ankle;
  const lFoot = midpoint(l.left_foot_index, lAnkle) || lAnkle;
  const rFoot = midpoint(l.right_foot_index, rAnkle) || rAnkle;

  let footCenter = midpoint(lFoot, rFoot);

  // 하체가 잘렸을 경우 골반을 기준으로 유추 (Fallback)
  if (!footCenter) {
      const hipMid = midpoint(l.left_hip, l.right_hip);
      if (hipMid) {
          footCenter = { x: hipMid.x, y: clamp(hipMid.y + 0.25, 0, 1), visibility: 1 };
      }
  }

  if (!footCenter) return { zone: 'UNKNOWN', nx: 0.5, ny: 0.5 };

  const x = footCenter.x;
  const y = footCenter.y;

  // 카메라가 플레이어 뒤에 있을 때: 상단(0.30) = 네트(FRONT), 하단(0.95) = 베이스라인(BACK)
  const courtTopY = 0.30;
  const courtBottomY = 0.95;

  let ny = clamp((y - courtTopY) / (courtBottomY - courtTopY), 0, 1);

  // 멀어질수록(위로 갈수록) 좁아지는 원근감 맵핑 적용
  let currentLeft = 0.36 - (0.34 * ny);
  let currentRight = 0.64 + (0.34 * ny);
  let nx = clamp((x - currentLeft) / (currentRight - currentLeft), 0, 1);

  let zone: CourtArea = 'CENTER';

  // 가로 모드 좌표계에 맞게 정상적으로 존 판별
  if (ny < 0.35) {
      zone = nx < 0.5 ? 'FRONT_LEFT' : 'FRONT_RIGHT';
  } else if (ny > 0.70) {
      zone = nx < 0.5 ? 'BACK_LEFT' : 'BACK_RIGHT';
  } else {
      if (nx < 0.35) zone = 'MID_LEFT';
      else if (nx > 0.65) zone = 'MID_RIGHT';
      else zone = 'CENTER';
  }

  return { zone, nx, ny };
}

function frontMidBack(zone: CourtArea) {
  if (zone.startsWith('FRONT')) return 'FRONT';
  if (zone.startsWith('BACK')) return 'BACK';
  if (zone.startsWith('MID') || zone === 'CENTER') return 'MID';
  return 'UNKNOWN';
}

function estimatePlayerScore(snapshot: PoseSnapshot) {
  const required = [
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  ];

  const visibleCount = required.filter(key => visible(snapshot.landmarks[key], 0.35)).length;
  return clamp((visibleCount / required.length) * 100);
}

export function analyzeCourtPosition(snapshots: PoseSnapshot[], courtConfidence = 0.76): CourtMetrics {
  // 1. map() -> filter() 체이닝 대신 배열에 직접 push하여 타입 추론 및 null 에러 완벽 해결
  const normalizedPositions: Array<{ ts: number; x: number; y: number; zone: CourtArea }> = [];

  for (const snapshot of snapshots) {
    const { zone, nx, ny } = getPerspectiveZone(snapshot.landmarks);

    // UNKNOWN이 아닐 때만 배열에 추가 (null이 들어갈 여지를 원천 차단)
    if (zone !== 'UNKNOWN') {
      normalizedPositions.push({
        ts: snapshot.ts,
        x: nx,
        y: ny,
        zone,
      });
    }
  }

  const playerScore = Math.round(avg(snapshots.map(estimatePlayerScore)));
  const courtScore = Math.round(clamp((courtConfidence * 100) * 0.75 + playerScore * 0.25));
  const frontMidBackPattern = normalizedPositions.map(item => frontMidBack(item.zone));
  const uniquePattern = Array.from(new Set(frontMidBackPattern.filter(item => item !== 'UNKNOWN')));

  const courtDetail =
    uniquePattern.length >= 2
      ? '단식 코트 전후좌우를 폭넓게 활용하며 훌륭한 코트 장악력을 보여주고 있습니다.'
      : '움직임이 특정 구역에 편중되어 있어 코트 전체의 넓은 활용도가 다소 아쉽습니다.';

  return {
    courtScore,
    playerScore: Math.round(playerScore || 62),
    normalizedPositions,
    frontMidBackPattern,
    courtDetail,
  };
}

export function analyzeFootwork(snapshots: PoseSnapshot[], events: any[], courtConfidence = 0.76): FootworkMetrics {
  const court = analyzeCourtPosition(snapshots, courtConfidence);
  const positions = court.normalizedPositions;

  if (positions.length < 2) {
    const splitRate = events.length ? events.filter(event => event.splitStepDetected).length / events.length : 0.5;
    const zoneCoverage = new Set(events.map(event => event.zone)).size;
    const footworkScore = Math.round(clamp((zoneCoverage / 7) * 100 * 0.4 + splitRate * 100 * 0.35 + 68 * 0.25));

    return {
      footworkScore,
      detectedStepCount: events.length,
      averageRecoveryMs: 0,
      splitStepRate: splitRate,
      zoneCoverage,
      movementPattern: events.map(event => event.zone ?? 'UNKNOWN'),
      footworkDetail: footworkScore >= 70 ? '준수한 스플릿 스텝과 민첩한 반응성을 보유하고 있습니다.' : '스플릿 스텝 리듬이 불안정하고 첫 반응 속도의 보완이 필요합니다.',
    };
  }

  const movementPattern = positions.map(item => item.zone);
  const uniqueZones = new Set(movementPattern.filter(zone => zone !== 'UNKNOWN'));
  const zoneChanges: number[] = [];

  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i].zone !== positions[i - 1].zone) {
      zoneChanges.push(positions[i].ts);
    }
  }

  const recoverySamples: number[] = [];
  let leftCenterAt = 0;

  for (const position of positions) {
    const isCenter = position.zone === 'CENTER';

    if (!isCenter && !leftCenterAt) {
      leftCenterAt = position.ts;
    }

    if (isCenter && leftCenterAt) {
      recoverySamples.push(position.ts - leftCenterAt);
      leftCenterAt = 0;
    }
  }

  const averageRecoveryMs = Math.round(avg(recoverySamples));
  const recoveryScore = averageRecoveryMs
    ? clamp(100 - ((averageRecoveryMs - 900) / 900) * 48, 42, 100)
    : 66;

  const splitStepCandidates: boolean[] = [];

  for (let i = 1; i < snapshots.length - 1; i += 1) {
    const prev = snapshots[i - 1].landmarks;
    const cur = snapshots[i].landmarks;
    const next = snapshots[i + 1].landmarks;

    const prevAnkleWidth = distance(prev.left_ankle, prev.right_ankle);
    const curAnkleWidth = distance(cur.left_ankle, cur.right_ankle);
    const nextAnkleWidth = distance(next.left_ankle, next.right_ankle);

    const hipPrev = midpoint(prev.left_hip, prev.right_hip);
    const hipCur = midpoint(cur.left_hip, cur.right_hip);
    const hipNext = midpoint(next.left_hip, next.right_hip);

    const stanceExpansion = curAnkleWidth > prevAnkleWidth * 1.06 && curAnkleWidth >= nextAnkleWidth * 0.96;
    const smallHop = !!hipPrev && !!hipCur && !!hipNext && hipCur.y < hipPrev.y - 0.008 && hipNext.y >= hipCur.y;

    splitStepCandidates.push(stanceExpansion || smallHop);
  }

  const splitStepRate = splitStepCandidates.length
    ? splitStepCandidates.filter(Boolean).length / splitStepCandidates.length
    : 0.5;

  const coverageScore = clamp((uniqueZones.size / 7) * 100, 35, 100);
  const changeScore = clamp((zoneChanges.length / Math.max(1, snapshots.length - 1)) * 240, 35, 100);
  const footworkScore = Math.round(coverageScore * 0.28 + recoveryScore * 0.34 + splitStepRate * 100 * 0.25 + changeScore * 0.13);

  const footworkDetail =
    footworkScore >= 75
      ? '스플릿 스텝 타이밍이 적절하며, 타구 직후 홈 포지션으로 되돌아오는 리커버리 속도와 탄력이 매우 뛰어납니다.'
      : '스플릿 스텝이 누락되거나 중앙 복귀가 다소 지연되어, 연속 공격 방어 시 취약한 틈이 발생하고 있습니다.';

  return {
    footworkScore,
    detectedStepCount: zoneChanges.length,
    averageRecoveryMs,
    splitStepRate,
    zoneCoverage: uniqueZones.size,
    movementPattern,
    footworkDetail,
  };
}

function wristPoint(snapshot: PoseSnapshot) {
  const l = snapshot.landmarks;
  const left = l.left_wrist;
  const right = l.right_wrist;

  if (visible(left) && visible(right)) {
    return (left!.y < right!.y) ? left : right;
  }

  return visible(left) ? left : right;
}

function dominantShoulder(snapshot: PoseSnapshot) {
  const l = snapshot.landmarks;
  const wrist = wristPoint(snapshot);
  if (!wrist) return l.right_shoulder ?? l.left_shoulder;

  const leftDistance = distance(wrist, l.left_shoulder);
  const rightDistance = distance(wrist, l.right_shoulder);

  return rightDistance <= leftDistance ? l.right_shoulder : l.left_shoulder;
}

export function analyzeSwing(snapshots: PoseSnapshot[], footwork: FootworkMetrics): SwingMetrics {
  if (snapshots.length < 3) {
    return {
      swingScore: 68,
      racketReadyScore: 64,
      connectionScore: 62,
      swingPhaseCount: 0,
      phases: [],
      swingDetail: '풋워크와 스윙 동작이 분리되는 경향이 있습니다. 이동과 동시에 라켓을 준비하는 훈련이 필요합니다.',
    };
  }

  const wristSpeeds: Array<{ ts: number; speed: number }> = [];
  const racketReadyScores: number[] = [];

  for (let i = 1; i < snapshots.length; i += 1) {
    const prevWrist = wristPoint(snapshots[i - 1]);
    const curWrist = wristPoint(snapshots[i]);
    const dt = Math.max(1, snapshots[i].ts - snapshots[i - 1].ts);
    const speed = distance(prevWrist, curWrist) / dt * 1000;
    wristSpeeds.push({ ts: snapshots[i].ts, speed });

    const l = snapshots[i].landmarks;
    const wrist = curWrist;
    const shoulder = dominantShoulder(snapshots[i]);
    const shoulderMid = midpoint(l.left_shoulder, l.right_shoulder);

    const readyHeight =
      wrist && (shoulder ?? shoulderMid)
        ? clamp(((shoulder ?? shoulderMid)!.y - wrist.y + 0.08) * 240, 35, 100)
        : 62;

    racketReadyScores.push(readyHeight);
  }

  const speedAvg = avg(wristSpeeds.map(item => item.speed));
  const speedStd = Math.sqrt(avg(wristSpeeds.map(item => Math.pow(item.speed - speedAvg, 2))));
  const threshold = Math.max(0.08, speedAvg + speedStd * 0.75);

  const phases: SwingPhase[] = [];
  let i = 1;

  while (i < wristSpeeds.length - 1) {
    const current = wristSpeeds[i];

    if (current.speed >= threshold && current.speed >= wristSpeeds[i - 1].speed && current.speed >= wristSpeeds[i + 1].speed) {
      let startIndex = i;
      while (startIndex > 0 && wristSpeeds[startIndex].speed > threshold * 0.45) {
        startIndex -= 1;
      }

      let followIndex = i;
      while (followIndex < wristSpeeds.length - 1 && wristSpeeds[followIndex].speed > threshold * 0.42) {
        followIndex += 1;
      }

      phases.push({
        startTs: wristSpeeds[startIndex].ts,
        impactTs: current.ts,
        followThroughTs: wristSpeeds[followIndex].ts,
        peakSpeed: current.speed,
      });

      i = followIndex + 2;
    } else {
      i += 1;
    }
  }

  const racketReadyScore = Math.round(avg(racketReadyScores));
  const swingPowerScore = clamp((avg(phases.map(phase => phase.peakSpeed)) || speedAvg) * 520, 35, 100);

  const connectionSamples = phases.map(phase => {
    const nearestMovementTs = footwork.movementPattern.length ? phase.startTs : phase.impactTs;
    const delay = Math.abs(phase.startTs - nearestMovementTs);
    return clamp(100 - Math.max(0, delay - 450) / 7, 40, 100);
  });

  const connectionScore = Math.round(connectionSamples.length ? avg(connectionSamples) : racketReadyScore * 0.8);
  const phaseScore = clamp((phases.length / Math.max(1, snapshots.length / 16)) * 100, 38, 100);
  const swingScore = Math.round(racketReadyScore * 0.36 + swingPowerScore * 0.28 + connectionScore * 0.24 + phaseScore * 0.12);

  const swingDetail =
    swingScore >= 75
      ? '이동 중에도 라켓이 충분히 들려있어 타구 준비가 빠르며, 풋워크와 스윙 동작이 물 흐르듯 매끄럽게 연결됩니다.'
      : '스텝 이동 시 라켓이 아래로 쳐져 있어 백스윙 시작이 늦어지며, 이동 동작과 스윙 동작이 다소 끊어지는 경향이 있습니다.';

  return {
    swingScore,
    racketReadyScore,
    connectionScore,
    swingPhaseCount: phases.length,
    phases,
    swingDetail,
  };
}