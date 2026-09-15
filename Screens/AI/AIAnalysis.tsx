// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  StatusBar,
  Alert,
  Animated,
  Vibration,
  ScrollView,
  Modal,
  Image,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import {
  Bot, Activity, Move, Zap, RefreshCcw, Square, Clock,
  CheckCircle, XCircle, Dumbbell, Play, Trash2, FileText,
  Smartphone, User, Eye, HelpCircle, Info, X,
  ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight,
  Circle, RotateCw, BarChart2, Award, Video, Music, Flame, Compass, ChevronRight
} from 'lucide-react-native';
import { htmlContent } from './poseHtml';
import RealtimeFootworkMode from './RealtimeFootworkMode';

import { getFirestore, collection, addDoc, serverTimestamp, query, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';

// ---------------- [설정값] ----------------
const ANALYSIS_DURATION = 20;
const FOOTWORK_DURATION = 60;
const RHYTHM_DURATION = 30;
const SPEED_BUFFER_SIZE = 3;
const USER_HEIGHT_CM = 175;
const ARM_LENGTH_RATIO = 0.45;
const PIXEL_TO_REAL_SCALE = (USER_HEIGHT_CM * ARM_LENGTH_RATIO) / 200;

const MIN_SWING_DISTANCE_PX = 0.15;
const SWING_TRIGGER_SPEED = 25;

// ============================================================================
// ✅ [고도화 추가] 카메라 원근감 왜곡 보정을 위한 호모그래피 투영 변환 함수 및 행렬
// 스마트폰 거치대(약 1.5m~2m 높이)에서 코트를 바라볼 때의 표준 원근 왜곡을 보정합니다.
// ============================================================================
const DEFAULT_HOMOGRAPHY_MATRIX = [
  [ 2.5,  0.0, -0.5 ],
  [ 0.0,  3.0, -0.8 ],
  [ 0.0,  0.5,  1.0 ]
];

function applyHomography(cameraX: number, cameraY: number) {
  const H = DEFAULT_HOMOGRAPHY_MATRIX;
  const w = H[2][0] * cameraX + H[2][1] * cameraY + H[2][2];
  if (w === 0) return { courtX: cameraX, courtY: cameraY };
  return {
    courtX: (H[0][0] * cameraX + H[0][1] * cameraY + H[0][2]) / w,
    courtY: (H[1][0] * cameraX + H[1][1] * cameraY + H[1][2]) / w
  };
}
// ============================================================================

export type AnalysisMode = 'SWING' | 'LUNGE' | 'FOOTWORK' | 'RHYTHM' | 'REALTIME_MATCH';
type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'FULL MATCH';
type FootworkDirection = 'CENTER' | 'FRONT_LEFT' | 'FRONT_RIGHT' | 'BACK_LEFT' | 'BACK_RIGHT';

interface ResultData {
  value: number;
  subValue?: number;
  isGood: boolean;
  type: AnalysisMode;
  grade?: string;
  score?: number;
  unit?: string;
}

export interface AnalysisReport {
  id: string;
  docId?: string;
  date: string;
  mode: AnalysisMode;
  avgScore: number;
  pros: string[];
  cons: string[];
  training: string;
  totalCount: number;
  maxRecord: number;
  difficulty?: Difficulty;
  durationSec?: number;
  averageRecoveryMs?: number;
  courtCoveragePct?: number;
  postureScore?: number;
  aiEvaluation?: any;
}

export interface StyleRecord {
  id: string;
  date: string;
  styleId: string;
  name: string;
  title: string;
  image: any;
}

const formatYMD = (dateStr: string) => {
  if (!dateStr) return '';
  let match = dateStr.match(/(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/);
  if (match) return `${match[1]}. ${match[2]}. ${match[3]}.`;

  match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}. ${match[1]}. ${match[2]}.`;

  return dateStr.split(',')[0].replace(/(오전|오후).*/, '').trim();
};

const RHYTHM_BEATMAP = [
  { id: 1, time: 2000, type: 'SMASH', color: '#EF4444', targetX: 0.8, targetY: 0.2 },
  { id: 2, time: 4500, type: 'UNDER', color: '#3B82F6', targetX: 0.2, targetY: 0.8 },
  { id: 3, time: 6000, type: 'UNDER', color: '#3B82F6', targetX: 0.8, targetY: 0.8 },
  { id: 4, time: 8500, type: 'CLEAR', color: '#10B981', targetX: 0.5, targetY: 0.1 },
  { id: 5, time: 11000, type: 'SMASH', color: '#EF4444', targetX: 0.2, targetY: 0.2 },
  { id: 6, time: 13000, type: 'DRIVE', color: '#3B82F6', targetX: 0.8, targetY: 0.5 },
  { id: 7, time: 15500, type: 'CLEAR', color: '#10B981', targetX: 0.2, targetY: 0.3 },
  { id: 8, time: 18000, type: 'SMASH', color: '#EF4444', targetX: 0.7, targetY: 0.2 },
  { id: 9, time: 20500, type: 'UNDER', color: '#3B82F6', targetX: 0.3, targetY: 0.8 },
  { id: 10, time: 23000, type: 'SMASH', color: '#EF4444', targetX: 0.5, targetY: 0.2 },
  { id: 11, time: 25500, type: 'DRIVE', color: '#3B82F6', targetX: 0.2, targetY: 0.5 },
  { id: 12, time: 28000, type: 'CLEAR', color: '#10B981', targetX: 0.8, targetY: 0.2 },
];

const PLAYER_STYLES = {
  POWER: {
    name: '정재성 스타일',
    title: '코트를 찢는 폭발적인 파워 스매셔',
    desc: '압도적인 피지컬과 강력한 파워로 후위에서 상대를 억압하는 스타일입니다. 강한 스윙 파워를 바탕으로 공격의 주도권을 쥐는 데 능숙합니다.',
    stats: { power: 95, agility: 70, defense: 80, tech: 75 },
    video: { title: '대한민국 배드민턴 스매시의 상징', url: 'https://youtu.be/V8Doavdkz9w' },
    image: require('../../assets/images/player/chung.png')
  },
  SPEED: {
    name: '이용대 스타일',
    title: '전위의 지배자 & 철벽 수비',
    desc: '뛰어난 반사신경과 탄탄한 수비력으로 상대의 공격을 무력화시킵니다. 민첩한 풋워크를 바탕으로 네트 앞 플레이에서 강점을 보입니다.',
    stats: { power: 75, agility: 95, defense: 90, tech: 85 },
    video: { title: '전위 플레이의 교과서', url: 'https://youtu.be/LlvsJkdQAXg' },
    image: require('../../assets/images/player/lee.png')
  },
  ALL_ROUND: {
    name: '빅토르 악셀센 스타일',
    title: '코트를 지배하는 무결점 올라운더',
    desc: '공수 밸런스가 완벽하며, 안정적인 자세와 넓은 커버리지로 경기를 압도합니다. 어떤 상황에서도 흔들리지 않는 멘탈과 기본기가 강점입니다.',
    stats: { power: 85, agility: 85, defense: 85, tech: 90 },
    video: { title: '빅토르 악셀센 다시 봐야 할 순간들!', url: 'https://youtu.be/PXvJFTW7h5I' },
    image: require('../../assets/images/player/vic.png')
  },
  TECH: {
    name: '안세영 스타일',
    title: '지치지 않는 끈기와 강철 체력',
    desc: '탄탄한 기본기와 강인한 체력, 흔들리지 않는 코어 힘으로 랠리를 길게 가져가며 상대를 지치게 만드는 끈질긴 승부사입니다.',
    stats: { power: 70, agility: 85, defense: 95, tech: 90 },
    video: { title: '안세영 배드민턴 여자단식 세계랭킹 1위 선수의 경이로운 랠리 모음', url: 'https://youtu.be/NMevb777YTc' },
    image: require('../../assets/images/player/an.png')
  }
};

const SURVEY_QUESTIONS = [
  {
    q: "찬스 상황이 왔을 때 나의 선택은?",
    options: [
      { text: "A. 강력하고 시원한 스매시로 끝낸다", type: "POWER" },
      { text: "B. 상대의 빈 곳을 찌르는 정교한 푸시/드롭", type: "TECH" }
    ]
  },
  {
    q: "위기 상황일 때 나의 대처법은?",
    options: [
      { text: "A. 높고 멀리 클리어를 쳐서 시간을 번다", type: "DEFENSE" },
      { text: "B. 빠르고 낮게 드라이브로 맞불을 놓는다", type: "SPEED" }
    ]
  }
];

const MODE_DETAILS = {
  SWING: {
    title: '스윙 정밀 분석',
    scoreCriteria: [
      { label: '속도', pct: '30%', desc: '임팩트 순간의 라켓 헤드 가속도' },
      { label: '회전력', pct: '20%', desc: '상하체 꼬임 각도' },
      { label: '자세', pct: '20%', desc: '팔꿈치 각도 및 폼의 정확성' },
      { label: '타점', pct: '15%', desc: '신장 대비 타격 높이 효율' },
      { label: '체중이동', pct: '15%', desc: '타격 시 중심 이동량' },
    ],
    analysisElements: ['최고 속도 (km/h)', '코어 회전', '임팩트 팔꿈치 각도', '타점 높이'],
    gradeCriteria: [
      { grade: 'SS', value: '140km/h ↑', desc: '선수급 파워' },
      { grade: 'S', value: '110km/h ↑', desc: '상급 동호인' },
      { grade: 'A', value: '90km/h ↑', desc: '중급 동호인' },
      { grade: 'B', value: '60km/h ↑', desc: '초급 / 입문' },
    ],
    tips: ['카메라를 측면(3~4m 거리)에 설치하세요.', '전신이 화면에 모두 들어와야 정확합니다.', '배경이 복잡하지 않은 곳이 좋습니다.']
  },
  LUNGE: {
    title: '준비 자세 안정성',
    scoreCriteria: [
      { label: '유지시간', pct: '40%', desc: '자세를 무너뜨리지 않고 버틴 시간' },
      { label: '자세안정', pct: '30%', desc: '무릎 굽힘 유지력' },
      { label: '시선처리', pct: '30%', desc: '머리의 상하좌우 흔들림' },
    ],
    analysisElements: ['최대 버티기 시간 (초)', '무릎 각도 변화 추이', '시선 고정 여부'],
    gradeCriteria: [
      { grade: 'S', value: '45초 ↑', desc: '철벽 수비' },
      { grade: 'A', value: '30초 ↑', desc: '안정적' },
      { grade: 'B', value: '15초 ↑', desc: '기초 체력 필요' },
    ],
    tips: ['정면 혹은 45도 측면에서 촬영하세요.', '라켓을 들고 실제 수비 자세를 취하세요.', '무릎이 발끝을 넘지 않도록 주의하세요.']
  },
  FOOTWORK: {
    title: '풋워크 민첩성',
    scoreCriteria: [
      { label: '반응속도', pct: '60%', desc: '지시 후 첫 발을 떼는 시간' },
      { label: '정확도', pct: '40%', desc: '지시된 방향으로 정확히 이동했는지' },
    ],
    analysisElements: ['평균 반응 속도 (초)', '스텝 성공 횟수', '콤보(연속 성공)'],
    gradeCriteria: [
      { grade: 'PERFECT', value: '0.8초 ↓', desc: '국가대표급 반사신경' },
      { grade: 'GOOD', value: '1.2초 ↓', desc: '일반적인 반응 속도' },
    ],
    tips: ['중앙 원 안에서 시작하세요.', '스텝 후 반드시 중앙으로 복귀해야 합니다.', 'Hard 모드는 스윙 동작까지 해야 인정됩니다.'],
    difficultyGuide: ['🟢 EASY: 1초 간격 (정확한 스텝 연습)', '🔵 NORMAL: 0.5초 간격 (실전 랠리 속도)', '🔴 HARD: 0.2초 간격 + 스윙 동작 필수']
  },
  RHYTHM: {
    title: '나와의 랠리 (리듬 섀도우)',
    scoreCriteria: [
      { label: '타이밍', pct: '40%', desc: '궤적에 맞춘 정확한 임팩트 (Perfect/Great)' },
      { label: '관절각도', pct: '30%', desc: '스매시, 언더 등 상황에 맞는 폼 유지' },
      { label: '체력유지', pct: '30%', desc: '랠리 후반부 자세 붕괴 방어력' }
    ],
    analysisElements: ['노트별 타이밍 판정 (Combo)', '공수 전환 시 코어 안정성', '스윙 궤적의 일관성', '체력 저하에 따른 폼 붕괴 시점'],
    gradeCriteria: [
      { grade: 'SS', value: 'Full Combo', desc: '무결점 완벽한 랠리' },
      { grade: 'S', value: '80% ↑', desc: '뛰어난 리듬감과 자세' },
      { grade: 'A', value: '60% ↑', desc: '안정적인 섀도우 폼' },
      { grade: 'B', value: '40% ↓', desc: '타이밍 및 폼 교정 필요' },
    ],
    tips: [
      '화면에 표시되는 네온 서클의 타이밍에 맞춰 자세를 취하세요.',
      '🔴 빨간색(스매시), 🔵 파란색(언더), 🟢 초록색(클리어) 동작입니다.',
      '동작 후에는 항상 준비 자세(Ready)로 빠르게 복귀하세요.',
      '종료 후 폼이 무너진 근본적인 원인을 AI가 진단해 드립니다.'
    ],
    difficultyGuide: ['🟢 EASY: 여유로운 랠리 템포', '🔵 NORMAL: 실전과 유사한 공수 전환', '🔴 HARD: 빠른 템포의 연속 스매시/드라이브 방어']
  },
  REALTIME_MATCH: {
    title: '실전 랠리 (반코트)',
    scoreCriteria: [],
    analysisElements: [],
    gradeCriteria: [],
    tips: [],
    difficultyGuide: []
  }
};

const GENERAL_GUIDE_DATA = [
  { mode: 'SWING', title: '스윙 정밀 분석', icon: <Zap size={24} color="#F472B6" />, desc: ['최고 속도(km/h)와 폼의 정확도를 측정합니다.', '분석 지표: 상하체 회전차, 타점 높이, 체중 이동', '임팩트 시 팔의 각도와 허리 회전을 중점적으로 봅니다.'] },
  { mode: 'LUNGE', title: '준비 자세 안정성', icon: <Activity size={24} color="#60A5FA" />, desc: ['수비 리시브 자세의 유지 시간을 측정합니다.', '분석 지표: 시선 흔들림, 무릎 각도 유지력', '버티는 동안 머리가 기울어지지 않도록 주의하세요.'] },
  { mode: 'FOOTWORK', title: '민첩성 훈련', icon: <Move size={24} color="#FCD34D" />, desc: ['화면에 표시되는 방향으로 빠르게 이동하세요.', '중앙 복귀 후 다음 지시를 기다려야 합니다.', '반응 속도(초)와 스텝의 정확도를 평가합니다.'] },
  { mode: 'RHYTHM', title: '나와의 랠리', icon: <Music size={24} color="#10B981" />, desc: ['타인의 시선 부담 없이 혼자서 훈련하는 랠리 모드입니다.', '날아오는 궤적의 리듬에 맞춰 올바른 폼을 구사하세요.', '분석 후 폼이 붕괴된 근본적인 원인을 짚어줍니다.'] },
  { mode: 'REALTIME_MATCH', title: '실전 랠리 (반코트)', icon: <Flame size={24} color="#EF4444" />, desc: ['실제 랠리 중의 이동과 스윙을 종합적으로 추적합니다.', '분석 지표: 스플릿 스텝 타이밍, 홈 포지션 복귀 속도, 기동 중 자세 안정성', 'AI가 나의 움직임을 프로 선수 패턴과 역학적으로 비교하여 자연어로 알려줍니다.'] }
];

export default function AIAnalysis() {
  const navigation = useNavigation<any>();

  const [showRealtimeMode, setShowRealtimeMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>('SWING');
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');

  const [swingSpeed, setSwingSpeed] = useState(0);
  const [currentElbowAngle, setCurrentElbowAngle] = useState(0);
  const [currentKneeAngle, setCurrentKneeAngle] = useState(0);
  const [currentXFactor, setCurrentXFactor] = useState(0);
  const [currentCOG, setCurrentCOG] = useState(0);
  const [heightEfficiency, setHeightEfficiency] = useState(0);
  const [headTilt, setHeadTilt] = useState(0);
  const [swingScore, setSwingScore] = useState(0);
  const [currentLungeHoldTime, setCurrentLungeHoldTime] = useState(0);
  const [maxLungeHoldTime, setMaxLungeHoldTime] = useState(0);
  const [lungeStability, setLungeStability] = useState(0);
  const [targetDirection, setTargetDirection] = useState<FootworkDirection>('CENTER');
  const [currentFootworkPose, setCurrentFootworkPose] = useState<FootworkDirection>('CENTER');
  const [footworkScore, setFootworkScore] = useState(0);
  const [footworkCombo, setFootworkCombo] = useState(0);
  const [lastActionTime, setLastActionTime] = useState(0);

  const [rhythmCombo, setRhythmCombo] = useState(0);
  const [rhythmScore, setRhythmScore] = useState(0);

  const [timeLeft, setTimeLeft] = useState(ANALYSIS_DURATION);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [showReport, setShowReport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyStep, setSurveyStep] = useState(0);
  const [surveyAnswers, setSurveyAnswers] = useState<string[]>([]);
  const [showMatchResult, setShowMatchResult] = useState(false);
  const [matchedStyle, setMatchedStyle] = useState<any>(null);

  const [styleHistory, setStyleHistory] = useState<StyleRecord[]>([]);

  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<AnalysisReport[]>([]);
  const [lastResult, setLastResult] = useState<ResultData | null>(null);

  const hasSwing = history.some(h => h.mode === 'SWING');
  const hasLunge = history.some(h => h.mode === 'LUNGE');
  const hasFootwork = history.some(h => h.mode === 'FOOTWORK');
  const canMatchStyle = hasSwing && hasLunge && hasFootwork;

  const popAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(1)).current;
  const countdownAnim = useRef(new Animated.Value(0)).current;

  const sessionDataRef = useRef({
    swingSpeeds: [] as number[], swingAngles: [] as number[], swingKnnScores: [] as number[],
    swingXFactors: [] as number[], swingCOGDeltas: [] as number[], swingHeights: [] as number[],
    lungeHoldTimes: [] as number[], lungeKnnScores: [] as number[], lungeHeadTilts: [] as number[],
    footworkReactionTimes: [] as number[], footworkSuccessCount: 0,
    rhythmResults: [] as any[],
    count: 0
  });

  // ✅ [고도화 추가] prevPos에 원근감이 보정된 courtX, courtY 저장 필드 추가
  const prevPos = useRef<{ x: number; y: number; courtX: number; courtY: number; time: number; speed: number } | null>(null);
  const speedBuffer = useRef<number[]>([]);
  const webviewRef = useRef<WebView>(null);

  const isSwingingRef = useRef(false);
  const tempMaxSpeedRef = useRef(0);
  const angleAtMaxRef = useRef(0);
  const knnAtMaxRef = useRef(0);
  const xFactorAtMaxRef = useRef(0);
  const swingDistanceRef = useRef(0);
  const startCOGRef = useRef(0);
  const hasSwungInStep = useRef(false);
  const isLungingRef = useRef(false);
  const lungeStartTimeRef = useRef(0);

  useEffect(() => {
    const requestPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          if (granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED) {
            setHasPermission(true);
          }
        } catch (err) { console.warn(err); }
      } else { setHasPermission(true); }
    };
    requestPermission();
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const auth = getAuth(getApp());
        const user = auth.currentUser;

        if (user) {
          const db = getFirestore(getApp());

          const historyRef = collection(db, 'artifacts', 'rally-app-main', 'users', user.uid, 'videoHistory');
          const footworkRef = collection(db, 'artifacts', 'com.recobystackapp', 'users', user.uid, 'footworkSets');

          const [historySnap, footworkSnap] = await Promise.all([
            getDocs(query(historyRef)),
            getDocs(query(footworkRef))
          ]);

          const loadedHistory: AnalysisReport[] = [];

          historySnap.forEach((doc) => {
            const data = doc.data();
            loadedHistory.push({
              id: data.id || doc.id,
              docId: doc.id,
              date: data.date,
              mode: data.mode,
              avgScore: data.avgScore,
              pros: data.pros || [],
              cons: data.cons || [],
              training: data.training || '',
              totalCount: data.totalCount,
              maxRecord: data.maxRecord,
              difficulty: data.difficulty
            } as AnalysisReport);
          });

          footworkSnap.forEach((doc) => {
            const data = doc.data();
            loadedHistory.push({
              id: data.id || doc.id,
              docId: doc.id,
              date: data.date,
              mode: data.mode || 'REALTIME_MATCH',
              avgScore: data.avgScore,
              maxRecord: data.maxRecord,
              pros: data.summary?.strengths || [],
              cons: data.summary?.weaknesses || [],
              training: data.summary?.recommendedDrill || '',
              totalCount: data.maxRecord,
              durationSec: data.summary?.durationSec || 0,
              averageRecoveryMs: data.summary?.averageRecoveryMs || 0,
              courtCoveragePct: data.summary?.courtCoveragePct || 0,
              postureScore: data.summary?.postureScore || 0,
              aiEvaluation: data.aiEvaluation || null,
              difficulty: 'FULL MATCH' as any
            } as AnalysisReport);
          });

          loadedHistory.sort((a, b) => Number(b.id) - Number(a.id));
          setHistory(loadedHistory);
        }
      } catch (error) {
        console.error("기록 불러오기 실패:", error);
      }
    };

    fetchHistory();
  }, [showRealtimeMode]);

  useEffect(() => {
    if (countdown !== null) {
      countdownAnim.setValue(1.5);
      Animated.spring(countdownAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else if (countdown === 0) {
        setCountdown(null); startActualTimer();
      }
    }
  }, [countdown]);

  useEffect(() => {
    let interval: any;
    if (isAnalyzing && isTimerRunning && mode !== 'LUNGE' && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (isAnalyzing && isTimerRunning && mode !== 'LUNGE' && timeLeft === 0) {
      finishAnalysis();
    }
    return () => clearInterval(interval);
  }, [isAnalyzing, isTimerRunning, timeLeft, mode]);

  useEffect(() => {
    if (mode === 'FOOTWORK' && isTimerRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(arrowAnim, { toValue: 0.4, duration: 500, useNativeDriver: true }),
          Animated.timing(arrowAnim, { toValue: 1, duration: 500, useNativeDriver: true })
        ])
      ).start();
    } else { arrowAnim.setValue(1); }
  }, [mode, isTimerRunning, targetDirection]);

  useEffect(() => {
    if (mode !== 'FOOTWORK' || !isTimerRunning) return;

    if (targetDirection === 'CENTER' && currentFootworkPose === 'CENTER') {
      const directions: FootworkDirection[] = ['FRONT_LEFT', 'FRONT_RIGHT', 'BACK_LEFT', 'BACK_RIGHT'];
      const nextDir = directions[Math.floor(Math.random() * directions.length)];

      let delay = 1000;
      if (difficulty === 'NORMAL') delay = 500;
      if (difficulty === 'HARD') delay = 200;

      setTimeout(() => {
        setTargetDirection(nextDir); setLastActionTime(Date.now());
        hasSwungInStep.current = false; Vibration.vibrate(50);
      }, delay);
    }
    else if (targetDirection !== 'CENTER') {
      const isPositionMatch = currentFootworkPose === targetDirection;
      let isSuccess = false;

      if (difficulty === 'HARD') {
        if (isPositionMatch && hasSwungInStep.current) isSuccess = true;
      } else {
        if (isPositionMatch) isSuccess = true;
      }

      if (isSuccess) {
        const reactionTime = (Date.now() - lastActionTime) / 1000;
        sessionDataRef.current.footworkReactionTimes.push(reactionTime);
        sessionDataRef.current.footworkSuccessCount += 1;

        let points = Math.max(10, Math.floor(100 - reactionTime * 30));
        if (difficulty === 'NORMAL') points += 10;
        if (difficulty === 'HARD') points += 30;

        setFootworkScore(prev => prev + points); setFootworkCombo(prev => prev + 1);
        triggerResultAnimation();

        let gradeText = reactionTime < 1.0 ? 'PERFECT' : 'GOOD';
        if (difficulty === 'HARD') gradeText = 'NICE SMASH!';

        setLastResult({ value: points, isGood: true, type: 'FOOTWORK', grade: gradeText, score: points, unit: '점' });
        setTargetDirection('CENTER');
      }
    }
  }, [currentFootworkPose, targetDirection, isTimerRunning, mode, difficulty]);

  const enterAnalysisMode = async () => {
    if (hasPermission) {
      let duration = ANALYSIS_DURATION;
      if (mode === 'FOOTWORK') duration = FOOTWORK_DURATION;
      if (mode === 'RHYTHM') duration = RHYTHM_DURATION;

      setTimeLeft(duration); setIsTimerRunning(false); setCountdown(null);
      setSwingSpeed(0); setSwingScore(0); setCurrentElbowAngle(0); setCurrentKneeAngle(0);
      setCurrentXFactor(0); setCurrentCOG(0); setHeightEfficiency(0); setHeadTilt(0);
      setCurrentLungeHoldTime(0); setMaxLungeHoldTime(0); setLungeStability(0);
      setFootworkScore(0); setFootworkCombo(0); setTargetDirection('CENTER'); setLastResult(null);
      setRhythmCombo(0); setRhythmScore(0);

      sessionDataRef.current = {
        swingSpeeds: [], swingAngles: [], swingKnnScores: [], swingXFactors: [], swingCOGDeltas: [], swingHeights: [],
        lungeHoldTimes: [], lungeKnnScores: [], lungeHeadTilts: [], footworkReactionTimes: [], footworkSuccessCount: 0, count: 0, rhythmResults: []
      };

      setIsAnalyzing(true);
      setTimeout(() => webviewRef.current?.postMessage(JSON.stringify({ type: 'setMode', mode: mode })), 500);

      try {
        const hideDate = await AsyncStorage.getItem(`hideHelp_${mode}`);
        const today = new Date().toDateString();
        if (hideDate === today) {
          setShowHelp(false);
          setCountdown(3);
        } else {
          setShowHelp(true);
        }
      } catch (e) {
        setShowHelp(true);
      }
    } else { Alert.alert('알림', '카메라 권한이 필요합니다.'); }
  };

  const onPlayPress = () => { setCountdown(3); setShowHelp(false); };

  const startActualTimer = () => {
    setIsTimerRunning(true); Vibration.vibrate(100);
    if (mode === 'FOOTWORK') setTargetDirection('CENTER');
    if (mode === 'RHYTHM') {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'startRhythm', beatmap: RHYTHM_BEATMAP }));
    }
  };

  const finishAnalysis = async () => {
    setIsAnalyzing(false);
    setIsTimerRunning(false);
    setCountdown(null);
    if(mode === 'RHYTHM') webviewRef.current?.postMessage(JSON.stringify({ type: 'stopRhythm' }));

    const newReport = createReport();

    setHistory((prev) => {
        const updated = [newReport, ...prev];
        updated.sort((a, b) => Number(b.id) - Number(a.id));
        return updated;
    });
    setSelectedReport(newReport);

    setTimeout(() => setShowReport(true), 500);

    try {
        const auth = getAuth(getApp());
        const user = auth.currentUser;
        if (user) {
            const db = getFirestore(getApp());
            const appId = 'rally-app-main';

            const reportToSave = { ...newReport };
            delete reportToSave.docId;

            Object.keys(reportToSave).forEach(key => {
                if (reportToSave[key as keyof AnalysisReport] === undefined) {
                    delete reportToSave[key as keyof AnalysisReport];
                }
            });

            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'videoHistory'), {
                ...reportToSave,
                createdAt: serverTimestamp()
            });
        }
    } catch (error) {
        console.error("AI Analysis saving error:", error);
    }
  };

  const toggleDifficulty = () => {
    if (isTimerRunning) { Alert.alert('알림', '게임 중에는 난이도를 변경할 수 없습니다.'); return; }
    setDifficulty(prev => { if (prev === 'EASY') return 'NORMAL'; if (prev === 'NORMAL') return 'HARD'; return 'EASY'; });
  };

  const startStyleMatch = () => {
    setSurveyStep(0); setSurveyAnswers([]); setShowSurvey(true);
  };

  const handleSurveyAnswer = (type: string) => {
    const newAnswers = [...surveyAnswers, type];
    setSurveyAnswers(newAnswers);

    if (surveyStep < SURVEY_QUESTIONS.length - 1) {
      setSurveyStep(prev => prev + 1);
    } else {
      setShowSurvey(false);
      calculatePlayerMatch(newAnswers);
    }
  };

  const calculatePlayerMatch = (answers: string[]) => {
    const swingData = history.filter(h => h.mode === 'SWING');
    const lungeData = history.filter(h => h.mode === 'LUNGE');
    const footworkData = history.filter(h => h.mode === 'FOOTWORK');

    const maxSwing = swingData.length > 0 ? Math.max(...swingData.map(h => h.maxRecord)) : 0;
    const maxLunge = lungeData.length > 0 ? Math.max(...lungeData.map(h => h.maxRecord)) : 0;
    const avgFootwork = footworkData.length > 0 ? footworkData[0].maxRecord : 1.5;

    let styleId = 'ALL_ROUND';
    if (answers.includes('POWER') || maxSwing >= 100) styleId = 'POWER';
    else if (answers.includes('SPEED') && avgFootwork <= 1.0) styleId = 'SPEED';
    else if (answers.includes('DEFENSE') || maxLunge >= 30) styleId = 'TECH';

    const finalStyle = PLAYER_STYLES[styleId as keyof typeof PLAYER_STYLES];
    setMatchedStyle(finalStyle);

    const newStyleRecord: StyleRecord = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      styleId: styleId,
      name: finalStyle.name,
      title: finalStyle.title,
      image: finalStyle.image
    };
    setStyleHistory(prev => [newStyleRecord, ...prev]);

    setTimeout(() => setShowMatchResult(true), 500);
  };

  const getBadgeColor = (grade: string) => {
    if (grade === 'SS' || grade === 'PERFECT') return '#F59E0B';
    if (grade === 'S' || grade === 'GOOD') return '#8B5CF6';
    if (grade === 'A') return '#3B82F6';
    if (grade === 'B') return '#10B981';
    return '#6B7280';
  };

  const getGradeColor = (grade?: string) => {
    if (grade === 'PERFECT' || grade === 'NICE SMASH!') return '#FFD700';
    switch (grade) {
      case 'SS': return '#FFD700'; case 'S': return '#A78BFA'; case 'A': return '#60A5FA'; case 'B': return '#34D399'; default: return '#9CA3AF';
    }
  };

  const getModeIcon = (itemMode: string) => {
    switch(itemMode) {
      case 'SWING': return <Zap size={20} color="#F472B6" />;
      case 'LUNGE': return <Activity size={20} color="#60A5FA" />;
      case 'FOOTWORK': return <Move size={20} color="#FCD34D" />;
      case 'RHYTHM': return <Music size={20} color="#10B981" />;
      case 'REALTIME_MATCH': return <Flame size={20} color="#EF4444" />;
      default: return <Activity size={20} color="#FFF" />;
    }
  };

  const getModeName = (itemMode: string) => {
    switch(itemMode) {
      case 'SWING': return "스윙 분석";
      case 'LUNGE': return "준비 자세";
      case 'FOOTWORK': return "풋워크";
      case 'RHYTHM': return "나와의 랠리";
      case 'REALTIME_MATCH': return "실전 랠리 (반코트)";
      default: return "분석 모드";
    }
  };

  const hideHelpToday = async () => {
    try {
      const today = new Date().toDateString();
      await AsyncStorage.setItem(`hideHelp_${mode}`, today);
    } catch(e) {}
    setShowHelp(false);
    if (countdown === null && !isTimerRunning) setCountdown(3);
  };

  const createReport = (): AnalysisReport => {
    const data = sessionDataRef.current;
    let report: AnalysisReport = {
      id: Date.now().toString(), date: new Date().toLocaleString(), mode: mode,
      avgScore: 0, pros: [], cons: [], training: '', totalCount: 0, maxRecord: 0
    };

    if (mode === 'FOOTWORK' || mode === 'RHYTHM') {
      report.difficulty = difficulty;
    }

    if (mode === 'RHYTHM') {
      const results = data.rhythmResults;
      report.totalCount = RHYTHM_BEATMAP.length;
      report.maxRecord = rhythmCombo;
      report.avgScore = rhythmScore;

      if (results.length === 0) { report.training = '측정된 판정이 없습니다.'; return report; }

      const smashMisses = results.filter(r => r.noteType === 'SMASH' && (r.timing === 'MISS' || r.elbowAngle < 150));
      const underMisses = results.filter(r => r.noteType === 'UNDER' && (r.timing === 'MISS' || r.kneeAngle > 160));
      const clearMisses = results.filter(r => r.noteType === 'CLEAR' && r.xFactor < 20);
      const perfectCount = results.filter(r => r.timing === 'PERFECT').length;

      if (perfectCount >= RHYTHM_BEATMAP.length * 0.7) {
          report.pros.push('모든 궤적에 대한 반응 속도와 템포가 완벽합니다!');
      } else if (perfectCount >= RHYTHM_BEATMAP.length * 0.4) {
          report.pros.push('셔틀콕의 궤적을 읽고 반응하는 기본 리듬감이 좋습니다.');
      } else {
          report.pros.push('포기하지 않고 랠리를 끝까지 따라가는 집중력이 돋보입니다.');
      }

      if (smashMisses.length > 0) {
          report.cons.push("스매시(Red) 타이밍에 타점이 무너지고 있습니다. 임팩트 순간 팔이 완전히 펴지지 않아 네트에 걸릴 확률이 높습니다.");
          report.training = '▶ 벽 짚고 스윙 연습: 벽을 마주 보고 서서 손이 벽에 닿을 만큼 팔을 뻗은 상태에서 타격하는 훈련을 권장합니다.';
      } else if (underMisses.length > 0) {
          report.cons.push("수비(Blue) 동작 시 하체 고정이 부족합니다. 무릎을 충분히 굽히지 않고 서서 치고 있어 무게 중심이 쉽게 흔들립니다.");
          report.training = '▶ 고무줄(밴드)을 허벅지에 걸고 투명의자 자세를 유지하며 훈련하는 하체 안정화 코스가 필요합니다.';
      } else if (clearMisses.length > 0) {
          report.cons.push("클리어(Green) 타격 시 상체 회전이 거의 없습니다. 골반과 어깨가 충분히 비틀어지지 않아 팔로만 스윙하고 있습니다.");
          report.training = '▶ 수건 던지기 훈련: 왼쪽 골반을 먼저 틀면서 수건을 채찍처럼 앞으로 던지는 체중 이동 연습을 하세요.';
      } else {
          report.training = '▶ 모든 궤적에서 완벽한 폼과 타이밍을 보여주었습니다. 현재의 감각을 유지하며 오프라인 매칭을 시작해 보세요!';
      }

    } else if (mode === 'SWING') {
      if (data.count === 0) { report.training = '측정된 데이터가 없습니다.'; return report; }
      const maxSpeed = Math.floor(Math.max(...data.swingSpeeds));
      const avgKnn = data.swingKnnScores.reduce((a, b) => a + b, 0) / (data.swingKnnScores.length || 1);
      const avgSpeed = data.swingSpeeds.reduce((a,b)=>a+b,0) / (data.swingSpeeds.length || 1);
      const avgXFactor = data.swingXFactors.reduce((a,b)=>a+b,0) / (data.swingXFactors.length || 1);
      const avgHeight = data.swingHeights.reduce((a,b)=>a+b,0) / (data.swingHeights.length || 1);
      const avgCOGDelta = data.swingCOGDeltas.reduce((a,b)=>a+b,0) / (data.swingCOGDeltas.length || 1);

      report.totalCount = data.count; report.maxRecord = maxSpeed;
      const speedScore = Math.min(100, avgSpeed * 0.8) * 0.3;
      const formScore = avgKnn * 0.2;
      const powerScore = Math.min(100, avgXFactor * 2.5) * 0.2;
      const heightScore = Math.min(100, avgHeight) * 0.15;
      const weightScore = Math.min(100, avgCOGDelta * 1000) * 0.15;

      report.avgScore = Math.floor(speedScore + formScore + powerScore + heightScore + weightScore);

      if (maxSpeed >= 110) report.pros.push('상급자 수준의 강력한 스매시 파워를 보유하고 계십니다.');
      if (avgXFactor >= 35) report.pros.push('상체와 골반을 부드럽게 꼬아주는 코어 회전력이 훌륭합니다.');
      if (avgHeight >= 90) report.pros.push('가장 이상적이고 높은 위치에서 타점을 형성하고 있습니다.');
      if (avgCOGDelta >= 0.15) report.pros.push('스윙 시 체중이 앞으로 자연스럽게 실리며 파워를 더하고 있습니다.');

      if (report.pros.length === 0) report.pros.push('끝까지 스윙 궤적을 멈추지 않고 가져가는 태도가 매우 좋습니다.');

      if (avgXFactor < 20) {
        report.cons.push('상체의 꼬임이 덜 풀려 몸통 회전의 힘이 라켓에 전달되지 않고 있습니다.');
        report.training = '▶ 백스윙 시 어깨를 뒤로 더 깊이 넣었다가 튕겨 나오는 코어 훈련을 진행하세요.';
      } else if (avgHeight < 75) {
        report.cons.push('타점이 낮게 형성되어 스매시가 네트에 걸릴 확률이 아주 높습니다.');
        report.training = '▶ 가볍게 점프하여 타점을 머리 위쪽 가장 높은 곳으로 끌어올리는 연습이 필요합니다.';
      } else if (avgCOGDelta < 0.1) {
        report.cons.push('임팩트 순간 체중이 앞으로 쏠리지 못하고 뒤에 남아있습니다.');
        report.training = '▶ 타격 시 뒤쪽 발이 스윙 방향을 따라 자연스럽게 앞으로 나오는 스텝 훈련을 병행하세요.';
      } else {
        report.training = '▶ 폼과 체중 이동이 완벽합니다. 풋워크와 결합하여 실전 능력을 높여보세요.';
      }
    } else if (mode === 'LUNGE') {
      const maxHold = maxLungeHoldTime;
      const avgHeadTilt = data.lungeHeadTilts.reduce((a,b)=>a+b,0) / (data.lungeHeadTilts.length || 1);

      report.maxRecord = maxHold; report.totalCount = data.lungeHoldTimes.length;
      const holdScore = Math.min(100, (maxHold / 60) * 100) * 0.4;
      const stabilityScore = lungeStability * 0.3;
      const headScore = Math.max(0, 100 - (avgHeadTilt * 10)) * 0.3;

      report.avgScore = Math.floor(holdScore + stabilityScore + headScore);

      if (maxHold >= 45) report.pros.push('장시간 하체를 무너뜨리지 않는 완벽한 밸런스를 갖추고 있습니다.');
      else if (maxHold >= 20) report.pros.push('기본적인 하체 근력과 버티는 힘이 양호합니다.');
      else report.pros.push('힘들더라도 자세를 잡고 계속 시도하려는 모습이 훌륭합니다.');

      if (avgHeadTilt < 3) report.pros.push('시선 처리가 흔들림 없이 아주 안정적입니다.');

      if (avgHeadTilt > 10) report.cons.push('버티는 동안 머리가 한쪽으로 계속 기울어지고 있어 시야가 좁아질 수 있습니다.');
      if (maxHold < 15) report.cons.push('하체 근력이 부족하여 기마 자세가 금방 풀려버립니다.');

      report.training = maxHold < 30 ? '▶ 투명의자 자세로 매일 버티는 훈련을 수행하여 코어를 단련하세요.' : '▶ 정면을 바라보며 시선을 단단히 고정하는 연습을 추가하세요.';
    } else if (mode === 'FOOTWORK') {
      const totalSuccess = data.footworkSuccessCount;
      if (totalSuccess === 0) { report.training = '성공한 스텝이 없습니다. 천천히 다시 시도하세요.'; return report; }
      const avgReaction = data.footworkReactionTimes.reduce((a,b)=>a+b,0) / totalSuccess;

      report.totalCount = totalSuccess; report.maxRecord = avgReaction; report.avgScore = footworkScore;

      if (avgReaction < 0.8) report.pros.push('지시를 보자마자 몸이 반응하는 속도가 매우 빠릅니다.');
      else if (avgReaction < 1.2) report.pros.push('안정적이고 일관된 스텝 리듬을 보여주고 있습니다.');
      else report.pros.push('방향을 헷갈리지 않고 정확히 밟으려는 집중력이 좋습니다.');

      if (avgReaction > 1.5) report.cons.push('방향 지시 후 첫 발이 떨어지기까지의 시간이 다소 깁니다.');

      report.training = difficulty === 'HARD' ? '▶ 스윙 후 즉시 중앙 지점으로 복귀하는 리커버리 스텝을 최우선으로 연습하세요.' : '▶ 줄넘기 2단 뛰기와 좁은 폭의 사이드 스텝 달리기가 반응 속도를 크게 올려줍니다.';
    }

    return report;
  };

  const deleteHistoryItem = (id: string, docId: string | undefined, itemMode: string) => {
    Alert.alert('기록 삭제', '이 기록을 정말 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => performDelete(id, docId, itemMode) },
    ]);
  };

  const performDelete = async (id: string, docId: string | undefined, itemMode: string) => {
    try {
      const auth = getAuth(getApp());
      const user = auth.currentUser;
      if (user && docId) {
        const db = getFirestore(getApp());
        const isRealtime = itemMode === 'REALTIME_MATCH';
        const collectionName = isRealtime ? 'footworkSets' : 'videoHistory';
        const appId = isRealtime ? 'com.recobystackapp' : 'rally-app-main';

        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, collectionName, docId));
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error("삭제 실패:", error);
    }
  };

  const deleteStyleHistory = (id: string) => {
    Alert.alert('기록 삭제', '이 스타일 매칭 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => setStyleHistory((prev) => prev.filter((item) => item.id !== id)) },
    ]);
  };

  const toggleCamera = () => webviewRef.current?.postMessage(JSON.stringify({ type: 'switchCamera' }));

  const toggleMode = async () => {
    if (isTimerRunning) { Alert.alert('알림', '분석 중에는 모드를 변경할 수 없습니다.'); return; }
    let newMode: AnalysisMode = 'SWING';
    if (mode === 'SWING') newMode = 'LUNGE';
    else if (mode === 'LUNGE') newMode = 'FOOTWORK';
    else if (mode === 'FOOTWORK') newMode = 'RHYTHM';
    else newMode = 'SWING';

    setMode(newMode); setTimeLeft(newMode === 'FOOTWORK' ? FOOTWORK_DURATION : newMode === 'RHYTHM' ? RHYTHM_DURATION : ANALYSIS_DURATION);
    setLastResult(null); popAnim.setValue(0); setSwingScore(0); setCurrentLungeHoldTime(0);
    setMaxLungeHoldTime(0); setFootworkScore(0); setDifficulty('EASY'); setRhythmCombo(0); setRhythmScore(0);
    webviewRef.current?.postMessage(JSON.stringify({ type: 'setMode', mode: newMode }));

    try {
      const hideDate = await AsyncStorage.getItem(`hideHelp_${newMode}`);
      const today = new Date().toDateString();
      if (hideDate !== today) {
        setShowHelp(true);
        setCountdown(null);
      } else {
        setCountdown(3);
      }
    } catch (e) {
      setShowHelp(true);
      setCountdown(null);
    }
  };

  const triggerResultAnimation = () => { popAnim.setValue(0); Animated.spring(popAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }).start(); };
  const triggerSmashEffect = () => { Vibration.vibrate(100); flashAnim.setValue(1); Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(); };

  const handleMessage = (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === 'log') return;

      if (parsed.type === 'rhythmHit') {
          if (parsed.timing === 'PERFECT' || parsed.timing === 'GREAT') {
              setRhythmCombo(prev => prev + 1);
              setRhythmScore(prev => prev + (parsed.timing === 'PERFECT' ? 100 : 50));
              triggerSmashEffect();
          } else {
              setRhythmCombo(0);
              Vibration.vibrate(50);
          }
          sessionDataRef.current.rhythmResults.push(parsed);
          setLastResult({ value: rhythmCombo, isGood: parsed.timing !== 'MISS', type: 'RHYTHM', grade: parsed.timing, score: parsed.timing === 'PERFECT' ? 100 : 50, unit: 'COMBO' });
          triggerResultAnimation();
          return;
      }

      if (parsed.type === 'poseData') {
        if (countdown !== null) return;
        const rawX = parsed.x; const rawY = parsed.y; const currentTime = parsed.timestamp;
        const elbowAngle = Number(parsed.elbowAngle || 0); const kneeAngle = Number(parsed.kneeAngle || 0);
        const swingKnnScore = Number(parsed.swingKnnScore || 0); const readyKnnScore = Number(parsed.readyKnnScore || 0);
        const xFactor = Number(parsed.xFactor || 0); const cogX = Number(parsed.cogX || 0);
        const hEff = Number(parsed.heightEfficiency || 0); const hTilt = Number(parsed.headTilt || 0);
        const footworkPoseRaw = parsed.footworkPose;
        const footworkPose = (footworkPoseRaw === 'UNKNOWN') ? 'CENTER' : (footworkPoseRaw as FootworkDirection);

        setCurrentElbowAngle(elbowAngle); setCurrentKneeAngle(kneeAngle);
        setCurrentXFactor(xFactor); setCurrentCOG(cogX);
        setHeightEfficiency(hEff); setHeadTilt(hTilt);

        if (mode === 'FOOTWORK' && footworkPoseRaw !== 'UNKNOWN') setCurrentFootworkPose(footworkPose);

        if (mode === 'SWING' || (mode === 'FOOTWORK' && difficulty === 'HARD')) {

          const { courtX, courtY } = applyHomography(rawX, rawY);

          if (!prevPos.current) {
            prevPos.current = { x: rawX, y: rawY, courtX, courtY, time: currentTime, speed: 0 };
            return;
          }

          // --------------------------------------------------------
          // ✅ [수정됨] 좌표 분리 적용
          // 1. 스윙 속도용 거리: 공중에 있는 손목이므로 원본(raw) 픽셀 좌표 사용
          const swingDx = rawX - prevPos.current.x;
          const swingDy = rawY - prevPos.current.y;
          const swingDistance = Math.sqrt(swingDx * swingDx + swingDy * swingDy);

          // 2. 풋워크 이동용 거리: 바닥에 있으므로 호모그래피 보정 좌표 사용
          const courtDx = courtX - prevPos.current.courtX;
          const courtDy = courtY - prevPos.current.courtY;
          const courtDistance = Math.sqrt(courtDx * courtDx + courtDy * courtDy);
          // --------------------------------------------------------

          let dynamicSmoothing = 0.7;
          if (swingDistance > 0.05) dynamicSmoothing = 0.1; else if (swingDistance > 0.02) dynamicSmoothing = 0.4;

          const smoothX = prevPos.current.x * dynamicSmoothing + rawX * (1 - dynamicSmoothing);
          const smoothY = prevPos.current.y * dynamicSmoothing + rawY * (1 - dynamicSmoothing);
          const smoothCourtX = prevPos.current.courtX * dynamicSmoothing + courtX * (1 - dynamicSmoothing);
          const smoothCourtY = prevPos.current.courtY * dynamicSmoothing + courtY * (1 - dynamicSmoothing);

          let timeDiff = (currentTime - prevPos.current.time) / 1000;
          if (timeDiff < 0.03) timeDiff = 0.03;

          let currentSpeed = 0;
          if (timeDiff < 0.5) {
            // ✅ 스윙 속도 계산 시 뻥튀기된 courtDistance가 아닌 원본 swingDistance를 사용하여 속도 정상화
            const pixelSpeed = swingDistance / timeDiff;
            currentSpeed = pixelSpeed * 40 * PIXEL_TO_REAL_SCALE;
            if (currentSpeed > 350) currentSpeed = 350;
          }

          speedBuffer.current.push(currentSpeed);
          if (speedBuffer.current.length > SPEED_BUFFER_SIZE) speedBuffer.current.shift();
          const avgSpeed = speedBuffer.current.reduce((a, b) => a + b, 0) / speedBuffer.current.length;
          setSwingSpeed(Math.floor(avgSpeed));

          if (mode === 'FOOTWORK' && difficulty === 'HARD' && avgSpeed > SWING_TRIGGER_SPEED) hasSwungInStep.current = true;

          if (mode === 'SWING') {
              let tempScore = (avgSpeed * 0.3) + (swingKnnScore * 0.2) + (elbowAngle > 160 ? 10 : 0) + (xFactor > 30 ? 20 : xFactor * 0.5) + (hEff > 80 ? 20 : hEff * 0.2);
              if (tempScore > 100) tempScore = 100;
              setSwingScore(Math.floor(tempScore));

              if (avgSpeed > SWING_TRIGGER_SPEED && isTimerRunning) {
                if (!isSwingingRef.current) {
                  isSwingingRef.current = true; tempMaxSpeedRef.current = 0; knnAtMaxRef.current = 0;
                  xFactorAtMaxRef.current = 0; startCOGRef.current = cogX; swingDistanceRef.current = 0;
                }
                if (avgSpeed > tempMaxSpeedRef.current) {
                  tempMaxSpeedRef.current = avgSpeed; angleAtMaxRef.current = elbowAngle;
                  knnAtMaxRef.current = swingKnnScore; xFactorAtMaxRef.current = xFactor;
                }
                // ✅ 누적 스윙 거리 계산에도 swingDistance 적용
                swingDistanceRef.current += swingDistance;
              } else {
                if (isSwingingRef.current) {
                  isSwingingRef.current = false;
                  if (tempMaxSpeedRef.current > 30 && swingDistanceRef.current > MIN_SWING_DISTANCE_PX) {
                    const maxSpeed = tempMaxSpeedRef.current; const bestXFactor = xFactorAtMaxRef.current;
                    const cogDelta = Math.abs(startCOGRef.current - cogX);
                    sessionDataRef.current.swingSpeeds.push(maxSpeed); sessionDataRef.current.swingAngles.push(angleAtMaxRef.current);
                    sessionDataRef.current.swingKnnScores.push(knnAtMaxRef.current); sessionDataRef.current.swingXFactors.push(bestXFactor);
                    sessionDataRef.current.swingHeights.push(hEff); sessionDataRef.current.swingCOGDeltas.push(cogDelta);
                    sessionDataRef.current.count += 1;

                    if (maxSpeed >= 90) triggerSmashEffect();
                    let grade = 'C';
                    if (maxSpeed >= 140) grade = 'SS'; else if (maxSpeed >= 110) grade = 'S';
                    else if (maxSpeed >= 90) grade = 'A'; else if (maxSpeed >= 60) grade = 'B';
                    const finalScore = Math.min(100, Math.floor((maxSpeed * 0.3) + (knnAtMaxRef.current * 0.2) + (bestXFactor * 0.3) + (hEff * 0.2)));

                    setLastResult({ value: Math.floor(maxSpeed), subValue: angleAtMaxRef.current, isGood: angleAtMaxRef.current >= 165, type: 'SWING', grade: grade, score: finalScore, unit: 'km/h' });
                    triggerResultAnimation();
                  }
                }
              }
          }
          prevPos.current = { x: smoothX, y: smoothY, courtX: smoothCourtX, courtY: smoothCourtY, time: currentTime, speed: currentSpeed };
        }

        if (mode === 'LUNGE') {
          const READY_START_THRESHOLD = 155; const READY_END_THRESHOLD = 165; setLungeStability(readyKnnScore);
          if (kneeAngle < READY_START_THRESHOLD) {
            if (!isLungingRef.current) { isLungingRef.current = true; lungeStartTimeRef.current = currentTime; }
            const duration = (currentTime - lungeStartTimeRef.current) / 1000;
            const currentHold = Number(duration.toFixed(1));
            setCurrentLungeHoldTime(currentHold);
            if (isTimerRunning) {
                if (currentHold > maxLungeHoldTime) setMaxLungeHoldTime(currentHold);
                sessionDataRef.current.lungeKnnScores.push(readyKnnScore); sessionDataRef.current.lungeHeadTilts.push(hTilt);
            }
          } else if (kneeAngle > READY_END_THRESHOLD) {
            if (isLungingRef.current) {
              isLungingRef.current = false;
              if (currentLungeHoldTime > 1.0 && isTimerRunning) {
                sessionDataRef.current.lungeHoldTimes.push(currentLungeHoldTime);
                setLastResult({ value: Math.floor(currentLungeHoldTime), subValue: readyKnnScore, isGood: currentLungeHoldTime >= 30, type: 'LUNGE', score: readyKnnScore, unit: '초' });
                triggerResultAnimation();
              }
              setCurrentLungeHoldTime(0);
            }
          }
        }
      }
    } catch (e) {}
  };

  const renderStatsOverlay = () => {
    if (mode === 'FOOTWORK') return renderFootworkOverlay();
    if (mode === 'RHYTHM') return (
        <View style={styles.statsOverlay}>
            <View style={styles.statBox}>
                <Music size={20} color="#10B981" />
                <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>콤보</Text><Text style={styles.statValue} numberOfLines={1}>{rhythmCombo}</Text></View>
            </View>
            <View style={styles.divider} />
            <View style={styles.statBox}>
                <Award size={20} color="#FCD34D" />
                <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>스코어</Text><Text style={styles.statValue} numberOfLines={1}>{rhythmScore}</Text></View>
            </View>
        </View>
    );

    return (
        <View style={styles.statsOverlay}>
            {mode === 'SWING' ? (
              <>
                <View style={styles.statBox}>
                    <Activity size={20} color="#F472B6" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>속도</Text><Text style={styles.statValue} numberOfLines={1}>{swingSpeed}</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.statBox}>
                    <RotateCw size={20} color="#60A5FA" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>코어회전</Text><Text style={styles.statValue} numberOfLines={1}>{Math.floor(currentXFactor)}°</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.statBox}>
                    <Circle size={20} color="#34D399" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>타점</Text><Text style={styles.statValue} numberOfLines={1}>{Math.floor(heightEfficiency)}%</Text></View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.statBox}>
                    <Move size={20} color="#60A5FA" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>무릎각도</Text><Text style={styles.statValue} numberOfLines={1}>{Math.floor(currentKneeAngle)}°</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.statBox}>
                    <User size={20} color="#FCD34D" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>시선</Text><Text style={styles.statValue} numberOfLines={1}>{headTilt < 5 ? '좋음' : '주의'}</Text></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.statBox}>
                    <Clock size={20} color="#34D399" />
                    <View style={styles.statContent}><Text style={styles.statLabel} numberOfLines={1}>버티기</Text><Text style={styles.statValue} numberOfLines={1}>{currentLungeHoldTime}s</Text></View>
                </View>
              </>
            )}
        </View>
    );
  };

  const renderFootworkOverlay = () => {
    const getArrowScale = (dir: FootworkDirection) => targetDirection === dir ? arrowAnim : 1;
    const getArrowColor = (dir: FootworkDirection) => targetDirection === dir ? '#FCD34D' : 'rgba(255,255,255,0.2)';
    return (
        <View style={styles.footworkOverlay}>
            <View style={styles.arrowRow}>
                <Animated.View style={{ transform: [{ scale: getArrowScale('FRONT_LEFT') }] }}><ArrowUpLeft size={80} color={getArrowColor('FRONT_LEFT')} /></Animated.View>
                <Animated.View style={{ transform: [{ scale: getArrowScale('FRONT_RIGHT') }] }}><ArrowUpRight size={80} color={getArrowColor('FRONT_RIGHT')} /></Animated.View>
            </View>
            <View style={styles.centerIndicator}>
                <Animated.View style={{ transform: [{ scale: getArrowScale('CENTER') }] }}><Circle size={60} color={getArrowColor('CENTER')} /></Animated.View>
                <Text style={styles.commandText}>{targetDirection === 'CENTER' ? '중앙 복귀!' : targetDirection === 'FRONT_RIGHT' ? '전방 우측!' : targetDirection === 'FRONT_LEFT' ? '전방 좌측!' : targetDirection === 'BACK_RIGHT' ? '후방 우측!' : '후방 좌측!'}</Text>
                {difficulty === 'HARD' && targetDirection !== 'CENTER' && (<Text style={{color:'#EF4444', fontWeight:'bold', marginTop:4, textShadowColor:'black', textShadowRadius:5}}>+ SMASH 필수!</Text>)}
            </View>
            <View style={styles.arrowRow}>
                <Animated.View style={{ transform: [{ scale: getArrowScale('BACK_LEFT') }] }}><ArrowDownLeft size={80} color={getArrowColor('BACK_LEFT')} /></Animated.View>
                <Animated.View style={{ transform: [{ scale: getArrowScale('BACK_RIGHT') }] }}><ArrowDownRight size={80} color={getArrowColor('BACK_RIGHT')} /></Animated.View>
            </View>
        </View>
    );
  };

  const currentModeInfo = MODE_DETAILS[mode];

  if (showRealtimeMode) {
    return <RealtimeFootworkMode onBack={() => setShowRealtimeMode(false)} />;
  }

  if (isAnalyzing) {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar barStyle="light-content" />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: flashAnim, zIndex: 5 }]} pointerEvents="none" />
        <WebView
          ref={webviewRef} style={styles.webview}
          source={{ html: htmlContent, baseUrl: 'https://localhost' }}
          originWhitelist={['*']} javaScriptEnabled={true} domStorageEnabled={true}
          mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback={true} onMessage={handleMessage}
        />
        {countdown !== null && (
          <View style={styles.countdownOverlay}>
             <Animated.Text style={[styles.countdownText, { transform: [{ scale: countdownAnim }] }]}>{countdown === 0 ? 'START!' : countdown}</Animated.Text>
             <Text style={styles.countdownSubText}>준비하세요!</Text>
          </View>
        )}
        <View style={styles.topControlContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleMode} style={styles.modeBadge}>
              {mode === 'SWING' ? <Zap size={14} color="#F472B6" /> : mode === 'LUNGE' ? <Activity size={14} color="#60A5FA" /> : mode === 'FOOTWORK' ? <Move size={14} color="#FCD34D" /> : <Music size={14} color="#10B981" />}
              <Text style={styles.modeText}>{mode === 'SWING' ? '스윙 모드' : mode === 'LUNGE' ? '준비 자세' : mode === 'FOOTWORK' ? '풋워크 게임' : '나와의 랠리'}</Text>
            </TouchableOpacity>
            {(mode === 'FOOTWORK' || mode === 'RHYTHM') && (
                <TouchableOpacity onPress={toggleDifficulty} style={[styles.difficultyButton, { backgroundColor: difficulty === 'EASY' ? '#34D399' : difficulty === 'NORMAL' ? '#60A5FA' : '#EF4444' }]}>
                    <BarChart2 size={16} color="#111827" />
                    <Text style={styles.difficultyButtonText}>{difficulty}</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowHelp(true)} style={styles.helpButton}><HelpCircle size={20} color="white" /></TouchableOpacity>
          </View>
          <View style={styles.timerBadge}>
            <Clock size={14} color={isTimerRunning ? '#FCD34D' : '#9CA3AF'} />
            <Text style={[styles.timerText, { color: isTimerRunning ? '#FCD34D' : '#9CA3AF' }]}>{mode === 'LUNGE' ? (isTimerRunning ? '기록 측정 중' : '대기') : `${timeLeft}초 ${isTimerRunning ? '진행중' : '대기'}`}</Text>
          </View>
        </View>

        {renderStatsOverlay()}

        {mode === 'FOOTWORK' && (
            <View style={{ position: 'absolute', top: 120, right: 20, alignItems:'flex-end' }}>
                <Text style={{ color: '#FCD34D', fontSize: 32, fontWeight: 'bold' }}>{footworkScore}</Text>
                <Text style={{ color: 'white', fontSize: 14 }}>COMBO: {footworkCombo}</Text>
            </View>
        )}

        {lastResult && (
          <Animated.View style={[styles.feedbackCard, { borderColor: (mode === 'SWING' || mode === 'RHYTHM') ? getGradeColor(lastResult.grade) : lastResult.isGood ? '#34D399' : '#EF4444', transform: [{ scale: popAnim }], opacity: popAnim }]}>
            <View style={styles.feedbackHeader}>
              <Text style={[styles.feedbackTitle, { color: (mode === 'SWING' || mode === 'RHYTHM') ? getGradeColor(lastResult.grade) : 'white' }]}>{lastResult.grade ? `${lastResult.grade}${mode==='SWING'?' CLASS':''}` : lastResult.isGood ? 'GOOD!' : 'BAD'}</Text>
              <Text style={{ color: 'white', fontSize: 16 }}>{mode === 'SWING' ? `최고속도: ${lastResult.value}km/h` : mode === 'LUNGE' ? `기록: ${lastResult.value}초` : mode === 'RHYTHM' ? `${lastResult.value} COMBO` : `+${lastResult.score}점`}</Text>
            </View>
          </Animated.View>
        )}

        <View style={styles.bottomControlContainer}>
          <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}><RefreshCcw size={24} color="white" /></TouchableOpacity>
          <TouchableOpacity style={[styles.controlButton, { backgroundColor: '#EF4444', paddingHorizontal: 20 }]} onPress={finishAnalysis}><Square size={20} color="white" fill="white" /><Text style={styles.controlButtonText}>종료</Text></TouchableOpacity>
          {!isTimerRunning && countdown === null && (<TouchableOpacity style={[styles.controlButton, { backgroundColor: '#FCD34D' }]} onPress={onPlayPress}><Play size={24} color="black" fill="black" /></TouchableOpacity>)}
        </View>

        <Modal animationType="fade" transparent visible={showHelp} onRequestClose={() => setShowHelp(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View><Text style={styles.modalTitle}>{currentModeInfo.title}</Text></View>
                <TouchableOpacity onPress={() => setShowHelp(false)} style={styles.closeButton}><X size={24} color="#9CA3AF" /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalScrollViewContent} showsVerticalScrollIndicator={false}>
                <View style={styles.cardSection}>
                  <View style={styles.cardHeader}><CheckCircle size={20} color="#FCD34D" /><Text style={styles.cardTitle}>점수 산정 기준</Text></View>
                  <View style={styles.criteriaList}>
                    {currentModeInfo.scoreCriteria.map((item, idx) => (
                      <View key={idx} style={styles.criteriaRow}>
                         <View style={styles.criteriaLabelBox}><Text style={styles.criteriaLabel}>{item.label}</Text></View>
                         <View style={styles.progressBarContainer}><View style={[styles.progressBarFill, { width: item.pct }]} /></View>
                         <Text style={styles.criteriaPct}>{item.pct}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.cardSection}>
                    <View style={styles.cardHeader}><Activity size={20} color="#60A5FA" /><Text style={styles.cardTitle}>핵심 분석 요소</Text></View>
                    <View style={styles.elementsGrid}>
                        {currentModeInfo.analysisElements.map((el, idx)=>(<View key={idx} style={styles.elementItem}><CheckCircle size={14} color="#60A5FA" style={{marginTop:2}} /><Text style={styles.elementText}>{el}</Text></View>))}
                    </View>
                </View>
                <View style={styles.cardSection}>
                    <View style={styles.cardHeader}><Circle size={20} color="#F472B6" /><Text style={styles.cardTitle}>등급 기준</Text></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 10, paddingRight: 20}}>
                        {currentModeInfo.gradeCriteria.map((grade, idx)=>{
                          const badgeColor = getBadgeColor(grade.grade);
                          return (
                            <View key={idx} style={[styles.rankBadge, { borderColor: badgeColor }]}>
                                <View style={[styles.rankBadgeHeader, { backgroundColor: badgeColor }]}><Text style={styles.rankGradeText}>{grade.grade}</Text></View>
                                <View style={styles.rankBadgeContent}><Text style={[styles.rankValueText, { color: badgeColor }]}>{grade.value}</Text><Text style={styles.rankDescText}>{grade.desc}</Text></View>
                            </View>
                          );
                        })}
                    </ScrollView>
                </View>
                <View style={styles.cardSection}>
                    <View style={styles.cardHeader}><Play size={20} color="#34D399" /><Text style={styles.cardTitle}>측정 꿀팁 & 자세</Text></View>
                    {currentModeInfo.tips.map((tip, idx)=>(<Text key={idx} style={styles.bulletText}>• {tip}</Text>))}
                    {currentModeInfo.difficultyGuide && (
                        <View style={{marginTop: 15, backgroundColor:'rgba(0,0,0,0.2)', padding:10, borderRadius:8}}>
                            <View style={{flexDirection:'row', alignItems:'center', marginBottom:8}}><BarChart2 size={16} color="#FCD34D" style={{marginRight:6}}/><Text style={{color:'white', fontWeight:'bold', fontSize:14}}>난이도 안내</Text></View>
                            {currentModeInfo.difficultyGuide.map((guide, i)=>(<Text key={i} style={{color:'#D1D5DB', fontSize: 13, marginBottom: 4, lineHeight: 18}}>{guide}</Text>))}
                        </View>
                    )}
                    {mode === 'SWING' && (
                        <View style={styles.imageContainer}>
                            <Image source={require('../../assets/images/smash_perfect.png')} style={styles.referenceImage} />
                            <View style={styles.captionBox}><Info size={14} color="#FCD34D" /><Text style={styles.captionText}>▲ 팔꿈치 160° 이상, 타점은 머리 위에서!</Text></View>
                        </View>
                    )}
                    {mode === 'LUNGE' && (
                        <View style={styles.imageContainer}>
                            <Image source={require('../../assets/images/ready_perfect.png')} style={styles.referenceImage} />
                            <View style={styles.captionBox}><Info size={14} color="#FCD34D" /><Text style={styles.captionText}>▲ 상체는 세우고 시선은 정면 유지!</Text></View>
                        </View>
                    )}
                </View>
              </ScrollView>

              <View style={styles.modalButtonGroup}>
                <TouchableOpacity style={styles.hideTodayButton} onPress={hideHelpToday}>
                  <Text style={styles.hideTodayButtonText}>오늘 하루 보지 않기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButtonFlex} onPress={() => { setShowHelp(false); if(countdown === null && !isTimerRunning) setCountdown(3); }}>
                  <Text style={styles.confirmButtonText}>{isTimerRunning ? '닫기' : '완벽하게 이해했습니다'}</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.logoSection}>
          <Bot size={60} color="#34D399" style={{marginBottom:16}} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={styles.mainTitle}>AI 영상 분석</Text>
            <TouchableOpacity onPress={() => setShowInfoModal(true)}><HelpCircle size={24} color="#9CA3AF" /></TouchableOpacity>
          </View>
          <Text style={styles.mainSubTitle}>스윙 속도, 자세, 풋워크를 분석하여{'\n'}전문적인 피드백을 제공합니다.</Text>
        </View>

        <View style={styles.modeSelectionSection}>
          <Text style={styles.historyTitle}>🎯 분석 모드 선택</Text>
          <View style={styles.modeGrid}>
            {[
              { id: 'SWING', name: '스윙 모드', icon: <Zap size={24} color={mode === 'SWING' ? '#111827' : '#F472B6'} /> },
              { id: 'LUNGE', name: '준비 자세', icon: <Activity size={24} color={mode === 'LUNGE' ? '#111827' : '#60A5FA'} /> },
              { id: 'FOOTWORK', name: '풋워크 게임', icon: <Move size={24} color={mode === 'FOOTWORK' ? '#111827' : '#FCD34D'} /> },
              { id: 'RHYTHM', name: '나와의 랠리', icon: <Music size={24} color={mode === 'RHYTHM' ? '#111827' : '#10B981'} /> }
            ].map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.modeSelectCard, mode === item.id && styles.modeSelectCardActive]}
                onPress={() => setMode(item.id as AnalysisMode)}
                activeOpacity={0.8}
              >
                {item.icon}
                <Text style={[styles.modeSelectCardText, mode === item.id && styles.modeSelectCardTextActive]}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.mainStartButton} onPress={enterAnalysisMode} activeOpacity={0.8}>
          <Text style={styles.mainStartButtonText}>분석 시작</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainStartButton, { backgroundColor: '#3B82F6', marginTop: -10 }]}
          onPress={() => setShowRealtimeMode(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.mainStartButtonText, { color: 'white' }]}>경기 실시간 (반코트) 분석 시작</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.matchBanner, !canMatchStyle && styles.matchBannerDisabled]}
          onPress={() => canMatchStyle ? startStyleMatch() : Alert.alert('알림', '스윙, 준비자세, 풋워크 기록을 1개 이상씩 모아주세요!')}
          activeOpacity={0.9}
        >
          <View style={styles.matchBannerContent}>
            <View>
              <Text style={styles.matchBannerSub}>내 스탯으로 보는</Text>
              <Text style={styles.matchBannerTitle}>배드민턴 플레이 스타일 분석</Text>
            </View>
            {canMatchStyle ? <Play size={24} color="white" fill="white" /> : <Square size={24} color="rgba(255,255,255,0.5)" />}
          </View>
          {!canMatchStyle && (<Text style={styles.matchBannerReqText}>* 모든 모드 기록 1회 이상 필요</Text>)}
        </TouchableOpacity>

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>📌 정확한 분석을 위한 가이드</Text>
          <View style={styles.stepItem}><View style={styles.iconBox}><Smartphone size={24} color="#34D399" /></View><Text style={styles.stepText}>삼각대를 이용해 휴대폰을 고정해 주세요.</Text></View>
          <View style={styles.stepItem}><View style={styles.iconBox}><User size={24} color="#60A5FA" /></View><Text style={styles.stepText}>머리부터 발끝까지 전신이 화면에 나와야 합니다.</Text></View>
          <View style={styles.stepItem}><View style={styles.iconBox}><Eye size={24} color="#A78BFA" /></View><Text style={styles.stepText}>정면보다는 측면에서 촬영할 때 가장 정확합니다.</Text></View>
          <View style={styles.stepItem}><View style={styles.iconBox}><Clock size={24} color="#FCD34D" /></View><Text style={styles.stepText}>시작 후 3초간 준비 자세를 취해주세요.</Text></View>
        </View>

        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>🏸 플레이 스타일 기록</Text>
          {styleHistory.length > 0 ? (
            styleHistory.map((item) => (
              <View key={item.id} style={styles.styleHistoryCard}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  onPress={() => {
                    setMatchedStyle(PLAYER_STYLES[item.styleId as keyof typeof PLAYER_STYLES]);
                    setShowMatchResult(true);
                  }}
                >
                  <Image source={item.image} style={styles.styleHistoryImg} />
                  <View>
                    <Text style={styles.styleHistoryDate}>{formatYMD(item.date)}</Text>
                    <Text style={styles.styleHistoryName}>{item.name}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButtonOld} onPress={() => deleteStyleHistory(item.id)}>
                  <Trash2 size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.historyPlaceholder}>
              <User size={24} color="#4B5563" style={{ marginBottom: 8 }} />
              <Text style={{ color: '#6B7280' }}>아직 매칭된 스타일이 없습니다.</Text>
            </View>
          )}
        </View>

        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>📜 최근 분석 기록</Text>
          <View style={styles.historyList}>
            {history.length > 0 ? (
              history.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <TouchableOpacity
                    style={styles.historyItemContent}
                    onPress={() => { setSelectedReport(item); setShowReport(true); }}
                  >
                    <View style={styles.historyItemLeft}>
                      <View style={styles.historyIconBox}>
                        {getModeIcon(item.mode)}
                      </View>
                      <View>
                        <Text style={styles.historyModeName}>{getModeName(item.mode)}</Text>
                        <Text style={styles.historyDate}>{formatYMD(item.date)}</Text>
                      </View>
                    </View>
                    <View style={styles.historyItemRight}>
                      <Text style={styles.historyScore}>{item.avgScore}점</Text>
                      <ChevronRight size={20} color="#4B5563" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteHistoryItem(item.id, item.docId, item.mode)}
                  >
                    <Trash2 size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>저장된 기록이 없습니다.</Text>
            )}
          </View>

          {history.length > 0 && (
            <TouchableOpacity
              style={styles.insightButton}
              onPress={() => navigation.navigate('InsightDashboard')}
              activeOpacity={0.8}
            >
              <View style={styles.insightButtonContent}>
                <BarChart2 size={20} color="#FCD34D" />
                <Text style={styles.insightButtonText}>내 성장 리포트 전체 보기 및 AI 분석</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent={false} visible={showReport} onRequestClose={() => setShowReport(false)}>
        {selectedReport && (
          <View style={styles.reportContainer}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>AI 분석 리포트</Text>
                <Text style={styles.reportDate}>
                  {formatYMD(selectedReport.date)} ({getModeName(selectedReport.mode)})
                </Text>
                {(selectedReport.mode === 'FOOTWORK' || selectedReport.mode === 'RHYTHM' || selectedReport.mode === 'REALTIME_MATCH') && (<View style={styles.difficultyBadge}><Text style={styles.difficultyText}>{selectedReport.difficulty} MODE</Text></View>)}
              </View>

              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>종합 점수</Text>
                <Text style={styles.scoreValue}>{selectedReport.avgScore}<Text style={{ fontSize: 30 }}>점</Text></Text>
                <View style={styles.countBadge}>
                  <Text style={{ color: '#111827', fontWeight: 'bold' }}>
                    {selectedReport.mode === 'SWING' ? `${selectedReport.totalCount}회 수행` : selectedReport.mode === 'RHYTHM' ? `총 ${selectedReport.totalCount}노트 처리` : selectedReport.mode === 'REALTIME_MATCH' ? `총 ${selectedReport.totalCount}회 스텝` : `평균 안정성 ${selectedReport.avgScore}점`}
                    {' | '}최고기록: {Math.floor(selectedReport.maxRecord)}{selectedReport.mode === 'SWING' ? 'km/h' : selectedReport.mode === 'RHYTHM' ? 'Combo' : selectedReport.mode === 'REALTIME_MATCH' ? '스텝' : '초'}
                  </Text>
                </View>
              </View>

              {selectedReport.mode === 'REALTIME_MATCH' && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <View style={styles.subStatBox}>
                      <Activity size={24} color="#F472B6" />
                      <Text style={styles.subStatLabel}>평균 복귀</Text>
                      <Text style={styles.subStatValue}>{selectedReport.averageRecoveryMs && selectedReport.averageRecoveryMs > 0 ? `${selectedReport.averageRecoveryMs}ms` : '-'}</Text>
                      <Text style={styles.subStatSubText}>홈 포지션 회귀율</Text>
                  </View>
                  <View style={styles.subStatBox}>
                      <Compass size={24} color="#60A5FA" />
                      <Text style={styles.subStatLabel}>코트 장악력</Text>
                      <Text style={styles.subStatValue}>{selectedReport.courtCoveragePct}%</Text>
                      <Text style={styles.subStatSubText}>6코너 커버리지</Text>
                  </View>
                  <View style={styles.subStatBox}>
                      <Flame size={24} color="#FCD34D" />
                      <Text style={styles.subStatLabel}>하체 밸런스</Text>
                      <Text style={styles.subStatValue}>{selectedReport.postureScore}점</Text>
                      <Text style={styles.subStatSubText}>중심점 안정성</Text>
                  </View>
                </View>
              )}

              {selectedReport.aiEvaluation && (
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>🤖 AI 정밀 역학 분석</Text>
                    <View style={styles.listItem}>
                        <Activity size={20} color="#60A5FA" />
                        <Text style={styles.listText}>{selectedReport.aiEvaluation.swingDetail}</Text>
                    </View>
                    <View style={styles.listItem}>
                        <Move size={20} color="#34D399" />
                        <Text style={styles.listText}>{selectedReport.aiEvaluation.footworkDetail}</Text>
                    </View>
                    <View style={styles.listItem}>
                        <User size={20} color="#FBBF24" />
                        <Text style={styles.listText}>{selectedReport.aiEvaluation.proComparison}</Text>
                    </View>
                  </View>
              )}

              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>🔥 장점</Text>
                {selectedReport.pros && selectedReport.pros.length > 0 ? (
                  selectedReport.pros.map((item, idx) => (<View key={idx} style={styles.listItem}><CheckCircle size={20} color="#34D399" /><Text style={styles.listText}>{item}</Text></View>))
                ) : (<Text style={styles.emptyText}>노력이 조금 더 필요합니다.</Text>)}
              </View>

              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>⚠️ 보완점</Text>
                {selectedReport.cons && selectedReport.cons.length > 0 ? (
                  selectedReport.cons.map((item, idx) => (<View key={idx} style={styles.listItem}><XCircle size={20} color="#EF4444" /><Text style={styles.listText}>{item}</Text></View>))
                ) : (<Text style={styles.emptyText}>고칠 곳이 없습니다. 완벽합니다!</Text>)}
              </View>

              <View style={[styles.sectionContainer, { backgroundColor: '#1F2937', borderColor: '#FCD34D', borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Dumbbell size={24} color="#FCD34D" /><Text style={[styles.sectionTitle, { color: '#FCD34D', marginBottom: 0, marginLeft: 8 }]}>추천 트레이닝</Text>
                </View>
                <Text style={styles.trainingText}>{selectedReport.training}</Text>
              </View>

              <TouchableOpacity style={styles.closeReportButton} onPress={() => setShowReport(false)}><Text style={styles.closeReportText}>닫기</Text></TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>

      <Modal animationType="fade" transparent visible={showSurvey} onRequestClose={() => setShowSurvey(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.surveyModalContent}>
            {SURVEY_QUESTIONS[surveyStep] && (
              <>
                <Text style={styles.surveyProgressText}>질문 {surveyStep + 1} / {SURVEY_QUESTIONS.length}</Text>
                <Text style={styles.surveyQuestion}>{SURVEY_QUESTIONS[surveyStep].q}</Text>
                {SURVEY_QUESTIONS[surveyStep].options.map((opt, idx) => (
                  <TouchableOpacity key={idx} style={styles.surveyOptionBtn} onPress={() => handleSurveyAnswer(opt.type)}><Text style={styles.surveyOptionText}>{opt.text}</Text></TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={false} visible={showMatchResult} onRequestClose={() => setShowMatchResult(false)}>
        {matchedStyle && (
          <View style={styles.resultContainer}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultPreTitle}>당신 안에 잠든 배드민턴 DNA는...</Text>
                <Text style={styles.resultMainTitle}>{matchedStyle.name}</Text>
              </View>

              <View style={styles.photoCard}>
                <View style={styles.photoIconBox}>
                  <Image source={matchedStyle.image} style={{ width: 100, height: 100, borderRadius: 50 }} />
              </View>
                <Text style={styles.photoCardTitle}>{matchedStyle.title}</Text>
                <Text style={styles.photoCardDesc}>{matchedStyle.desc}</Text>
              </View>

              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>📊 나의 종합 스탯</Text>
                {[
                  { label: '파워 (Power)', value: matchedStyle.stats?.power, color: '#F59E0B' },
                  { label: '민첩 (Agility)', value: matchedStyle.stats?.agility, color: '#3B82F6' },
                  { label: '수비 (Defense)', value: matchedStyle.stats?.defense, color: '#10B981' },
                  { label: '기술 (Tech)', value: matchedStyle.stats?.tech, color: '#F472B6' }
                ].map((stat, idx) => (
                  <View key={idx} style={styles.statBarRow}>
                    <Text style={styles.statBarLabel}>{stat.label}</Text>
                    <View style={styles.statBarBg}><View style={[styles.statBarFill, { width: `${stat.value}%`, backgroundColor: stat.color }]} /></View>
                    <Text style={styles.statBarValue}>{stat.value}</Text>
                  </View>
                ))}
                <Text style={styles.statHintText}>* 모든 모드의 최고 기록 갱신 시 스탯이 변동됩니다.</Text>
              </View>

              <View style={styles.youtubeCard}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6}}>
                  <Video size={20} color="#EF4444" /><Text style={{color: 'white', fontWeight: 'bold', fontSize: 16}}>추천 레전드 영상</Text>
                </View>
                <TouchableOpacity style={styles.youtubeLinkBtn} onPress={() => Linking.openURL(matchedStyle.video?.url)}>
                  <Text style={styles.youtubeLinkText} numberOfLines={2}>{matchedStyle.video?.title}</Text>
                  <Text style={{color: '#60A5FA', fontSize: 12, marginTop: 4}}>유튜브에서 보기 ↗</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.closeResultBtn} onPress={() => setShowMatchResult(false)}>
                <Text style={{color: 'white', fontWeight: 'bold', fontSize: 16}}>결과 닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>

      <Modal animationType="fade" transparent visible={showInfoModal} onRequestClose={() => setShowInfoModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI 분석 가이드</Text>
              <TouchableOpacity onPress={() => setShowInfoModal(false)} style={styles.closeButton}><X size={24} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {GENERAL_GUIDE_DATA.map((item, idx) => (
                <View key={idx} style={styles.guideCard}>
                  <View style={styles.guideCardHeader}><View style={styles.guideIconBox}>{item.icon}</View><Text style={styles.guideCardTitle}>{item.title}</Text></View>
                  <View style={styles.guideDivider} />
                  {item.desc.map((d, i) => (<View key={i} style={styles.guideDescRow}><View style={styles.bulletPoint} /><Text style={styles.guideDescText}>{d}</Text></View>))}
                </View>
              ))}
              <TouchableOpacity style={styles.confirmButton} onPress={() => setShowInfoModal(false)}><Text style={styles.confirmButtonText}>확인했습니다</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#111827', paddingHorizontal: 24, paddingTop: 40 },
  logoSection: { alignItems: 'center', marginBottom: 30 },
  mainTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  mainSubTitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 20, lineHeight: 22 },
  mainStartButton: { backgroundColor: '#34D399', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  mainStartButtonText: { color: '#111827', fontSize: 18, fontWeight: 'bold' },

  modeSelectionSection: { marginBottom: 20 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  modeSelectCard: { width: '48%', backgroundColor: '#1F2937', paddingVertical: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  modeSelectCardActive: { backgroundColor: '#34D399', borderColor: '#34D399' },
  modeSelectCardText: { color: '#D1D5DB', fontSize: 16, fontWeight: 'bold', marginTop: 10 },
  modeSelectCardTextActive: { color: '#111827' },

  matchBanner: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 16, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  matchBannerDisabled: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  matchBannerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchBannerSub: { color: '#9CA3AF', fontSize: 12, marginBottom: 4 },
  matchBannerTitle: { color: '#60A5FA', fontSize: 18, fontWeight: 'bold' },
  matchBannerReqText: { color: '#EF4444', fontSize: 11, marginTop: 10 },

  surveyModalContent: { width: '85%', backgroundColor: '#1F2937', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  surveyProgressText: { color: '#60A5FA', fontSize: 14, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  surveyQuestion: { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 24, lineHeight: 28 },
  surveyOptionBtn: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  surveyOptionText: { color: '#D1D5DB', fontSize: 16, textAlign: 'center' },

  resultContainer: { flex: 1, backgroundColor: '#111827', paddingTop: 60, paddingHorizontal: 20 },
  resultHeader: { alignItems: 'center', marginBottom: 24 },
  resultPreTitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 8 },
  resultMainTitle: { color: '#FCD34D', fontSize: 28, fontWeight: 'bold' },
  photoCard: { width: '100%', backgroundColor: '#1F2937', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  photoIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  photoCardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  photoCardDesc: { color: '#D1D5DB', fontSize: 14, lineHeight: 22, textAlign: 'center' },

  statsCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 20, marginBottom: 20 },
  statsTitle: { color: 'white', fontWeight: 'bold', fontSize: 16, marginBottom: 16 },
  statBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statBarLabel: { width: 100, color: '#9CA3AF', fontSize: 13 },
  statBarBg: { flex: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, marginRight: 10 },
  statBarFill: { height: '100%', borderRadius: 5 },
  statBarValue: { width: 30, color: 'white', fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  statHintText: { color: '#6B7280', fontSize: 11, textAlign: 'center', marginTop: 10 },

  youtubeCard: { width: '100%', backgroundColor: '#1F2937', borderRadius: 20, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  youtubeLinkBtn: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 12 },
  youtubeLinkText: { color: '#D1D5DB', fontSize: 14, lineHeight: 20 },
  closeResultBtn: { backgroundColor: '#34D399', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 30, marginBottom: 40 },

  tipCard: { backgroundColor: '#1F2937', padding: 20, borderRadius: 20, marginBottom: 30 },
  tipTitle: { color: 'white', fontWeight: 'bold', fontSize: 18, marginBottom: 20 },
  stepItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  stepTextBox: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepText: { color: '#D1D5DB', fontSize: 14, flex: 1, lineHeight: 20 },

  historySection: { marginBottom: 40 },
  historyTitle: { color: 'white', fontWeight: 'bold', fontSize: 18, marginBottom: 12 },
  historyPlaceholder: { backgroundColor: '#1F2937', height: 100, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#374151' },

  styleHistoryCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  styleHistoryImg: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  styleHistoryDate: { color: '#9CA3AF', fontSize: 12, marginBottom: 4 },
  styleHistoryName: { color: '#60A5FA', fontSize: 16, fontWeight: 'bold' },
  deleteButtonOld: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 },

  historyList: { backgroundColor: '#1F2937', borderRadius: 24, padding: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  historyItemContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 12 },
  historyItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  historyIconBox: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  historyModeName: { color: 'white', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  historyDate: { color: '#6B7280', fontSize: 12 },
  historyItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyScore: { color: '#34D399', fontSize: 16, fontWeight: 'bold' },
  deleteButton: { padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, marginLeft: 4 },
  emptyText: { color: '#6B7280', textAlign: 'center', paddingVertical: 30 },

  insightButton: {
    marginTop: 16,
    backgroundColor: 'rgba(252, 211, 77, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(252, 211, 77, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightButtonText: {
    color: '#FCD34D',
    fontSize: 15,
    fontWeight: 'bold',
  },

  cameraContainer: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  topControlContainer: { position: 'absolute', top: 50, alignSelf: 'center', alignItems: 'center', gap: 12, zIndex: 10 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(31, 41, 55, 0.9)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', gap: 8 },
  modeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  helpButton: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 20 },

  difficultyButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, gap: 6 },
  difficultyButtonText: { color: '#111827', fontWeight: 'bold', fontSize: 12 },

  timerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, gap: 6 },
  timerText: { color: '#9CA3AF', fontWeight: 'bold', fontSize: 14 },

  statsOverlay: {
    position: 'absolute', top: 150, left: 10, right: 10, height: 90,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.9)', borderRadius: 16, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
  },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  statContent: { alignItems: 'center', width: '100%' },
  statLabel: { color: '#9CA3AF', fontSize: 11, marginBottom: 4, textAlign: 'center' },
  statValue: { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  divider: { width: 1, height: '60%', backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 5 },

  feedbackCard: { position: 'absolute', bottom: 150, alignSelf: 'center', width: '70%', backgroundColor: 'rgba(17, 24, 39, 0.95)', borderRadius: 20, padding: 20, borderWidth: 3, alignItems: 'center' },
  feedbackHeader: { alignItems: 'center', gap: 5 },
  feedbackTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  bottomControlContainer: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, zIndex: 20 },
  controlButton: { backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: 14, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  controlButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#1F2937', borderRadius: 24, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  closeButton: { padding: 4 },

  cardSection: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  cardTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  criteriaList: { gap: 10 },
  criteriaRow: { flexDirection: 'row', alignItems: 'center' },
  criteriaLabelBox: { width: 60, marginRight: 10 },
  criteriaLabel: { color: '#D1D5DB', fontSize: 13, fontWeight: 'bold' },
  progressBarContainer: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginRight: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 3 },
  criteriaPct: { color: '#FCD34D', fontWeight: 'bold', fontSize: 13, width: 35, textAlign: 'right' },

  elementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  elementItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, gap: 6 },
  elementText: { color: '#D1D5DB', fontSize: 13 },

  rankBadge: { minWidth: 120, height: 80, borderRadius: 12, borderWidth: 1, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.3)' },
  rankBadgeHeader: { paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  rankGradeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  rankBadgeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  rankValueText: { fontWeight: 'bold', fontSize: 13, marginBottom: 2 },
  rankDescText: { color: '#9CA3AF', fontSize: 10, textAlign: 'center' },

  imageContainer: { marginTop: 12, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, padding: 12 },
  referenceImage: { width: '100%', height: 200, resizeMode: 'contain', borderRadius: 8, marginBottom: 10 },
  captionBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(252, 211, 77, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, width: '100%', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(252, 211, 77, 0.3)' },
  captionText: { color: '#FCD34D', fontSize: 12, fontWeight: 'bold', marginLeft: 6, flexShrink: 1 },

  bulletText: { color: '#D1D5DB', fontSize: 14, marginBottom: 6, lineHeight: 22, paddingLeft: 4 },

  modalButtonGroup: { flexDirection: 'row', gap: 12, marginTop: 16, justifyContent: 'space-between' },
  hideTodayButton: { flex: 1, backgroundColor: '#374151', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hideTodayButtonText: { color: '#D1D5DB', fontSize: 13, fontWeight: 'bold' },
  confirmButtonFlex: { flex: 1.5, backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  confirmButton: { backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },

  modalScrollViewContent: { paddingBottom: 20 },
  footworkOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  arrowRow: { flexDirection: 'row', justifyContent: 'space-between', width: '80%', marginVertical: 40 },
  centerIndicator: { alignItems: 'center', justifyContent: 'center', height: 100 },
  commandText: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 10, textShadowColor: 'black', textShadowRadius: 10 },
  countdownOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  countdownText: { color: '#FCD34D', fontSize: 100, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 },
  countdownSubText: { color: 'white', fontSize: 24, marginTop: 20, fontWeight: 'bold' },

  reportContainer: { flex: 1, backgroundColor: '#111827', padding: 24 },
  reportHeader: { marginTop: 40, marginBottom: 30 },
  reportTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  reportDate: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  difficultyBadge: { alignSelf:'flex-start', backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingVertical:4, paddingHorizontal:8, borderRadius:8, marginTop:8 },
  difficultyText: { color: '#60A5FA', fontWeight:'bold', fontSize:12 },
  scoreCard: { backgroundColor: '#34D399', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24 },
  scoreLabel: { color: '#064E3B', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  scoreValue: { color: '#064E3B', fontSize: 48, fontWeight: 'bold' },
  countBadge: { backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },

  subStatBox: { flex: 1, backgroundColor: '#1F2937', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  subStatLabel: { color: '#9CA3AF', fontSize: 12, marginTop: 10, marginBottom: 4 },
  subStatValue: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  subStatSubText: { color: '#6B7280', fontSize: 10, marginTop: 4 },

  sectionContainer: { backgroundColor: '#1F2937', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 16 },
  listItem: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  listText: { color: '#D1D5DB', fontSize: 15, flex: 1, lineHeight: 22 },
  emptyText: { color: '#6B7280', fontStyle: 'italic' },
  trainingText: { color: '#D1D5DB', fontSize: 15, lineHeight: 22 },
  closeReportButton: { backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  closeReportText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  guideCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  guideCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  guideIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  guideCardTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  guideDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  guideDescRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  bulletPoint: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#9CA3AF', marginTop: 8, marginRight: 8 },
  guideDescText: { color: '#D1D5DB', fontSize: 14, lineHeight: 20, flex: 1 },
});