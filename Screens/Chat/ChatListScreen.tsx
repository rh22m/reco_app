import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Users, MessageCircle, Plus, X, Search, Phone } from 'lucide-react-native';

import { getFirestore, collection, onSnapshot, query, where, orderBy, getDocs, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import OpponentProfileModal from './OpponentProfileModal';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export default function ChatListScreen() {
  const navigation = useNavigation<any>();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [friendsList, setFriendsList] = useState<any[]>([]);

  const [viewMode, setViewMode] = useState<'chat' | 'friends'>('chat');
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [isModalVisible, setModalVisible] = useState(false);

  const [isAddFriendVisible, setAddFriendVisible] = useState(false);
  const [addFriendMode, setAddFriendMode] = useState<'nickname' | 'phone'>('nickname');
  const [addFriendInput, setAddFriendInput] = useState('');

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const db = getFirestore();
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let hasBotRoom = false;

      const roomsPromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const opponentId = data.participants.find((id: string) => id !== currentUser.uid) || currentUser.uid;

        if (opponentId === 'bot') hasBotRoom = true;

        const timeDate = data.updatedAt?.toDate() || new Date();
        const hours = timeDate.getHours();
        const minutes = timeDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? '오후' : '오전';
        const formattedTime = `${ampm} ${hours % 12 || 12}:${minutes}`;

        let finalOpponentName = data.participantDetails?.[opponentId]?.name;
        let finalAvatarUrl = data.participantDetails?.[opponentId]?.avatarUrl;

        if (!finalOpponentName || finalOpponentName === '알 수 없음') {
             try {
                 const profileDocInfo = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', opponentId, 'profile', 'info'));
                 if (profileDocInfo.exists() && profileDocInfo.data().nickname) {
                     finalOpponentName = profileDocInfo.data().nickname;
                     finalAvatarUrl = profileDocInfo.data().avatarUrl;
                 }
             } catch (e) {}
        }

        let avatarSource = require('../../assets/images/profile.png');
        if (opponentId === 'bot') {
          avatarSource = require('../../assets/images/reco-logo.png');
        } else if (finalAvatarUrl) {
          avatarSource = { uri: finalAvatarUrl };
        }

        return {
          id: docSnap.id,
          matchTitle: data.type === 'direct' ? finalOpponentName : (data.matchTitle || '채팅방'),
          opponentId: opponentId,
          opponentName: finalOpponentName || (opponentId === 'bot' ? '랠리 AI 챗봇' : '이름 없음'),
          lastMessage: data.lastMessage || '',
          time: formattedTime,
          unreadCount: data.unreadCount?.[currentUser.uid] || 0,
          avatar: avatarSource,
          type: data.type || 'match',
          participants: data.participants
        };
      });

      const resolvedRooms = await Promise.all(roomsPromises);

      if (!hasBotRoom) {
        resolvedRooms.unshift({
          id: 'new_bot_chat',
          matchTitle: '랠리 공식 AI',
          opponentId: 'bot',
          opponentName: '랠리 AI 챗봇',
          lastMessage: '안녕하세요! 랠리 AI 챗봇입니다. 궁금한 점이 있으신가요?',
          time: '상시',
          unreadCount: 0,
          avatar: require('../../assets/images/reco-logo.png'),
          type: 'bot',
        });
      }

      setChatRooms(resolvedRooms);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const db = getFirestore();
    const friendsRef = collection(db, 'users', currentUser.uid, 'friends');

    const unsubscribe = onSnapshot(friendsRef, async (snapshot) => {
      const friendsData = await Promise.all(snapshot.docs.map(async (friendDoc) => {
        let pData: any = {};
        try {
            const profileDocInfo = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', friendDoc.id, 'profile', 'info'));
            if (profileDocInfo.exists()) {
                pData = profileDocInfo.data();
            }
        } catch (e) {}

        const mScore = pData.mannerScore !== undefined ? pData.mannerScore : 5.0;

        return {
          id: friendDoc.id,
          name: pData.nickname || friendDoc.data().name || '이름 없음',
          isOnline: pData.isOnline || false,
          tier: pData.tier || 'Unranked',
          win: pData.wins || 0,
          loss: pData.losses || 0,
          mannerScore: Number(mScore).toFixed(1),
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : require('../../assets/images/profile.png'),
          location: pData.region || '지역 미설정',
        };
      }));
      setFriendsList(friendsData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const toggleViewMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode((prev) => (prev === 'chat' ? 'friends' : 'chat'));
  };

  // ✅ 친구를 눌렀을 때 DB에서 최신 매너 점수/기록을 한 번 더 조회하여 동기화
  const handleFriendPress = async (friend: any) => {
    try {
      const db = getFirestore();
      const profileDocInfo = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', friend.id, 'profile', 'info'));

      if (profileDocInfo.exists()) {
        const pData = profileDocInfo.data();
        const mScore = pData.mannerScore !== undefined ? pData.mannerScore : 5.0;

        setSelectedProfile({
          ...friend,
          name: pData.nickname || friend.name,
          tier: pData.tier || friend.tier,
          win: pData.wins || friend.win,
          loss: pData.losses || friend.loss,
          mannerScore: Number(mScore).toFixed(1),
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : friend.avatar,
          location: pData.region || friend.location,
        });
      } else {
        setSelectedProfile(friend);
      }
    } catch (e) {
      console.error("최신 프로필 가져오기 실패:", e);
      setSelectedProfile(friend); // 실패 시 기존 목록 데이터 사용
    }
    setModalVisible(true);
  };

  const handleRoomPress = (room: any) => {
    navigation.navigate('ChatRoom', {
      roomId: room.id,
      title: room.matchTitle,
      opponentName: room.opponentName,
      opponentId: room.opponentId,
    });
  };

  const handleRoomLongPress = (room: any) => {
    if (room.id === 'new_bot_chat') return;

    Alert.alert('채팅방 나가기', `'${room.matchTitle}' 방을 나가시겠습니까? 나간 방의 대화 내용은 복구할 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => navigation.navigate('ChatRoom', {
        roomId: room.id, title: room.matchTitle, opponentName: room.opponentName, opponentId: room.opponentId, autoLeave: true
      }) }
    ]);
  };

  const handleSearchFriend = async () => {
    if (!addFriendInput.trim() || !currentUser) {
      Alert.alert('알림', '정보를 정확히 입력해주세요.');
      return;
    }

    try {
      const db = getFirestore();
      let targetUserId = null;
      let pData: any = {};

      const searchField = addFriendMode === 'nickname' ? 'nickname' : 'phone';
      const searchValue = addFriendInput.trim();

      const groupQuery = query(collectionGroup(db, 'profile'), where(searchField, '==', searchValue));
      const groupSnapshot = await getDocs(groupQuery);

      if (!groupSnapshot.empty) {
          const docSnap = groupSnapshot.docs[0];
          const pathParts = docSnap.ref.path.split('/');
          const usersIndex = pathParts.indexOf('users');
          if (usersIndex !== -1 && pathParts.length > usersIndex + 1) {
               targetUserId = pathParts[usersIndex + 1];
          } else {
               targetUserId = docSnap.id;
          }
          pData = docSnap.data();
      }
      else {
          const profilesRef = collection(db, 'profiles');
          const q = query(profilesRef, where(searchField, '==', searchValue));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
             targetUserId = querySnapshot.docs[0].id;
             pData = querySnapshot.docs[0].data();
          }
      }

      if (!targetUserId) {
        Alert.alert('결과 없음', '해당 정보를 가진 사용자를 찾을 수 없습니다.');
        return;
      }

      if (targetUserId === currentUser.uid) {
        Alert.alert('알림', '본인은 검색할 수 없습니다.');
        return;
      }

      const mScore = pData.mannerScore !== undefined ? pData.mannerScore : 5.0;

      const searchedProfile = {
          id: targetUserId,
          name: pData.nickname || searchValue,
          location: pData.region || '지역 미설정',
          tier: pData.tier || 'Unranked',
          win: pData.wins || 0,
          loss: pData.losses || 0,
          mannerScore: Number(mScore).toFixed(1), // 검색된 유저의 매너 점수도 정확히 표시
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : require('../../assets/images/profile.png'),
      };

      setAddFriendVisible(false);
      setAddFriendInput('');

      setSelectedProfile(searchedProfile);
      setModalVisible(true);

    } catch (error) {
      console.error("친구 검색 중 오류:", error);
      Alert.alert('오류', '데이터베이스 검색에 실패했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {viewMode === 'chat' ? '대화' : '친구 목록'}
        </Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconButton} onPress={toggleViewMode}>
            {viewMode === 'chat' ? (
              <Users size={24} color="white" />
            ) : (
              <MessageCircle size={24} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: 100 }}>
        {viewMode === 'chat' ? (
          chatRooms.length === 0 ? (
             <View style={{padding: 40, alignItems: 'center'}}><Text style={{color: '#6B7280'}}>진행 중인 대화가 없습니다.</Text></View>
          ) : (
            chatRooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={styles.itemContainer}
                activeOpacity={0.7}
                onPress={() => handleRoomPress(room)}
                onLongPress={() => handleRoomLongPress(room)}
              >
                <Image source={room.avatar} style={styles.avatar} />
                <View style={styles.contentContainer}>
                  <View style={styles.topRow}>
                    <Text style={styles.title} numberOfLines={1}>{room.matchTitle}</Text>
                    <Text style={styles.timeText}>{room.time}</Text>
                  </View>
                  <View style={styles.bottomRow}>
                    <Text style={styles.messageText} numberOfLines={1}>
                      <Text style={styles.senderName}>{room.opponentName}: </Text>
                      {room.lastMessage}
                    </Text>
                    {room.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{room.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : (
          friendsList.length === 0 ? (
             <View style={{padding: 40, alignItems: 'center'}}><Text style={{color: '#6B7280'}}>등록된 친구가 없습니다.</Text></View>
          ) : (
            friendsList.map((friend) => (
              <TouchableOpacity key={friend.id} style={styles.itemContainer} activeOpacity={0.7} onPress={() => handleFriendPress(friend)}>
                <View>
                  <Image source={friend.avatar} style={styles.avatar} />
                  {friend.isOnline && <View style={styles.onlineBadge} />}
                </View>
                <View style={styles.contentContainer}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                </View>
              </TouchableOpacity>
            ))
          )
        )}
      </ScrollView>

      {viewMode === 'friends' && (
        <TouchableOpacity style={styles.fab} onPress={() => setAddFriendVisible(true)} activeOpacity={0.8}>
          <Plus size={28} color="white" />
        </TouchableOpacity>
      )}

      <OpponentProfileModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        userProfile={selectedProfile}
        currentUser={currentUser}
      />

      <Modal animationType="fade" transparent={true} visible={isAddFriendVisible} onRequestClose={() => setAddFriendVisible(false)}>
         <Pressable style={styles.modalBackdrop} onPress={() => setAddFriendVisible(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{width: '100%', alignItems: 'center'}}>
             <Pressable style={styles.addFriendModalContent} onPress={() => {}}>
               <View style={styles.modalHeader}>
                 <Text style={styles.modalTitle}>친구 검색</Text>
                 <TouchableOpacity onPress={() => setAddFriendVisible(false)}>
                   <X size={24} color="#9CA3AF" />
                 </TouchableOpacity>
               </View>

               <View style={styles.tabContainer}>
                 <TouchableOpacity style={[styles.tabButton, addFriendMode === 'nickname' && styles.tabButtonActive]} onPress={() => setAddFriendMode('nickname')}>
                   <Text style={[styles.tabText, addFriendMode === 'nickname' && styles.tabTextActive]}>닉네임</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[styles.tabButton, addFriendMode === 'phone' && styles.tabButtonActive]} onPress={() => setAddFriendMode('phone')}>
                   <Text style={[styles.tabText, addFriendMode === 'phone' && styles.tabTextActive]}>전화번호</Text>
                 </TouchableOpacity>
               </View>

               <View style={styles.inputContainer}>
                 {addFriendMode === 'nickname' ? <Search size={20} color="#9CA3AF" /> : <Phone size={20} color="#9CA3AF" />}
                 <TextInput
                   style={styles.input}
                   placeholder={addFriendMode === 'nickname' ? "닉네임을 입력하세요" : "전화번호를 입력하세요"}
                   placeholderTextColor="#6B7280"
                   value={addFriendInput}
                   onChangeText={setAddFriendInput}
                   keyboardType={addFriendMode === 'phone' ? 'phone-pad' : 'default'}
                 />
               </View>

               <TouchableOpacity style={styles.addButton} onPress={handleSearchFriend}>
                 <Text style={styles.addButtonText}>검색</Text>
               </TouchableOpacity>
             </Pressable>
            </KeyboardAvoidingView>
         </Pressable>
       </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20, backgroundColor: '#1F2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  headerIcons: { flexDirection: 'row' },
  iconButton: { marginLeft: 16, padding: 4 },
  listContainer: { flex: 1 },
  itemContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12, backgroundColor: '#374151' },
  onlineBadge: { position: 'absolute', bottom: 0, right: 12, width: 14, height: 14, borderRadius: 7, backgroundColor: '#34D399', borderWidth: 2, borderColor: '#111827' },
  contentContainer: { flex: 1, justifyContent: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 'bold', color: 'white', maxWidth: '80%' },
  friendName: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  timeText: { fontSize: 12, color: '#9CA3AF' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  messageText: { flex: 1, fontSize: 14, color: '#9CA3AF', marginRight: 8 },
  senderName: { fontSize: 14, color: '#9CA3AF', marginRight: 8 },
  unreadBadge: { backgroundColor: '#34D399', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#34D399', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  addFriendModalContent: { width: '85%', backgroundColor: '#1F2937', borderRadius: 16, padding: 24, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#374151', borderRadius: 8, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabButtonActive: { backgroundColor: '#111827' },
  tabText: { color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: 'white', fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 12, paddingHorizontal: 16, marginBottom: 24 },
  input: { flex: 1, paddingVertical: 14, marginLeft: 12, color: 'white', fontSize: 16 },
  addButton: { backgroundColor: '#34D399', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  addButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});