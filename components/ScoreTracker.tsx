import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Modal,
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  PermissionsAndroid,
  Alert
} from 'react-native';
import { RotateCcw, Play, Pause, ArrowLeft, XCircle, AlertTriangle, Timer, TrendingUp, Activity, Flame, Trophy, Zap, ShieldAlert, Lightbulb, Watch, Users, X } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { sendMessage, watchEvents } from 'react-native-wear-connectivity';

import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export interface PointLog {
  scorer: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  setIndex: number;
  timestamp: number;
  duration: number;
}

interface ScoreTrackerProps {
  onComplete: (result: {
    duration: number;
    team1Wins: number;
    team2Wins: number;
    isForced: boolean;
    stopReason?: 'injury' | 'etc';
    pointLogs: PointLog[];
    team1Name: string;
    team2Name: string;
  }) => void;
  onCancel: () => void;
  guestMatchId?: string | null;
  onClearGuestMatch?: () => void;
}

const TIPS = [
   { icon: <Trophy size={32} color="#FBBF24" />, title: "RMR은 단순 승패가 아닙니다", desc: "단순 결과가 아닌 경기 내용을 평가합니다. 졌더라도 좋은 플레이는 점수 하락을 막아줍니다." },
  { icon: <Zap size={32} color="#34D399" />, title: "지구력 점수 올리기", desc: "30초 이상 긴 랠리를 이겨보세요. '지구력' 수치가 올라가 RMR을 높여줍니다." },
  { icon: <Timer size={32} color="#F472B6" />, title: "속도전의 묘미", desc: "30초 미만의 짧고 강한 랠리 승부는 '속도' 능력치를 올려줍니다. 빠른 공격을 시도해보세요!" },
  { icon: <ShieldAlert size={32} color="#EF4444" />, title: "중도 포기는 금물!", desc: "경기를 강제로 종료하면 패배보다 더 큰 페널티를 받게 됩니다. 끝까지 매너있는 플레이를 보여주세요." },
  { icon: <Lightbulb size={32} color="#60A5FA" />, title: "위기관리 능력", desc: "20:20 듀스 상황에서의 득점은 일반 득점보다 가치가 높습니다. 중요한 순간에 강한 모습을 보여주세요." },
  { icon: <Flame size={32} color="#F97316" />, title: "후반 집중력", desc: "끝까지 집중하세요! 1세트보다 마지막 세트 성적이 좋으면 추가 점수를 받습니다." },
  { icon: <TrendingUp size={32} color="#A78BFA" />, title: "역전의 짜릿함", desc: "3점 차 이상 뒤지고 있어도 포기하지 마세요. 역전에 성공하면 RMR이 더 많이 오릅니다." },
];

function InternalGameLoadingScreen({ visible, onFinish }: { visible: boolean; onFinish: () => void }) {
  const [tipIndex, setTipIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setTipIndex(Math.floor(Math.random() * TIPS.length));
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => onFinish());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;
  const currentTip = TIPS[tipIndex];

  return (
    <Modal visible={visible} transparent={true} animationType="none">
      <View style={loadingStyles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <Animated.View style={[loadingStyles.card, { opacity: fadeAnim }]}>
          <View style={loadingStyles.iconContainer}>{currentTip.icon}</View>
          <Text style={loadingStyles.loadingText}>경기 분석 준비 중...</Text>
          <ActivityIndicator size="large" color="#34D399" style={{ marginVertical: 20 }} />
          <View style={loadingStyles.tipBox}>
            <Text style={loadingStyles.tipLabel}>💡 RMR TIP</Text>
            <Text style={loadingStyles.tipTitle}>{currentTip.title}</Text>
            <Text style={loadingStyles.tipDesc}>{currentTip.desc}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const loadingStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.98)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', alignItems: 'center' },
  iconContainer: { marginBottom: 16, padding: 16, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 50 },
  loadingText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  tipBox: { backgroundColor: '#1E293B', padding: 24, borderRadius: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  tipLabel: { color: '#34D399', fontWeight: 'bold', fontSize: 12, marginBottom: 8, letterSpacing: 1 },
  tipTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  tipDesc: { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});

export function ScoreTracker({ onComplete, onCancel, guestMatchId, onClearGuestMatch }: ScoreTrackerProps) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [isFriendModalVisible, setIsFriendModalVisible] = useState(false);

  // 실시간 동기화 관련 상태
  const [opponentUid, setOpponentUid] = useState<string | null>(null);
  const [isWaitingAcceptance, setIsWaitingAcceptance] = useState(false);
  const [isHost, setIsHost] = useState(true);
  const [matchId, setMatchId] = useState<string | null>(null);

  const [isSetupMode, setIsSetupMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('나(본인)');

  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [team1SetWins, setTeam1SetWins] = useState(0);
  const [team2SetWins, setTeam2SetWins] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  const [isWatchConnected, setIsWatchConnected] = useState(false);
  const [showWatchGuide, setShowWatchGuide] = useState(false);
  const guideOpacity = useRef(new Animated.Value(0)).current;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPointTimeRef = useRef<number>(0);
  const [scoreHistory, setScoreHistory] = useState<any[]>([]);
  const [pointLogs, setPointLogs] = useState<PointLog[]>([]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const safeSendMessage = (message: any) => {
    try {
      if (sendMessage) sendMessage(message);
    } catch (error) {
      console.log('워치 연동 모듈 에러 무시');
    }
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        let fetchedNickname = user.displayName;
        const db = getFirestore();
        try {
          const profileDoc = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', user.uid, 'profile', 'info'));
          if (profileDoc.exists() && profileDoc.data().nickname) fetchedNickname = profileDoc.data().nickname;
        } catch(e) {}
        const finalName = fetchedNickname ? `나(${fetchedNickname})` : '나(본인)';
        setTeam2Name(finalName);
      }
    });
    return () => unsubscribe();
  }, []);

  // 친구 목록 불러올 때 상대방의 티어 정보도 함께 구성
  useEffect(() => {
    if (!currentUser) return;
    const db = getFirestore();
    const friendsRef = collection(db, 'users', currentUser.uid, 'friends');

    const unsubscribe = onSnapshot(friendsRef, async (snapshot) => {
      const friendsData = await Promise.all(snapshot.docs.map(async (friendDoc) => {
        let pData: any = {};
        try {
            const profileDocInfo = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', friendDoc.id, 'profile', 'info'));
            if (profileDocInfo.exists()) pData = profileDocInfo.data();
        } catch (e) {}

        return {
          id: friendDoc.id,
          name: pData.nickname || friendDoc.data().name || '이름 없음',
          tier: pData.tier || 'Unranked',
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : require('../assets/images/profile.png'),
        };
      }));
      setFriendsList(friendsData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // ✅ [게스트 관전 모드] 상대방이 점수 올릴 때마다 화면에 미러링
  useEffect(() => {
    if (guestMatchId) {
       setIsSetupMode(false);
       setIsHost(false);
       setMatchId(guestMatchId);
       const db = getFirestore();
       const unsub = onSnapshot(doc(db, 'matches', guestMatchId), (snap) => {
           const data = snap.data();
           if (data) {
               // 미러링: 게스트 폰에서는 자기가 team2(아래쪽), 방장이 team1(위쪽)
               setTeam1Name(data.hostName);
               setTeam2Name(data.guestName);
               setTeam1Score(data.hostScore);
               setTeam2Score(data.guestScore);
               setTeam1SetWins(data.hostSets);
               setTeam2SetWins(data.guestSets);
               setElapsedTime(data.timer);

               if (data.status === 'finished') {
                   unsub();
                   if (onClearGuestMatch) onClearGuestMatch();
                   onComplete({
                       duration: data.timer,
                       team1Wins: data.hostSets, // 방장 득점 세트
                       team2Wins: data.guestSets, // 게스트 득점 세트
                       isForced: false,
                       pointLogs: [], // 관전자 모드는 로그 생략
                       team1Name: data.hostName,
                       team2Name: data.guestName
                   });
               } else if (data.status === 'canceled') {
                   unsub();
                   if (onClearGuestMatch) onClearGuestMatch();
                   Alert.alert("경기 중단", "상대방이 경기를 중단했습니다.");
                   onCancel();
               }
           }
       });
       return () => unsub();
    }
  }, [guestMatchId]);

  const handlersRef = useRef({
    handleScore: (team: 'team1' | 'team2') => {},
    handleUndo: () => {},
    togglePause: () => {},
    setConnected: () => {}
  });

  useEffect(() => {
    handlersRef.current = {
      handleScore: (team) => { if (isHost) handleScore(team) },
      handleUndo: () => { if (isHost) handleUndo() },
      togglePause: () => { if (isHost) setIsTimerRunning(prev => !prev) },
      setConnected: () => setIsWatchConnected(true)
    };
  });

  useEffect(() => {
    let unsubscribe: any;
    try {
      if (watchEvents && typeof watchEvents.on === 'function') {
        unsubscribe = watchEvents.on('message', (msg) => {
          if (!msg) return;
          if (msg.type === 'PONG') {
            handlersRef.current.setConnected();
            return;
          }
          if (msg.command) {
            switch (msg.command) {
              case 'INCREMENT_MY': handlersRef.current.handleScore('team2'); break;
              case 'INCREMENT_OPP': handlersRef.current.handleScore('team1'); break;
              case 'UNDO': handlersRef.current.handleUndo(); break;
              case 'PAUSE_TOGGLE': handlersRef.current.togglePause(); break;
            }
          }
        });
      }
    } catch (e) {}
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading && isHost) interval = setInterval(() => safeSendMessage({ type: 'PING' }), 1000);
    return () => clearInterval(interval);
  }, [isLoading, isHost]);

  useEffect(() => {
    if (!isSetupMode && !isLoading && isHost) safeSendMessage({ type: 'SYNC_TIMER', timer: formatTime(elapsedTime) });
  }, [elapsedTime, isSetupMode, isLoading, isHost]);

  useEffect(() => {
    if (!isSetupMode && !isLoading && isHost) safeSendMessage({ type: 'SYNC_STATE', myScore: team2Score, opponentScore: team1Score, isPause: !isTimerRunning });
  }, [team1Score, team2Score, isTimerRunning, isSetupMode, isLoading, isHost]);

  useEffect(() => {
    return () => { if (!isSetupMode && isHost) safeSendMessage({ type: 'GAME_END' }); };
  }, [isSetupMode, isHost]);

  useEffect(() => {
    if (!isSetupMode && !isLoading && isWatchConnected && isHost) {
        setTimeout(() => {
            setShowWatchGuide(true);
            Animated.timing(guideOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
            setTimeout(() => {
                Animated.timing(guideOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setShowWatchGuide(false));
            }, 5000);
        }, 1000);
    }
  }, [isSetupMode, isLoading, isWatchConnected, isHost]);

  useEffect(() => {
    if (isTimerRunning && isHost) {
      if (lastPointTimeRef.current === 0) lastPointTimeRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerRunning, isHost]);

  const handleStartButtonPress = async () => {
    if (!team1Name.trim()) setTeam1Name("TEAM 1");
    Keyboard.dismiss();

    if (Platform.OS === 'android' && Platform.Version >= 31) {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        if (granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('블루투스 권한이 거부되어 워치 연동이 원활하지 않을 수 있습니다.');
        }
      } catch (err) {
        console.warn(err);
      }
    }

    setIsWatchConnected(false);

    if (opponentUid) {
      setIsWaitingAcceptance(true);
      try {
        const db = getFirestore();
        const matchRef = await addDoc(collection(db, 'matches'), {
            hostId: currentUser.uid,
            hostName: team2Name,
            guestId: opponentUid,
            guestName: team1Name,
            status: 'pending',
            hostScore: 0,
            guestScore: 0,
            hostSets: 0,
            guestSets: 0,
            timer: 0,
            createdAt: serverTimestamp()
        });

        // 상대방 수락 대기
        const unsub = onSnapshot(matchRef, (docSnap) => {
            const data = docSnap.data();
            if (data?.status === 'accepted') {
                unsub();
                setMatchId(matchRef.id);
                setIsHost(true);
                setIsWaitingAcceptance(false);
                setIsLoading(true);
            } else if (data?.status === 'declined') {
                unsub();
                setIsWaitingAcceptance(false);
                Alert.alert("초대 거절됨", "상대방이 초대를 거절했습니다.");
            }
        });
      } catch (error) {
        setIsWaitingAcceptance(false);
        Alert.alert("오류", "초대 전송 중 문제가 발생했습니다.");
      }
    } else {
      setIsLoading(true);
    }
  };

  const handleLoadingFinish = () => {
    setIsLoading(false);
    setIsSetupMode(false);
    setIsTimerRunning(true);
    lastPointTimeRef.current = Date.now();
  };

  const handleScore = (team: 'team1' | 'team2') => {
    if (!isTimerRunning || !isHost) return;

    setScoreHistory(prev => [...prev, { t1Score: team1Score, t2Score: team2Score, t1Wins: team1SetWins, t2Wins: team2SetWins }]);

    const now = Date.now();
    const duration = (now - lastPointTimeRef.current) / 1000;
    lastPointTimeRef.current = now;

    let newT1 = team === 'team1' ? team1Score + 1 : team1Score;
    let newT2 = team === 'team2' ? team2Score + 1 : team2Score;
    let newSet1 = team1SetWins;
    let newSet2 = team2SetWins;

    const currentSet = newSet1 + newSet2 + 1;
    const newLog: PointLog = { scorer: team === 'team1' ? 'A' : 'B', scoreA: newT1, scoreB: newT2, setIndex: currentSet, timestamp: now, duration: duration };
    const updatedLogs = [...pointLogs, newLog];
    setPointLogs(updatedLogs);

    let setWinner = null;
    if ((newT1 >= 21 || newT2 >= 21) && Math.abs(newT1 - newT2) >= 2) {
       if (newT1 > newT2) setWinner = 'team1'; else setWinner = 'team2';
    }
    if (newT1 === 30) setWinner = 'team1';
    if (newT2 === 30) setWinner = 'team2';

    if (setWinner) {
      if (setWinner === 'team1') newSet1++; else newSet2++;
      newT1 = 0; newT2 = 0;
      setScoreHistory([]);
    }

    setTeam1Score(newT1); setTeam2Score(newT2);
    setTeam1SetWins(newSet1); setTeam2SetWins(newSet2);

    // 상대방(게스트) 화면 동기화를 위한 DB 업데이트
    if (matchId) {
        const db = getFirestore();
        updateDoc(doc(db, 'matches', matchId), {
            hostScore: newT2,
            guestScore: newT1,
            hostSets: newSet2,
            guestSets: newSet1,
            timer: elapsedTime
        });

        if (newSet1 === 2 || newSet2 === 2) {
             updateDoc(doc(db, 'matches', matchId), { status: 'finished' });
        }
    }

    if (newSet1 === 2 || newSet2 === 2) {
      setIsTimerRunning(false);
      onComplete({ duration: elapsedTime, team1Wins: newSet1, team2Wins: newSet2, isForced: false, pointLogs: updatedLogs, team1Name: team1Name || "TEAM 1", team2Name: team2Name });
    }
  };

  const handleUndo = () => {
    if (scoreHistory.length === 0 || !isHost) return;
    const last = scoreHistory[scoreHistory.length - 1];
    setTeam1Score(last.t1Score); setTeam2Score(last.t2Score);
    setTeam1SetWins(last.t1Wins); setTeam2SetWins(last.t2Wins);
    setScoreHistory(prev => prev.slice(0, -1));
    setPointLogs(prev => prev.slice(0, -1));

    if (matchId) {
        const db = getFirestore();
        updateDoc(doc(db, 'matches', matchId), {
            hostScore: last.t2Score,
            guestScore: last.t1Score,
            hostSets: last.t2Wins,
            guestSets: last.t1Wins
        });
    }
  };

  const handleExitPress = () => {
    if (!isHost) {
        Alert.alert("안내", "방장만 경기를 중단할 수 있습니다. 경기를 나가시겠습니까?", [
            { text: "아니오", style: "cancel" },
            { text: "네 (나가기)", onPress: () => { if (onClearGuestMatch) onClearGuestMatch(); onCancel(); } }
        ]);
        return;
    }
    setIsTimerRunning(false);
    setShowExitModal(true);
  };

  const handleExitConfirm = (reason: 'injury' | 'etc' | 'cancel') => {
    setShowExitModal(false);
    safeSendMessage({ type: 'GAME_END' });

    if (matchId && isHost) {
        const db = getFirestore();
        updateDoc(doc(db, 'matches', matchId), { status: 'canceled' });
    }

    if (reason === 'cancel') {
        onCancel();
        return;
    }
    onComplete({
      duration: elapsedTime, team1Wins: team1SetWins, team2Wins: team2SetWins,
      isForced: true, stopReason: reason, pointLogs: pointLogs,
      team1Name: team1Name || "TEAM 1", team2Name: team2Name
    });
  };

  const handleResume = () => {
    setShowExitModal(false);
    setIsTimerRunning(true);
  };

  const handleBackPress = () => {
      if (isWaitingAcceptance && matchId) {
          const db = getFirestore();
          updateDoc(doc(db, 'matches', matchId), { status: 'canceled' });
      }
      onCancel();
  };

  const renderSetupMode = () => (
    <View style={{flex: 1, backgroundColor: '#0f172a'}}>
      <StatusBar barStyle="light-content" backgroundColor="#1e293b" translucent={false} />
      <LinearGradient colors={['#1e293b', '#0f172a']} style={{flex: 1}}>
          <SafeAreaView style={{flex: 1}}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
                  <ScrollView contentContainerStyle={{flexGrow: 1, padding: 24}}>
                      <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
                          <ArrowLeft size={28} color="#94a3b8" />
                      </TouchableOpacity>
                      <View style={{flex: 1, justifyContent: 'center', paddingBottom: 60}}>
                          <View style={styles.setupHeader}>
                              <Text style={styles.setupTitle}>MATCH SETUP</Text>
                              <Text style={styles.setupSubtitle}>경기 참가자를 입력해주세요</Text>
                              <View style={styles.noticeContainer}><Text style={styles.noticeText}>📌 친구 선택 시 실시간 동기화 초대가 발송됩니다.</Text></View>
                          </View>
                          <View style={styles.formCard}>
                              <View style={styles.inputGroup}>
                                  <View style={[styles.colorDot, { backgroundColor: '#34D399' }]} />
                                  <View style={{flex: 1}}>
                                      <Text style={[styles.label, {color:'#34D399'}]}>TEAM 1 (상대)</Text>
                                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                                          <TextInput
                                              style={[styles.input, {flex: 1}]}
                                              placeholder="상대 이름 (직접 입력)"
                                              placeholderTextColor="#64748b"
                                              value={team1Name}
                                              onChangeText={(txt) => { setTeam1Name(txt); setOpponentUid(null); }}
                                              autoCorrect={false}
                                          />
                                          <TouchableOpacity style={styles.friendSelectBtn} onPress={() => setIsFriendModalVisible(true)} activeOpacity={0.8}>
                                              <Users size={20} color="#34D399" />
                                          </TouchableOpacity>
                                      </View>
                                  </View>
                              </View>
                              <View style={styles.vsDivider}><View style={styles.line} /><Text style={styles.vsText}>VS</Text><View style={styles.line} /></View>
                              <View style={styles.inputGroup}>
                                  <View style={[styles.colorDot, { backgroundColor: '#38BDF8' }]} />
                                  <View style={{flex: 1}}>
                                      <Text style={[styles.label, {color:'#38BDF8'}]}>TEAM 2 (나)</Text>
                                      <TextInput
                                          style={[styles.input, { color: '#94a3b8', backgroundColor: '#1e293b' }]}
                                          placeholder="내 이름 불러오는 중..."
                                          placeholderTextColor="#64748b"
                                          value={team2Name}
                                          editable={false}
                                          autoCorrect={false}
                                      />
                                  </View>
                              </View>
                          </View>
                      </View>
                      <TouchableOpacity style={styles.startButton} onPress={handleStartButtonPress} disabled={isWaitingAcceptance || isLoading}>
                          {isWaitingAcceptance ? (
                              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                                  <ActivityIndicator size="small" color="#0f172a" />
                                  <Text style={styles.startButtonText}>상대방 수락 대기중...</Text>
                              </View>
                          ) : (
                              <Text style={styles.startButtonText}>설정 완료</Text>
                          )}
                      </TouchableOpacity>
                  </ScrollView>
              </KeyboardAvoidingView>
          </SafeAreaView>
      </LinearGradient>
    </View>
  );

  const renderGameMode = () => (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent={false} />
      {showWatchGuide && isHost && (
        <Animated.View style={[styles.watchGuideContainer, { opacity: guideOpacity }]} pointerEvents="none">
            <View style={styles.watchGuideContent}><Watch size={24} color="#34D399" /><Text style={styles.watchGuideText}>워치 연결됨! 터치하여 득점 기록</Text></View>
        </Animated.View>
      )}
      <View style={styles.gameContainer}>
        <LinearGradient colors={['#6EE7B7', '#34D399']} style={styles.scoreArea}>
            <View style={styles.inGameHeader}>
                <TouchableOpacity onPress={handleExitPress} style={styles.iconButton}><ArrowLeft size={24} color="rgba(255,255,255,0.8)" /></TouchableOpacity>
                <View style={styles.timerBadge}><Text style={styles.timerText}>{formatTime(elapsedTime)}</Text></View>
                <View style={{width: 24}} />
            </View>
            <TouchableOpacity style={styles.scoreTouchArea} onPress={() => { if(isHost) handleScore('team1') }} activeOpacity={isHost ? 0.8 : 1}>
                <View style={styles.playerBadge}><Text style={styles.playerName}>{team1Name || "TEAM 1"}</Text></View>
                <Text style={styles.bigScore}>{team1Score}</Text>
                <View style={styles.setScoreContainer}><Text style={styles.setScoreLabel}>SET SCORE</Text><Text style={styles.setScoreValue}>{team1SetWins}</Text></View>
            </TouchableOpacity>
        </LinearGradient>

        <LinearGradient colors={['#38BDF8', '#22D3EE']} style={styles.scoreArea}>
            <TouchableOpacity style={styles.scoreTouchArea} onPress={() => { if(isHost) handleScore('team2') }} activeOpacity={isHost ? 0.8 : 1}>
                <View style={styles.setScoreContainerTop}><Text style={styles.setScoreLabel}>SET SCORE</Text><Text style={styles.setScoreValue}>{team2SetWins}</Text></View>
                <Text style={styles.bigScore}>{team2Score}</Text>
                <View style={styles.playerBadge}><Text style={styles.playerName}>{team2Name}</Text></View>
            </TouchableOpacity>

            <View style={styles.controlsBar}>
                <TouchableOpacity onPress={handleUndo} style={styles.controlButtonSide} disabled={scoreHistory.length === 0 || !isHost} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
                    <RotateCcw size={28} color={scoreHistory.length === 0 || !isHost ? "rgba(255,255,255,0.4)" : "white"} />
                    <Text style={[styles.controlLabel, (scoreHistory.length === 0 || !isHost) && {opacity: 0.4}]}>되돌리기</Text>
                </TouchableOpacity>
                <View style={{flex: 1}} />
                {isHost ? (
                    <TouchableOpacity onPress={() => setIsTimerRunning(!isTimerRunning)} style={styles.controlButtonSide} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
                        {isTimerRunning ? <Pause size={32} color="white" fill="white" /> : <Play size={32} color="white" fill="white" />}
                        <Text style={styles.controlLabel}>{isTimerRunning ? "일시정지" : "계속하기"}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.controlButtonSide}>
                        <Activity size={32} color="rgba(255,255,255,0.7)" />
                        <Text style={[styles.controlLabel, {color: 'rgba(255,255,255,0.7)'}]}>관전 중</Text>
                    </View>
                )}
            </View>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {isSetupMode ? renderSetupMode() : renderGameMode()}

      <InternalGameLoadingScreen visible={isLoading} onFinish={handleLoadingFinish} />

      <Modal visible={isFriendModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsFriendModalVisible(false)}>
        <View style={styles.friendModalOverlay}>
            <View style={styles.friendModalContent}>
                <View style={styles.friendModalHeader}>
                    <Text style={styles.friendModalTitle}>친구 목록에서 불러오기</Text>
                    <TouchableOpacity onPress={() => setIsFriendModalVisible(false)}><X size={24} color="#94a3b8" /></TouchableOpacity>
                </View>
                <FlatList
                    data={friendsList}
                    keyExtractor={item => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.friendItem} onPress={() => {
                            setTeam1Name(item.name);
                            setOpponentUid(item.id);
                            setIsFriendModalVisible(false);
                        }}>
                            <Image source={item.avatar} style={styles.friendAvatar} />
                            <View>
                                <Text style={styles.friendNameText}>{item.name}</Text>
                                <Text style={styles.friendTierText}>{item.tier}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyFriendText}>등록된 친구가 없습니다.</Text>}
                />
            </View>
        </View>
      </Modal>

      <Modal visible={showExitModal} transparent={true} animationType="fade" onRequestClose={handleResume}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
                <AlertTriangle size={32} color="#EF4444" style={{marginBottom: 8}}/>
                <Text style={styles.modalTitle}>경기 중단</Text>
                <Text style={styles.modalSubtitle}>중단 사유를 선택해주세요.</Text>
            </View>
            <View style={styles.modalButtonContainer}>
                <TouchableOpacity style={[styles.reasonButton, {borderColor: '#F59E0B'}]} onPress={() => handleExitConfirm('injury')}>
                    <Activity size={20} color="#F59E0B" />
                    <View style={styles.reasonTextContainer}><Text style={[styles.reasonTitle, {color: '#F59E0B'}]}>부상/기권</Text><Text style={styles.reasonDesc}>부상 등으로 경기를 포기합니다.</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reasonButton, {borderColor: '#EF4444'}]} onPress={() => handleExitConfirm('etc')}>
                    <XCircle size={20} color="#EF4444" />
                    <View style={styles.reasonTextContainer}><Text style={[styles.reasonTitle, {color: '#EF4444'}]}>기타 중단</Text><Text style={styles.reasonDesc}>개인 사정으로 경기를 중단합니다.</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reasonButton, {borderColor: '#94a3b8'}]} onPress={() => handleExitConfirm('cancel')}>
                    <View style={styles.reasonTextContainer}><Text style={[styles.reasonTitle, {color: '#94a3b8'}]}>기록 삭제 및 나가기</Text><Text style={styles.reasonDesc}>이 경기는 기록되지 않습니다.</Text></View>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.resumeButton} onPress={handleResume}><Text style={styles.resumeButtonText}>취소 (경기 계속하기)</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  gameContainer: { flex: 1 },
  backButton: { position: 'absolute', top: 20, left: 20, padding: 8, zIndex: 10 },
  setupHeader: { marginBottom: 30, alignItems: 'center', marginTop: 20 },
  setupTitle: { fontSize: 32, fontWeight: '900', color: 'white', letterSpacing: 2 },
  setupSubtitle: { fontSize: 16, color: '#94a3b8', marginTop: 8 },
  noticeContainer: { marginTop: 12, backgroundColor: 'rgba(51, 65, 85, 0.5)', padding: 8, borderRadius: 8 },
  noticeText: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  formCard: { backgroundColor: 'rgba(30, 41, 59, 0.8)', borderRadius: 24, padding: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  inputGroup: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 },
  input: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, color: 'white', fontSize: 18, borderWidth: 1, borderColor: '#334155' },
  friendSelectBtn: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  vsDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#334155' },
  vsText: { color: '#64748b', fontWeight: 'bold', marginHorizontal: 16, fontSize: 14 },
  startButton: { backgroundColor: 'white', padding: 20, borderRadius: 16, alignItems: 'center', marginTop: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  startButtonText: { color: '#0f172a', fontSize: 18, fontWeight: 'bold' },
  friendModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  friendModalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  friendModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  friendModalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  friendItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#0f172a' },
  friendNameText: { color: 'white', fontSize: 16, fontWeight: '600' },
  friendTierText: { color: '#34D399', fontSize: 12, marginTop: 2 },
  emptyFriendText: { color: '#94a3b8', textAlign: 'center', paddingVertical: 40, fontSize: 14 },
  scoreArea: { flex: 1 },
  inGameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 10 },
  iconButton: { padding: 8, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 20 },
  timerBadge: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  timerText: { color: 'white', fontSize: 20, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  scoreTouchArea: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  playerBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 100, marginBottom: 10 },
  playerName: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  bigScore: { fontSize: 140, fontWeight: '800', color: 'white', lineHeight: 140, marginVertical: -10 },
  setScoreContainer: { marginTop: 20, alignItems: 'center', opacity: 0.9 },
  setScoreContainerTop: { marginBottom: 20, alignItems: 'center', opacity: 0.9 },
  setScoreLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  setScoreValue: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  controlsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 30, paddingBottom: 40, paddingTop: 10 },
  controlButtonSide: { alignItems: 'center', gap: 4, minWidth: 60 },
  controlLabel: { color: 'white', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 24, padding: 24, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: '#334155' },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  modalSubtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  modalButtonContainer: { gap: 12 },
  reasonButton: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: '#0f172a', borderWidth: 1, gap: 12 },
  reasonTextContainer: { flex: 1 },
  reasonTitle: { fontSize: 16, fontWeight: 'bold' },
  reasonDesc: { fontSize: 12, color: '#64748b' },
  resumeButton: { marginTop: 20, padding: 16, alignItems: 'center', backgroundColor: '#334155', borderRadius: 12 },
  resumeButtonText: { color: 'white', fontWeight: 'bold' },
  watchGuideContainer: { position: 'absolute', top: 100, alignSelf: 'center', zIndex: 50 },
  watchGuideContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.9)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, gap: 10, borderWidth: 1, borderColor: '#34D399', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  watchGuideText: { color: '#34D399', fontWeight: 'bold', fontSize: 14 }
});