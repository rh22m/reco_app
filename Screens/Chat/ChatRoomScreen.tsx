import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Send, MoreVertical } from 'lucide-react-native';

import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp, getDoc, getDocs, arrayRemove, deleteDoc, increment } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import OpponentProfileModal from './OpponentProfileModal';

export default function ChatRoomScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { roomId, title, opponentName, opponentId } = route.params || { roomId: 'new_chat', title: '채팅방', opponentName: '상대방' };

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentRoomId, setCurrentRoomId] = useState(roomId);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  const [opponentProfile, setOpponentProfile] = useState<any>({
    id: opponentId,
    name: opponentName,
    location: '조회 중...',
    tier: 'Unranked',
    win: 0,
    loss: 0,
    mannerScore: 5.0,
    avatar: require('../../assets/images/profile.png'),
  });

  const flatListRef = useRef<FlatList>(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // 우측 상단 메뉴 상태

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, user => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  // 1:1 채팅 중복 생성 방지
  useEffect(() => {
    if (currentRoomId === 'new_chat' && currentUser && opponentId && opponentId !== 'bot') {
      const findExistingDirectRoom = async () => {
        const db = getFirestore();
        const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
        const snap = await getDocs(q);
        const existingRoom = snap.docs.find(d => {
          const data = d.data();
          return data.type === 'direct' && data.participants.includes(opponentId);
        });

        if (existingRoom) setCurrentRoomId(existingRoom.id);
      };
      findExistingDirectRoom();
    }
  }, [currentRoomId, currentUser, opponentId]);

  // 안 읽은 메시지(unreadCount) 0으로 초기화
  useEffect(() => {
    if (currentRoomId && currentRoomId !== 'new_chat' && currentRoomId !== 'new_bot_chat' && currentUser) {
        const resetUnreadCount = async () => {
            const db = getFirestore();
            await updateDoc(doc(db, 'chats', currentRoomId), {
                [`unreadCount.${currentUser.uid}`]: 0
            });
        };
        resetUnreadCount();
    }
  }, [currentRoomId, currentUser]);

  const generateBotResponse = (msg: string) => {
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes("개인정보") || lowerMsg.includes("서버") || lowerMsg.includes("코드") || lowerMsg.includes("비밀번호") || lowerMsg.includes("db")) {
      return "보안 및 개인정보 보호 정책에 따라 회원님의 개인정보, 서버 구동 방식, 앱 내부 코드 및 데이터베이스 구조 등 민감한 정보에 대해서는 절대 답변해 드릴 수 없습니다.";
    }
    if (lowerMsg.includes("rmr") || lowerMsg.includes("알엠알")) {
      return "RMR(RECO Match Rating)은 단순한 경기 승패뿐만 아니라 점수 득실차, 경기 소요 시간, 레코 횟수를 통한 지구력, 매너 점수 등을 종합적으로 계산하여 진짜 실력을 측정하는 시스템입니다.";
    }
    if (lowerMsg.includes("레코") || lowerMsg.includes("앱") || lowerMsg.includes("기능")) {
      return "저희 '레코(RECO)'는 단순한 매칭을 넘어 내 주변 매칭 탐색, 워치 연동 실시간 점수 기록, RMR 기반 정밀 실력 분석 등을 제공하는 스마트 배드민턴 플랫폼입니다.";
    }
    if (lowerMsg.includes("배드민턴") || lowerMsg.includes("규칙") || lowerMsg.includes("점수")) {
      return "배드민턴은 기본적으로 21점 3세트 2선승제로 진행됩니다. 20대 20 동점일 경우 듀스가 적용되어 2점을 먼저 내는 쪽이 승리합니다.";
    }
    if (lowerMsg.includes("안녕") || lowerMsg.includes("반가워")) {
      return "안녕하세요! 레코 AI 챗봇입니다. 레코 앱 사용법, RMR 시스템, 배드민턴 규칙에 대해 궁금한 점이 있으시면 편하게 물어보세요!";
    }
    if (lowerMsg.includes("매너") || lowerMsg.includes("노쇼") || lowerMsg.includes("강제 종료")) {
      return "노쇼나 강제 종료 등 비매너 행위 누적 시 패배보다 더 큰 RMR 하락 페널티가 부여되며 서비스 이용이 제한될 수 있습니다.";
    }
    return "죄송합니다. 레코 시스템이나 배드민턴과 관련된 질문을 남겨주시면 최선을 다해 답변해 드릴게요!";
  };

  // 상대방 프로필 정보 가져오기 (티어 등 정확하게)
  useEffect(() => {
    if (opponentId === 'bot') {
      setOpponentProfile({
        id: 'bot', name: '레코 AI 챗봇', location: '레코 공식 고객센터', tier: 'AI Master', win: 999, loss: 0, mannerScore: 5.0, avatar: require('../../assets/images/reco-logo.png'),
      });
      return;
    }

    if (!opponentId) return;
    const fetchOpponentProfile = async () => {
      try {
        const db = getFirestore();
        let pData: any = {};
        const profileDocInfo = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', opponentId, 'profile', 'info'));
        if (profileDocInfo.exists()) {
            pData = profileDocInfo.data();
        } else {
            const profileDoc = await getDoc(doc(db, 'profiles', opponentId));
            if (profileDoc.exists()) pData = profileDoc.data();
        }

        setOpponentProfile({
          id: opponentId,
          name: pData.nickname || opponentName,
          location: pData.region || '미정',
          tier: pData.tier || 'Unranked',
          win: pData.wins || 0,
          loss: pData.losses || 0,
          mannerScore: pData.mannerScore || 5.0,
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : require('../../assets/images/profile.png'),
        });
      } catch (error) {
        console.log("프로필을 불러올 수 없습니다.", error);
      }
    };
    fetchOpponentProfile();
  }, [opponentId, opponentName]);

  // 메시지 실시간 로드
  useEffect(() => {
    if (!currentRoomId || currentRoomId === 'new_chat' || currentRoomId === 'new_bot_chat' || !currentUser) {
       if (opponentId === 'bot') {
         setMessages([{
           id: 'welcome_bot_msg',
           text: '안녕하세요! 레코 공식 AI 챗봇입니다.\n\n앱 사용법, RMR 시스템의 원리, 배드민턴 규칙 등 궁금한 점이 있다면 언제든지 편하게 질문해 주세요! 😊',
           sender: 'other', time: '안내'
         }]);
       } else setMessages([]);
       return;
    }

    const db = getFirestore();
    const q = query(collection(db, 'chats', currentRoomId, 'messages'), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const timeDate = data.createdAt?.toDate() || new Date();
        const hours = timeDate.getHours();
        const minutes = timeDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? '오후' : '오전';

        return {
          id: docSnap.id, text: data.text,
          sender: data.senderId === currentUser.uid ? 'me' : 'other',
          time: `${ampm} ${hours % 12 || 12}:${minutes}`,
        };
      });

      if (opponentId === 'bot') {
         msgs.unshift({ id: 'welcome_bot_msg', text: '안녕하세요! 레코 공식 AI 챗봇입니다.\n\n앱 사용법, RMR 시스템의 원리, 배드민턴 규칙 등 궁금한 점이 있다면 언제든지 편하게 질문해 주세요! 😊', sender: 'other', time: '안내' });
      }

      setMessages(msgs);
      // 메시지가 올 때마다 내가 보고 있는 방이면 내 unreadCount 다시 0으로
      updateDoc(doc(db, 'chats', currentRoomId), { [`unreadCount.${currentUser.uid}`]: 0 }).catch(()=>{});
    });

    return () => unsubscribe();
  }, [currentRoomId, currentUser, opponentId]);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
  }, [messages]);

  // 메시지 전송 로직 (배지 카운트 증가 포함)
  const sendMessage = async () => {
    if (text.trim().length === 0 || !currentUser) return;
    const db = getFirestore();
    let targetRoomId = currentRoomId;
    const userMsg = text.trim();

    try {
      if (targetRoomId === 'new_chat' || targetRoomId === 'new_bot_chat') {
        let myName = currentUser.displayName || '나';
        let myAvatar = currentUser.photoURL || null;
        try {
            const myProfile = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', currentUser.uid, 'profile', 'info'));
            if(myProfile.exists()) {
                myName = myProfile.data().nickname || myName;
                myAvatar = myProfile.data().avatarUrl || myAvatar;
            }
        } catch(e) {}

        const roomRef = await addDoc(collection(db, 'chats'), {
          matchTitle: opponentId === 'bot' ? '레코 공식 AI' : '1:1 대화',
          participants: [currentUser.uid, opponentId],
          participantDetails: {
            [currentUser.uid]: { name: myName, avatarUrl: myAvatar },
            [opponentId]: { name: opponentProfile.name, avatarUrl: opponentProfile.avatar?.uri || null }
          },
          // 나 외의 상대방의 unreadCount 1로 시작
          unreadCount: { [opponentId]: 1, [currentUser.uid]: 0 },
          updatedAt: serverTimestamp(),
          lastMessage: userMsg,
          type: opponentId === 'bot' ? 'bot' : 'direct'
        });
        targetRoomId = roomRef.id;
        setCurrentRoomId(targetRoomId);
      } else {
         // 기존 방일 경우, 상대방의 unreadCount +1 증가
         const roomDoc = await getDoc(doc(db, 'chats', targetRoomId));
         if (roomDoc.exists()) {
             const participants = roomDoc.data().participants;
             const updates: any = {
                lastMessage: userMsg,
                updatedAt: serverTimestamp()
             };
             participants.forEach((pId: string) => {
                 if (pId !== currentUser.uid) updates[`unreadCount.${pId}`] = increment(1);
             });
             await updateDoc(doc(db, 'chats', targetRoomId), updates);
         }
      }

      await addDoc(collection(db, 'chats', targetRoomId, 'messages'), {
        text: userMsg, senderId: currentUser.uid, createdAt: serverTimestamp()
      });
      setText('');

      if (opponentId === 'bot') {
        setTimeout(async () => {
          try {
            const botReply = generateBotResponse(userMsg);
            await addDoc(collection(db, 'chats', targetRoomId, 'messages'), { text: botReply, senderId: 'bot', createdAt: serverTimestamp() });
            // 봇이 보낼 때 내 unreadCount를 올릴 필요는 없음 (보고 있으니까)
            await updateDoc(doc(db, 'chats', targetRoomId), { lastMessage: botReply, updatedAt: serverTimestamp() });
          } catch (e) { console.error("챗봇 응답 실패", e); }
        }, 1500);
      }
    } catch (error) {
      console.error("메시지 전송 실패:", error);
    }
  };

  // 우측 상단 옵션: 방 나가기
  const handleLeaveRoom = () => {
    setShowMenu(false);
    Alert.alert('채팅방 나가기', '방을 나가면 대화 내용이 모두 사라집니다. 정말 나가시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: async () => {
          if (!currentRoomId || currentRoomId === 'new_chat' || currentRoomId === 'new_bot_chat') {
              navigation.goBack(); return;
          }
          try {
              const db = getFirestore();
              const roomRef = doc(db, 'chats', currentRoomId);
              const roomDoc = await getDoc(roomRef);
              if (roomDoc.exists()) {
                  const currentParticipants = roomDoc.data().participants || [];
                  if (currentParticipants.length <= 1) {
                      await deleteDoc(roomRef); // 나 혼자면 완전 삭제
                  } else {
                      await updateDoc(roomRef, { participants: arrayRemove(currentUser.uid) }); // 배열에서 나만 빼기
                  }
              }
              navigation.goBack();
          } catch (e) {
              Alert.alert('오류', '방을 나가는 데 실패했습니다.');
          }
      }}
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isMe && (
          <TouchableOpacity onPress={() => setModalVisible(true)} activeOpacity={0.8}>
            <Image source={opponentProfile.avatar} style={styles.avatarCircle} />
          </TouchableOpacity>
        )}
        <View style={{ maxWidth: '70%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
            <Text style={[styles.msgText, isMe ? styles.msgTextRight : styles.msgTextLeft]}>{item.text}</Text>
          </View>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft color="white" size={24} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.headerSubTitle} numberOfLines={1}>{opponentName}</Text>
        </View>
        <View style={{ width: 40, alignItems: 'flex-end' }}>
            {opponentId !== 'bot' && (
              <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={{padding: 8}}>
                <MoreVertical color="white" size={20} />
              </TouchableOpacity>
            )}
        </View>
      </View>

      {/* 우측 상단 옵션 메뉴 팝업 */}
      {showMenu && (
          <TouchableOpacity
              style={styles.menuOverlay}
              activeOpacity={1}
              onPress={() => setShowMenu(false)}
          >
              <View style={styles.menuBox}>
                  <TouchableOpacity style={styles.menuItem} onPress={handleLeaveRoom}>
                      <Text style={styles.menuTextDestructive}>채팅방 나가기</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#6B7280"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={200}
          />
          <TouchableOpacity onPress={sendMessage} style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]} disabled={!text.trim()}>
            <Send color="white" size={20} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <OpponentProfileModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        userProfile={opponentProfile}
        currentUser={currentUser} // 추가
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, backgroundColor: '#1F2937', borderBottomWidth: 1, borderBottomColor: '#374151', zIndex: 10 },
  backBtn: { padding: 12 },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: 'white' },
  headerSubTitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#374151', marginRight: 8, marginTop: 2 },
  bubble: { padding: 12, borderRadius: 18, marginBottom: 4 },
  bubbleLeft: { backgroundColor: '#374151', borderTopLeftRadius: 4 },
  bubbleRight: { backgroundColor: '#34D399', borderTopRightRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextLeft: { color: 'white' },
  msgTextRight: { color: '#064E3B', fontWeight: '500' },
  timeText: { fontSize: 11, color: '#6B7280', marginHorizontal: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingHorizontal: 16, backgroundColor: '#1F2937', borderTopWidth: 1, borderTopColor: '#374151' },
  input: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: '#374151', borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: 'white', marginRight: 10, textAlignVertical: 'center' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#34D399', justifyContent: 'center', alignItems: 'center', marginBottom: 0 },
  sendBtnDisabled: { backgroundColor: '#4B5563', opacity: 0.5 },
  // 옵션 메뉴 스타일
  menuOverlay: { position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 100 },
  menuBox: { position: 'absolute', top: 5, right: 15, backgroundColor: '#1F2937', borderRadius: 8, padding: 5, elevation: 5, borderWidth: 1, borderColor: '#374151' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 20 },
  menuTextDestructive: { color: '#EF4444', fontSize: 15, fontWeight: 'bold' }
});