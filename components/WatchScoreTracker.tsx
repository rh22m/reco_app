import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { sendMessage, watchEvents } from 'react-native-wear-connectivity';
import { RotateCcw, Play, Pause, Smartphone } from 'lucide-react-native';

const WatchScoreTracker = () => {
  const [isGameActive, setIsGameActive] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [isPause, setIsPause] = useState(false);
  const [timer, setTimer] = useState("00:00");

  useEffect(() => {
    const unsubscribe = watchEvents.on('message', (msg: any) => {
      // [추가] 폰에서 생존 확인 요청(PING) 시 응답(PONG) 전송
      if (msg.type === 'PING') {
        sendMessage({ type: 'PONG' });
        return;
      }

      // 1. 상태 동기화 (점수, 일시정지)
      if (msg.type === 'SYNC_STATE') {
        if (!isGameActive) setIsGameActive(true);
        setMyScore(msg.myScore);
        setOpponentScore(msg.opponentScore);
        setIsPause(msg.isPause);
      }
      // 2. 타이머 동기화
      else if (msg.type === 'SYNC_TIMER') {
        if (!isGameActive) setIsGameActive(true);
        setTimer(msg.timer);
      }
      // 3. 기존 통합 동기화
      else if (msg.type === 'SYNC_UPDATE') {
        if (!isGameActive) setIsGameActive(true);
        setMyScore(msg.myScore);
        setOpponentScore(msg.opponentScore);
        setIsPause(msg.isPause);
        setTimer(msg.timer);
      }
      // 4. 경기 종료
      else if (msg.type === 'GAME_END') {
        setIsGameActive(false);
        setMyScore(0);
        setOpponentScore(0);
        setTimer("00:00");
      }
    });
    return () => unsubscribe();
  }, [isGameActive]);

  const sendCommand = (command: string) => {
    sendMessage({ command });
  };

  if (!isGameActive) {
    return (
      <View style={styles.waitingContainer}>
        <View style={styles.waitingIconCircle}>
            <Smartphone size={32} color="#34D399" />
        </View>
        <Text style={styles.waitingTitle}>RECO</Text>
        <Text style={styles.waitingSubtitle}>휴대폰에서 경기를{"\n"}시작해주세요</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 상단 타이머 */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{timer}</Text>
      </View>

      {/* 상단: 상대방 점수 */}
      <TouchableOpacity
        style={[styles.scoreHalf, { backgroundColor: '#34D399' }]}
        onPress={() => sendCommand('INCREMENT_OPP')}
      >
        <Text style={[styles.scoreText]}>{opponentScore}</Text>
      </TouchableOpacity>

      {/* 하단: 내 점수 */}
      <TouchableOpacity
        style={[styles.scoreHalf, { backgroundColor: '#38BDF8' }]}
        onPress={() => sendCommand('INCREMENT_MY')}
      >
        <Text style={styles.scoreText}>{myScore}</Text>
      </TouchableOpacity>

      {/* 좌측: Undo */}
      <View style={[styles.overlayButton, { left: 10 }]}>
        <TouchableOpacity
            style={styles.circleButton}
            onPress={() => sendCommand('UNDO')}
        >
          <RotateCcw size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 우측: Pause */}
      <View style={[styles.overlayButton, { right: 10 }]}>
        <TouchableOpacity
            style={styles.circleButton}
            onPress={() => sendCommand('PAUSE_TOGGLE')}
        >
          {isPause ? (
            <Play size={24} color="#fff" fill="#fff" />
          ) : (
            <Pause size={24} color="#fff" fill="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  timerContainer: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  timerText: { color: 'white', fontSize: 14, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  scoreHalf: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  scoreText: { fontSize: 60, fontWeight: '900', color: '#fff' },
  overlayButton: { position: 'absolute', top: '50%', marginTop: -25, justifyContent: 'center', zIndex: 10 },
  circleButton: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  waitingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  waitingIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#34D399',
  },
  waitingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0,
    marginBottom: 8,
  },
  waitingSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 15,
  }
});

export default WatchScoreTracker;