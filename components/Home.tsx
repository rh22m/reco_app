import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  TouchableWithoutFeedback,
  ImageSourcePropType
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  MapPin,
  User,
  Users,
  Bell,
  Check,
  X,
  Megaphone
} from 'lucide-react-native';
import { Calendar as RNCalendar, LocaleConfig } from 'react-native-calendars';
import LinearGradient from 'react-native-linear-gradient';

import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, getDoc, doc, query, where, deleteDoc, setDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import { MatchCard } from './MatchCard';
import { RMRGuideModal } from './RMRGuideModal';
import { getRmrTier } from '../utils/rmrCalculator';

LocaleConfig.locales['kr'] = {
  monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  monthNamesShort: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
  dayNamesShort: ['일','월','화','수','목','금','토'],
  today: '오늘'
};
LocaleConfig.defaultLocale = 'kr';

interface HostProfile {
  name: string;
  location: string;
  tier: string;
  win: number;
  loss: number;
  mannerScore: number;
  avatar: ImageSourcePropType;
  avatarUrl?: string | null;
  uid?: string;
}

interface Match {
  id: string;
  status: string;
  playerCount: string;
  title: string;
  date: string;
  location: string;
  region: string;
  gender: string;
  maxCount: number;
  host: HostProfile;
}

const NOTICE_ITEMS = [
  { id: 1, badge: 'RMR 가이드', title: '단순 승패 그 이상', subtitle: '경기 내용까지 분석하는 RMR 시스템을 소개합니다.', image: require('../assets/images/notice/notice_1.png') },
  { id: 2, badge: '플레이 스타일', title: '나만의 강점을 찾으세요', subtitle: '지구력, 속도, 위기관리 등 다양한 지표를 분석해 드려요.', image: require('../assets/images/notice/notice_2.png') },
  { id: 3, badge: '매너 플레이', title: '끝까지 최선을 다해주세요', subtitle: '강제 종료는 패배보다 더 큰 페널티를 받게 됩니다.', image: require('../assets/images/notice/notice_3.png') },
  { id: 4, badge: 'AI 분석', title: '나만의 AI 코치', subtitle: '스윙, 준비자세, 풋워크까지 스마트하게 훈련하세요.', image: require('../assets/images/notice/notice_4.png') },
  { id: 5, badge: '장비 추천', title: '나에게 딱 맞는 장비', subtitle: '나의 데이터를 분석해 최적의 라켓을 제안해 드려요.', image: require('../assets/images/notice/notice_5.png') },
  { id: 6, badge: '경기 모드', title: '손목 위의 점수판', subtitle: '흐름 끊김 없이, 워치로 점수를 편하게 기록하세요.', image: require('../assets/images/notice/notice_6.png') }
];

const parseMatchDateStr = (dateStr: string): Date => {
  const parts = dateStr.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일 (\d{1,2})시 (\d{1,2})분/);
  if (!parts) return new Date(0);
  return new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]));
};
const formatMatchDate = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${d.getMinutes().toString().padStart(2, '0')}분`;
const formatDateSimple = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
const getLocalDateString = (date: Date) => `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

const MAIN_REGIONS = [
  { label: '전체', value: '전체' }, { label: '서울', value: '서울' }, { label: '경기', value: '경기' },
  { label: '인천', value: '인천' }, { label: '강원', value: '강원' }, { label: '충청', value: '충청' },
  { label: '전라', value: '전라' }, { label: '경상', value: '경상' }, { label: '제주', value: '제주' }
];

const SUB_REGIONS: { [key: string]: string[] } = {
  '서울': ['전체', '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '경기': ['전체', '수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '광명시', '김포시', '군포시', '광주시', '이천시', '양주시', '오산시', '구리시', '안성시', '포천시', '의왕시', '하남시', '여주시', '양평군', '동두천시', '과천시', '가평군', '연천군'],
  '인천': ['전체', '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  '강원': ['전체'], '충청': ['전체'], '전라': ['전체'], '경상': ['전체'], '제주': ['전체']
};

const getHolidays = () => ['2025-01-01', '2025-03-01', '2025-05-05', '2025-08-15', '2025-10-03', '2025-12-25'];

const NoticeSection = ({ onNoticePress }: { onNoticePress: () => void }) => {
  const scrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const [displayIndex, setDisplayIndex] = useState(0);
  const scrollIndexRef = useRef(0);

  const extendedNotices = useMemo(() => [...NOTICE_ITEMS, { ...NOTICE_ITEMS[0], id: 'clone' }], []);

  useEffect(() => {
    const interval = setInterval(() => {
      let nextIndex = scrollIndexRef.current + 1;
      if (nextIndex >= extendedNotices.length) nextIndex = 0;
      scrollRef.current?.scrollTo({ x: nextIndex * screenWidth, animated: true });
      scrollIndexRef.current = nextIndex;
      setDisplayIndex(nextIndex === extendedNotices.length - 1 ? 0 : nextIndex);
      if (nextIndex === extendedNotices.length - 1) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ x: 0, animated: false });
          scrollIndexRef.current = 0;
          setDisplayIndex(0);
        }, 500);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [screenWidth, extendedNotices.length]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    if (index === extendedNotices.length - 1) {
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      scrollIndexRef.current = 0;
      setDisplayIndex(0);
    } else {
      scrollIndexRef.current = index;
      setDisplayIndex(index);
    }
  };

  return (
    <View style={styles.noticeContainer}>
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onMomentumScrollEnd} scrollEventThrottle={16}>
        {extendedNotices.map((item, index) => (
          <TouchableOpacity key={`${item.id}-${index}`} onPress={onNoticePress} activeOpacity={0.95} style={{ width: screenWidth, height: 200 }}>
            <Image source={item.image} style={styles.noticeImage} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.noticeGradientOverlay}>
              <View style={styles.noticeBadge}><Megaphone size={12} color="white" /><Text style={styles.noticeBadgeText}>{item.badge}</Text></View>
              <View><Text style={styles.noticeTitle}>{item.title}</Text><Text style={styles.noticeSubtitle}>{item.subtitle}</Text></View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.paginationContainer}>
        {NOTICE_ITEMS.map((_, index) => (
          <View key={index} style={[styles.paginationDot, displayIndex === index && styles.paginationDotActive]} />
        ))}
      </View>
    </View>
  );
};

const FilterOptionButton = ({ label, icon, isSelected, onPress, type = 'text' }: any) => {
  const IconComponent = icon;
  return (
    <TouchableOpacity style={[styles.optionButton, type === 'icon' && styles.optionButtonIcon, isSelected && styles.optionButtonSelected]} onPress={onPress}>
      {IconComponent && <IconComponent size={16} color={isSelected ? 'white' : '#6B7280'} />}
      <Text style={[styles.optionButtonText, isSelected && styles.optionButtonTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
};

const COLORS = {
  gold: '#FDB931',
  silver: '#E0E0E0',
  bronze: '#FFA07A',
  default: '#34D399'
};

const getTierColor = (tierName: string) => {
  if (tierName.includes('Gold')) return COLORS.gold;
  if (tierName.includes('Silver')) return COLORS.silver;
  if (tierName.includes('Bronze')) return COLORS.bronze;
  return COLORS.default;
};

const MatchHostModal = ({ visible, onClose, match, currentUser, onDelete }: { visible: boolean, onClose: () => void, match: Match | null, currentUser: any, onDelete: (id: string) => void }) => {
  const [realTimeHost, setRealTimeHost] = useState<any>(null);
  const [calculatedTier, setCalculatedTier] = useState<string>('Bronze 3');

  useEffect(() => {
    if (visible && match?.host?.uid) {
      const fetchHostProfile = async () => {
        const db = getFirestore();
        try {
          const docRef = doc(db, 'artifacts', 'rally-app-main', 'users', match.host.uid, 'profile', 'info');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRealTimeHost(data);
            const rmr = data.rmr || 1000;
            setCalculatedTier(getRmrTier(rmr));
          } else {
            setRealTimeHost(null);
            setCalculatedTier(match.host.tier || 'Bronze 3');
          }
        } catch (error) {
          console.error("방장 프로필 로드 실패:", error);
          setRealTimeHost(null);
          setCalculatedTier(match.host.tier || 'Bronze 3');
        }
      };
      fetchHostProfile();
    } else if (!visible) {
      setRealTimeHost(null);
    }
  }, [visible, match]);

  if (!match || !match.host) return null;
  const isHost = currentUser && match.host.uid === currentUser.uid;

  const displayWin = realTimeHost?.wins !== undefined ? realTimeHost.wins : match.host.win;
  const displayLoss = realTimeHost?.losses !== undefined ? realTimeHost.losses : match.host.loss;
  const displayMannerScore = realTimeHost?.mannerScore !== undefined ? Number(realTimeHost.mannerScore).toFixed(1) : Number(match.host.mannerScore || 5.0).toFixed(1);
  const displayName = realTimeHost?.nickname || match.host.name;
  const displayAvatar = realTimeHost?.avatarUrl ? { uri: realTimeHost.avatarUrl } : match.host.avatar;
  const displayLocation = realTimeHost?.region || match.host.location;
  const tierColor = getTierColor(calculatedTier);

  const handleRequestJoin = async () => {
    Alert.alert("참가 신청", `'${match.title}' 모임에 참가 신청을 보내시겠습니까?`, [
      { text: "취소", style: "cancel" },
      { text: "보내기", onPress: async () => {
          try {
              const db = getFirestore();
              let myName = currentUser?.displayName || '유저';
              try {
                  const myDoc = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', currentUser.uid, 'profile', 'info'));
                  if (myDoc.exists()) myName = myDoc.data().nickname;
              } catch (e) {}

              await addDoc(collection(db, 'notifications'), {
                  receiverId: match.host.uid,
                  senderId: currentUser?.uid || 'unknown',
                  senderName: myName,
                  type: 'request',
                  title: '참가 신청',
                  message: `'${match.title}'에 ${myName}님이 참가를 희망합니다.`,
                  createdAt: serverTimestamp(),
                  matchId: match.id,
                  matchTitle: match.title
              });
              Alert.alert("신청 완료", "방장에게 참가 신청을 보냈습니다.");
              onClose();
          } catch(e) {
              console.error("신청 오류", e);
              Alert.alert("오류", "신청을 보내는 중 문제가 발생했습니다.");
          }
      } }
    ]);
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.profileModalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.profileModalContent}>
              <View style={styles.profileSection}>
                <Image source={displayAvatar} style={styles.profileAvatar} />
                <Text style={styles.profileNameText}>{displayName}</Text>
                <View style={{flexDirection:'row', alignItems:'center', gap:4}}><MapPin size={12} color="#A0A0A0"/><Text style={styles.profileLocationText}>{displayLocation}</Text></View>
                <Text style={styles.hostBadgeText}>방장(Host)</Text>
              </View>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}><Text style={styles.statLabel}>티어</Text><Text style={[styles.statValue, { color: tierColor }]}>{calculatedTier}</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}><Text style={styles.statLabel}>승/패</Text><Text style={styles.statValue}>{displayWin}승 {displayLoss}패</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}><Text style={styles.statLabel}>매너 점수</Text><Text style={styles.statValue}>{displayMannerScore} / 5.0</Text></View>
              </View>
              {isHost ? (
                  <View style={{flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12}}>
                      <TouchableOpacity style={styles.editButton} onPress={() => { Alert.alert('안내', '수정 기능은 준비 중입니다.'); }}><Text style={styles.joinRequestButtonText}>수정</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(match.id)}><Text style={styles.joinRequestButtonText}>삭제</Text></TouchableOpacity>
                  </View>
              ) : (
                  <TouchableOpacity style={styles.joinRequestButton} onPress={handleRequestJoin}><Text style={styles.joinRequestButtonText}>참가 신청 보내기</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={styles.profileCloseButton} onPress={onClose}><Text style={styles.profileCloseButtonText}>닫기</Text></TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export interface HomeProps {
  onStartGame: () => void;
  onGoToChat?: () => void;
  rallies?: any[];
  onCreateRally?: (title: string, location: string) => void;
  user?: any;
}

export function Home({ onStartGame, onGoToChat }: HomeProps) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterRegion, setFilterRegion] = useState<string>('전체');
  const [filterGender, setFilterGender] = useState<'무관' | '남성' | '여성'>('무관');
  const [filterCount, setFilterCount] = useState<2 | 4 | '전체'>('전체');
  const [activeFilterTab, setActiveFilterTab] = useState<'date' | 'region' | 'gender' | 'count'>('date');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());

  const [isModalVisible, setModalVisible] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isRegionModalVisible, setIsRegionModalVisible] = useState(false);
  const [isCalendarModalVisible, setCalendarModalVisible] = useState(false);
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const [isRmrGuideVisible, setIsRmrGuideVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isHostModalVisible, setIsHostModalVisible] = useState(false);

  const [applicantProfile, setApplicantProfile] = useState<any>(null);
  const [isApplicantProfileVisible, setIsApplicantProfileVisible] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<any>(null);

  const [datePickerMode, setDatePickerMode] = useState<'createDate' | 'createTime' | 'filter'>('createDate');
  const [regionModalMode, setRegionModalMode] = useState<'create' | 'filter'>('create');
  const [tempMainRegion, setTempMainRegion] = useState<string | null>(null);

  const [roomName, setRoomName] = useState('');
  const [createRegion, setCreateRegion] = useState<string | null>(null);
  const [detailedLocation, setDetailedLocation] = useState('');
  const [createGender, setCreateGender] = useState<'무관' | '남성' | '여성'>('무관');
  const [createCount, setCreateCount] = useState<2 | 4>(4);
  const [createDate, setCreateDate] = useState(new Date());

  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, user => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const db = getFirestore();
    const unsubscribe = onSnapshot(collection(db, 'matches'), snapshot => {
      const fetchedMatches = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          status: data.status || '모집 중',
          playerCount: data.playerCount || '1명',
          title: data.title || '',
          date: data.date || '',
          location: data.location || '',
          region: data.region || '기타',
          gender: data.gender || '무관',
          maxCount: data.maxCount || 4,
          host: {
            ...data.host,
            avatar: data.host?.avatarUrl ? { uri: data.host.avatarUrl } : require('../assets/images/profile.png')
          }
        } as Match;
      });
      fetchedMatches.sort((a, b) => parseMatchDateStr(a.date).getTime() - parseMatchDateStr(b.date).getTime());
      setMatches(fetchedMatches);
    }, error => console.error("매칭 데이터 로드 오류:", error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
        setNotifications([]);
        return;
    }
    const db = getFirestore();
    const q = query(collection(db, 'notifications'), where('receiverId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, snapshot => {
        const fetchedNotifs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        fetchedNotifs.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setNotifications(fetchedNotifs);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return '방금 전';
    const date = timestamp.toDate ? timestamp.toDate() : new Date();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  const handleOpenApplicantProfile = async (notif: any) => {
      const db = getFirestore();
      let pData: any = {};
      try {
          const profileDoc = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', notif.senderId, 'profile', 'info'));
          if (profileDoc.exists()) {
              pData = profileDoc.data();
          }
      } catch (e) {
          console.log("신청자 프로필 로드 실패", e);
      }

      const rmr = pData.rmr || 1000;
      const calculatedAppTier = getRmrTier(rmr);

      setApplicantProfile({
          id: notif.senderId,
          name: pData.nickname || notif.senderName || '사용자',
          location: pData.region || '지역 미설정',
          tier: calculatedAppTier,
          win: pData.wins || 0,
          loss: pData.losses || 0,
          mannerScore: pData.mannerScore !== undefined ? Number(pData.mannerScore).toFixed(1) : '5.0',
          avatar: pData.avatarUrl ? { uri: pData.avatarUrl } : require('../assets/images/profile.png'),
      });
      setCurrentNotification(notif);
      setIsApplicantProfileVisible(true);
  };

  const handleNotificationPress = async (notif: any, action: 'accept' | 'decline') => {
      try {
          const db = getFirestore();
          await deleteDoc(doc(db, 'notifications', notif.id));

          if (action === 'accept') {
            if (notif.type === 'friend_request') {
                let myName = currentUser.displayName || '유저';
                try {
                    const myProfile = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', currentUser.uid, 'profile', 'info'));
                    if(myProfile.exists()) myName = myProfile.data().nickname;
                } catch(e){}

                await setDoc(doc(db, 'users', currentUser.uid, 'friends', notif.senderId), {
                    addedAt: serverTimestamp(),
                    name: notif.senderName || '친구'
                });
                await setDoc(doc(db, 'users', notif.senderId, 'friends', currentUser.uid), {
                    addedAt: serverTimestamp(),
                    name: myName
                });
                setIsApplicantProfileVisible(false);
                Alert.alert('친구 추가 완료', `${notif.senderName}님과 친구가 되었습니다.`);
            } else {
                const roomTitle = notif.matchTitle || '새로운 매칭방';
                const initialMessage = `'${roomTitle}' 매칭 참가가 수락되었습니다! 즐거운 경기 되세요.`;

                let myName = currentUser.displayName || '방장';
                let myAvatar = currentUser.photoURL || null;
                try {
                    const myProfile = await getDoc(doc(db, 'artifacts', 'rally-app-main', 'users', currentUser.uid, 'profile', 'info'));
                    if(myProfile.exists()) {
                        myName = myProfile.data().nickname || myName;
                        myAvatar = myProfile.data().avatarUrl || myAvatar;
                    }
                } catch(e){}

                const newRoomRef = await addDoc(collection(db, 'chats'), {
                    matchTitle: roomTitle,
                    participants: [currentUser.uid, notif.senderId],
                    participantDetails: {
                      [currentUser.uid]: { name: myName, avatarUrl: myAvatar },
                      [notif.senderId]: { name: applicantProfile?.name || notif.senderName || '참가자', avatarUrl: applicantProfile?.avatar?.uri || null }
                    },
                    unreadCount: { [notif.senderId]: 1, [currentUser.uid]: 0 },
                    updatedAt: serverTimestamp(),
                    lastMessage: initialMessage,
                    type: 'match'
                });

                await addDoc(collection(db, 'chats', newRoomRef.id, 'messages'), {
                    text: initialMessage,
                    senderId: 'system',
                    createdAt: serverTimestamp()
                });

                setIsApplicantProfileVisible(false);
                setIsNotifModalVisible(false);
                Alert.alert('수락 완료', '참가 신청을 수락하여 채팅방이 생성되었습니다.');
                onGoToChat?.();
            }
          } else {
            setIsApplicantProfileVisible(false);
            Alert.alert('거절 완료', '요청을 거절했습니다.');
          }
      } catch (error) {
          console.error("알림 처리 실패:", error);
      }
  };

  const handleDeleteMatch = (matchId: string) => {
      Alert.alert("모임 삭제", "정말 이 모임을 삭제하시겠습니까?", [
          { text: "취소", style: "cancel" },
          { text: "삭제", style: "destructive", onPress: async () => {
              try {
                  const db = getFirestore();
                  await deleteDoc(doc(db, 'matches', matchId));
                  Alert.alert("삭제 완료", "모임이 삭제되었습니다.");
                  setIsHostModalVisible(false);
              } catch (error) {
                  console.error("삭제 실패", error);
                  Alert.alert("오류", "삭제 중 문제가 발생했습니다.");
              }
          } }
      ]);
  };

  const saveMatchToDB = async () => {
    const db = getFirestore();
    const finalLocation = `${createRegion} - ${detailedLocation.trim()}`;
    let hostProfile = {
      name: currentUser?.displayName || '나(본인)', location: createRegion || '미정', tier: 'Unranked', win: 0, loss: 0, mannerScore: 5.0, avatarUrl: currentUser?.photoURL || null, uid: currentUser?.uid || ''
    };

    if (currentUser) {
      try {
        const userDocRef = doc(db, 'artifacts', 'rally-app-main', 'users', currentUser.uid, 'profile', 'info');
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          hostProfile = { ...hostProfile, name: userData?.nickname || hostProfile.name, tier: userData?.tier || hostProfile.tier, win: userData?.wins || hostProfile.win, loss: userData?.losses || hostProfile.loss, mannerScore: userData?.mannerScore || hostProfile.mannerScore, avatarUrl: userData?.avatarUrl || hostProfile.avatarUrl, uid: currentUser.uid };
        }
      } catch (e) { console.log('프로필 로드 실패', e); }
    }

    const newMatch = {
      status: '모집 중', playerCount: '1명', title: roomName.trim(), date: formatMatchDate(createDate), location: finalLocation, region: createRegion || '기타', gender: createGender, maxCount: createCount, host: hostProfile, createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'matches'), newMatch);
      Alert.alert("생성 완료", "새로운 매칭방이 등록되었습니다.");
      setModalVisible(false);
      setRoomName(''); setCreateRegion(null); setDetailedLocation(''); setCreateGender('무관'); setCreateCount(4); setCreateDate(new Date());
    } catch (error) {
      Alert.alert("오류", "매칭방 생성에 실패했습니다.");
    }
  };

  const handleConfirmCreation = () => {
    if (roomName.trim().length < 2) return Alert.alert("입력 오류", "모임 이름을 2글자 이상 입력해주세요.");
    if (!createRegion) return Alert.alert("입력 오류", "지역을 선택해주세요.");
    if (detailedLocation.trim().length < 2) return Alert.alert("입력 오류", "상세 장소를 2글자 이상 입력해주세요.");
    Alert.alert("매칭방 생성", "입력하신 정보로 새로운 매칭방을 생성하시겠습니까?", [{ text: "취소", style: "cancel" }, { text: "추가", onPress: saveMatchToDB }]);
  };

  const displayMatches = useMemo(() => {
    return matches.filter(match => {
      const matchDate = parseMatchDateStr(match.date);
      if (matchDate <= now) return false;
      if (!isSearching && selectedDate) {
        const isSameDay = matchDate.getFullYear() === selectedDate.getFullYear() && matchDate.getMonth() === selectedDate.getMonth() && matchDate.getDate() === selectedDate.getDate();
        if (!isSameDay) return false;
      }
      if (isSearching) {
        if (searchText && !match.title.toLowerCase().includes(searchText.toLowerCase()) && !match.location.toLowerCase().includes(searchText.toLowerCase())) return false;
        if (filterDate) {
           const isSameDay = matchDate.getFullYear() === filterDate.getFullYear() && matchDate.getMonth() === filterDate.getMonth() && matchDate.getDate() === filterDate.getDate();
           if (!isSameDay) return false;
        }
        if (filterRegion !== '전체') {
            const isMainRegion = MAIN_REGIONS.some(r => r.value === filterRegion);
            if (isMainRegion) { if (match.region && match.region !== filterRegion) return false; }
            else { if (!match.location.includes(filterRegion)) return false; }
        }
        if (filterGender !== '무관' && match.gender !== filterGender && match.gender !== '무관') return false;
        if (filterCount !== '전체' && match.maxCount !== filterCount) return false;
      }
      return true;
    }).sort((a, b) => parseMatchDateStr(a.date).getTime() - parseMatchDateStr(b.date).getTime());
  }, [matches, isSearching, searchText, filterDate, filterRegion, filterGender, filterCount, selectedDate, now]);

  const dates = useMemo(() => {
    const list = [];
    const today = new Date();
    const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({ day: d.getDate(), label: dayLabels[d.getDay()], fullDate: new Date(d) });
    }
    return list;
  }, []);

  const calendarMarks = useMemo(() => {
    const marks: any = {};
    matches.forEach((match) => {
      const parts = match.date.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
      if (parts) marks[`${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`] = { hasMatch: true };
    });
    return marks;
  }, [matches]);

  const renderCalendarDay = ({ date, state }: any) => {
    const dateString = date.dateString;
    const textColor = state === 'disabled' ? '#D1D5DB' : (getHolidays().includes(dateString) || new Date(dateString).getDay() === 0 ? '#EF4444' : new Date(dateString).getDay() === 6 ? '#3B82F6' : '#1F2937');
    const isToday = dateString === getLocalDateString(new Date());
    const currentDay = new Date(date.year, date.month - 1, date.day);
    const isSelected = selectedDate ? (selectedDate.getFullYear() === currentDay.getFullYear() && selectedDate.getMonth() === currentDay.getMonth() && selectedDate.getDate() === currentDay.getDate()) : false;

    return (
      <TouchableOpacity onPress={() => { setSelectedDate(currentDay); setCalendarModalVisible(false); }} style={styles.calendarDayContainer}>
        <View style={[styles.calendarDayTextContainer, isToday && styles.todayBackground, isSelected && styles.dateButtonSelected]}>
          <Text style={[styles.calendarDayText, { color: (isToday || isSelected) ? 'white' : textColor }, (state === 'today') && { fontWeight: 'bold' }]}>{date.day}</Text>
        </View>
        {calendarMarks[dateString]?.hasMatch && <View style={styles.matchDot} />}
      </TouchableOpacity>
    );
  };

  const handleRegionItemPress = (itemValue: string) => {
    if (!tempMainRegion) {
        if (itemValue === '전체') {
            if (regionModalMode === 'create') setCreateRegion(null); else setFilterRegion('전체');
            setIsRegionModalVisible(false);
        } else setTempMainRegion(itemValue);
    } else {
        const finalRegion = itemValue === '전체' ? tempMainRegion : itemValue;
        if (regionModalMode === 'create') setCreateRegion(finalRegion); else setFilterRegion(finalRegion);
        setIsRegionModalVisible(false); setTempMainRegion(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logoWrapper}>
            <Image source={require('../assets/images/reco-logo.png')} style={styles.logo} />
            <Text style={styles.logoText}>RECO</Text>
          </View>
          <TouchableOpacity onPress={() => setIsNotifModalVisible(true)} style={styles.notificationButton}>
            <Bell size={24} color="white" />
            {notifications.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{notifications.length}</Text></View>}
          </TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <TextInput placeholder="제목, 장소 검색" placeholderTextColor="#9CA3AF" style={styles.searchInput} value={searchText} onChangeText={setSearchText} onFocus={() => { setIsSearching(true); setActiveFilterTab('date'); }} />
            <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
          </View>
          {isSearching && (
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setIsSearching(false); setSearchText(''); setFilterDate(null); setFilterRegion('전체'); setFilterGender('무관'); setFilterCount('전체'); }}>
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {isSearching && (
            <View style={styles.filterPanelContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabsScroll}>
                    {(['date', 'region', 'gender', 'count'] as const).map(tab => (
                        <TouchableOpacity key={tab} style={[styles.filterTab, activeFilterTab === tab && styles.filterTabActive]} onPress={() => setActiveFilterTab(tab)}>
                            <Text style={[styles.filterTabText, activeFilterTab === tab && styles.filterTabTextActive]}>
                                {tab === 'date' ? '날짜' : tab === 'region' ? '지역' : tab === 'gender' ? '성별' : '인원'}
                            </Text>
                            {((tab === 'date' && filterDate) || (tab === 'region' && filterRegion !== '전체') || (tab === 'gender' && filterGender !== '무관') || (tab === 'count' && filterCount !== '전체')) && <View style={styles.filterDot} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={styles.filterDetailContainer}>
                    {activeFilterTab === 'date' && (
                        <View style={styles.filterRow}>
                            <TouchableOpacity style={styles.filterInputButton} onPress={() => { setDatePickerMode('filter'); setDatePickerVisible(true); }}>
                                <CalendarIcon size={18} color="#6B7280" />
                                <Text style={styles.modalInputText}>{filterDate ? formatDateSimple(filterDate) : '날짜 선택 (전체)'}</Text>
                            </TouchableOpacity>
                            {filterDate && <TouchableOpacity style={styles.resetBadge} onPress={() => setFilterDate(null)}><X size={12} color="white" /></TouchableOpacity>}
                        </View>
                    )}
                    {activeFilterTab === 'region' && (
                        <View style={styles.filterRow}>
                            <TouchableOpacity style={styles.filterInputButton} onPress={() => { setRegionModalMode('filter'); setTempMainRegion(null); setIsRegionModalVisible(true); }}>
                                <MapPin size={18} color="#6B7280" />
                                <Text style={styles.modalInputText}>{filterRegion === '전체' ? '지역 선택 (전체)' : filterRegion}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {activeFilterTab === 'gender' && (
                        <View style={styles.optionGroup}>
                            <FilterOptionButton label="무관" icon={null} isSelected={filterGender === '무관'} onPress={() => setFilterGender('무관')} />
                            <FilterOptionButton label="남성" icon={User} isSelected={filterGender === '남성'} onPress={() => setFilterGender('남성')} type="icon"/>
                            <FilterOptionButton label="여성" icon={User} isSelected={filterGender === '여성'} onPress={() => setFilterGender('여성')} type="icon"/>
                        </View>
                    )}
                    {activeFilterTab === 'count' && (
                        <View style={styles.optionGroup}>
                            <FilterOptionButton label="전체" icon={null} isSelected={filterCount === '전체'} onPress={() => setFilterCount('전체')} />
                            <FilterOptionButton label="2인" icon={Users} isSelected={filterCount === 2} onPress={() => setFilterCount(2)} type="icon" />
                            <FilterOptionButton label="4인" icon={Users} isSelected={filterCount === 4} onPress={() => setFilterCount(4)} type="icon" />
                        </View>
                    )}
                </View>
            </View>
        )}

        <FlatList
            data={displayMatches}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: 16, marginBottom: 0 }}>
                <MatchCard match={item} onPress={(m) => { setSelectedMatch(m as any); setIsHostModalVisible(true); }} />
              </View>
            )}
            ListHeaderComponent={() => !isSearching ? (
              <View>
                <NoticeSection onNoticePress={() => setIsRmrGuideVisible(true)} />
                <View style={styles.dateSelectorContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginRight: 10 }} contentContainerStyle={{ gap: 10, paddingRight: 10 }}>
                    {dates.map((item) => {
                        const isSelected = selectedDate ? (selectedDate.getFullYear() === item.fullDate.getFullYear() && selectedDate.getMonth() === item.fullDate.getMonth() && selectedDate.getDate() === item.fullDate.getDate()) : false;
                        const dateStr = getLocalDateString(item.fullDate);
                        const hasMatch = calendarMarks[dateStr]?.hasMatch;
                        return (
                        <TouchableOpacity key={dateStr} onPress={() => { if (isSelected) setSelectedDate(null); else setSelectedDate(item.fullDate); }} activeOpacity={0.7} style={[styles.dateButton, isSelected && styles.dateButtonSelected, { width: (Dimensions.get('window').width - 74) / 6.5 }]}>
                            <Text style={[styles.dateButtonDay, { color: isSelected ? 'white' : (getHolidays().includes(dateStr) || item.fullDate.getDay() === 0 ? '#EF4444' : item.fullDate.getDay() === 6 ? '#3B82F6' : '#1F2937') }]}>{item.day}</Text>
                            <Text style={[styles.dateButtonLabel, isSelected && styles.dateButtonTextSelected]}>{item.label}</Text>
                            {hasMatch && !isSelected && <View style={styles.sliderMatchDot} />}
                            {hasMatch && isSelected && <View style={[styles.sliderMatchDot, { backgroundColor: 'white' }]} />}
                        </TouchableOpacity>
                        );
                    })}
                    </ScrollView>
                    <TouchableOpacity style={styles.calendarButton} onPress={() => setCalendarModalVisible(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><CalendarIcon size={20} color="white" /></TouchableOpacity>
                </View>
              </View>
            ) : null}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={() => (
                <View style={{padding: 40, alignItems: 'center', marginTop: 50}}>
                    <Search size={40} color="#D1D5DB" style={{marginBottom:10}} />
                    <Text style={{color: '#6B7280', fontSize: 16}}>조건에 맞는 경기가 없습니다.</Text>
                </View>
            )}
        />

        {!isSearching && (
            <TouchableOpacity style={styles.fab} onPress={() => { setDatePickerMode('createDate'); setRegionModalMode('create'); setModalVisible(true); }} activeOpacity={0.8}><Plus size={28} color="white" /></TouchableOpacity>
        )}
      </View>

      <RMRGuideModal visible={isRmrGuideVisible} onClose={() => setIsRmrGuideVisible(false)} />

      <MatchHostModal visible={isHostModalVisible} onClose={() => setIsHostModalVisible(false)} match={selectedMatch} currentUser={currentUser} onDelete={handleDeleteMatch} />

      <Modal animationType="slide" transparent={true} visible={isRegionModalVisible} onRequestClose={() => setIsRegionModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setIsRegionModalVisible(false)}>
          <Pressable style={styles.regionModalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>지역 선택</Text>
            {tempMainRegion ? (
              <View style={{flex: 1, width: '100%'}}>
                  <TouchableOpacity style={styles.regionHeaderBack} onPress={() => setTempMainRegion(null)}><ChevronLeft size={20} color="#374151" /><Text style={styles.regionHeaderBackText}>{tempMainRegion} (다시 선택)</Text></TouchableOpacity>
                  <FlatList data={SUB_REGIONS[tempMainRegion] || ['전체']} keyExtractor={(item) => item} renderItem={({ item }) => (
                      <TouchableOpacity style={styles.regionItem} onPress={() => handleRegionItemPress(item)}><Text style={[styles.regionItemText, (regionModalMode === 'filter' && filterRegion === item) && { color: '#34D399', fontWeight: 'bold' }]}>{item === '전체' ? `${tempMainRegion} 전체` : item}</Text></TouchableOpacity>
                  )} />
              </View>
            ) : (
              <FlatList data={MAIN_REGIONS} keyExtractor={(item) => item.value} renderItem={({ item }) => (
                  <TouchableOpacity style={styles.regionItem} onPress={() => handleRegionItemPress(item.value)}><Text style={styles.regionItemText}>{item.label}</Text>{item.value !== '전체' && <ChevronRight size={16} color="#D1D5DB" />}</TouchableOpacity>
              )} />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <DatePicker modal open={isDatePickerVisible} date={datePickerMode.startsWith('create') ? createDate : (filterDate || new Date())}
        onConfirm={(d) => {
            setDatePickerVisible(false);
            if (datePickerMode === 'createDate') {
                const newDate = new Date(createDate);
                newDate.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setCreateDate(newDate);
                setTimeout(() => { setDatePickerMode('createTime'); setDatePickerVisible(true); }, 400);
            } else if (datePickerMode === 'createTime') {
                const newDate = new Date(createDate);
                newDate.setHours(d.getHours(), d.getMinutes());
                setCreateDate(newDate);
            } else { setFilterDate(d); }
        }}
        onCancel={() => setDatePickerVisible(false)} title={datePickerMode === 'createDate' ? "날짜 선택" : datePickerMode === 'createTime' ? "시간 선택" : "날짜로 검색"} confirmText="확인" cancelText="취소" minuteInterval={5} mode={datePickerMode === 'createDate' ? 'date' : datePickerMode === 'createTime' ? 'time' : 'date'}
      />

      <Modal visible={isNotifModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsNotifModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setIsNotifModalVisible(false)}>
          <View style={styles.notifModalContent}>
            <View style={styles.notifHeader}><Text style={styles.modalTitle}>알림 센터</Text><TouchableOpacity onPress={() => setIsNotifModalVisible(false)}><X size={24} color="#6B7280" /></TouchableOpacity></View>
            {notifications.length === 0 ? <View style={styles.emptyNotifContainer}><Bell size={48} color="#D1D5DB" /><Text style={styles.emptyNotifText}>새로운 알림이 없습니다.</Text></View> : (
              <FlatList data={notifications} keyExtractor={(item) => item.id.toString()} renderItem={({ item }) => (
                <TouchableOpacity style={styles.notifItem} onPress={() => handleOpenApplicantProfile(item)}>
                  <View style={styles.notifTextContainer}>
                      <View style={styles.notifTitleRow}><Text style={styles.notifTitle}>{item.title}</Text><Text style={styles.notifTime}>{formatTimeAgo(item.createdAt)}</Text></View>
                      <Text style={styles.notifMessage}>{item.message}</Text>
                  </View>
                  <View style={styles.notifActionContainer}>
                    <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => handleNotificationPress(item, 'decline')}><X size={18} color="#EF4444" /></TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )} />
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={isApplicantProfileVisible} onRequestClose={() => setIsApplicantProfileVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsApplicantProfileVisible(false)}>
          <View style={styles.profileModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.profileModalContent}>
                {applicantProfile && (
                  <>
                    <View style={styles.profileSection}>
                      <Image source={applicantProfile.avatar} style={styles.profileAvatar} />
                      <Text style={styles.profileNameText}>{applicantProfile.name}</Text>
                      <View style={{flexDirection:'row', alignItems:'center', gap:4}}><MapPin size={12} color="#A0A0A0"/><Text style={styles.profileLocationText}>{applicantProfile.location}</Text></View>
                      <Text style={[styles.hostBadgeText, { backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8' }]}>
                          {currentNotification?.type === 'friend_request' ? '친구 요청' : '참가 신청자'}
                      </Text>
                    </View>
                    <View style={styles.statsContainer}>
                      <View style={styles.statItem}><Text style={styles.statLabel}>티어</Text><Text style={[styles.statValue, { color: getTierColor(applicantProfile.tier) }]}>{applicantProfile.tier}</Text></View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}><Text style={styles.statLabel}>승/패</Text><Text style={styles.statValue}>{applicantProfile.win}승 {applicantProfile.loss}패</Text></View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}><Text style={styles.statLabel}>매너 점수</Text><Text style={styles.statValue}>{applicantProfile.mannerScore} / 5.0</Text></View>
                    </View>
                    <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
                        <TouchableOpacity style={[styles.joinRequestButton, {flex: 1, backgroundColor: '#374151'}]} onPress={() => handleNotificationPress(currentNotification, 'decline')}><Text style={styles.joinRequestButtonText}>거절</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.joinRequestButton, {flex: 1}]} onPress={() => handleNotificationPress(currentNotification, 'accept')}><Text style={styles.joinRequestButtonText}>수락</Text></TouchableOpacity>
                    </View>
                  </>
                )}
                <TouchableOpacity style={[styles.profileCloseButton, {marginTop: 12}]} onPress={() => setIsApplicantProfileVisible(false)}><Text style={styles.profileCloseButtonText}>닫기</Text></TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={isModalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPressable} onPress={() => setModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>새로운 방 생성</Text>
            <TextInput style={styles.modalInput} placeholder="모임 이름 (2글자 이상)" placeholderTextColor="#9CA3AF" value={roomName} onChangeText={setRoomName} />
            <TouchableOpacity style={styles.modalInputButton} onPress={() => { setDatePickerMode('createDate'); setDatePickerVisible(true); }}><CalendarIcon size={18} color="#6B7280" /><Text style={styles.modalInputText}>{formatMatchDate(createDate)}</Text></TouchableOpacity>
            <Text style={styles.modalLabel}>지역 선택</Text>
            <TouchableOpacity style={styles.modalInputButton} onPress={() => { setRegionModalMode('create'); setTempMainRegion(null); setIsRegionModalVisible(true); }}><MapPin size={18} color={createRegion ? '#1F2937' : '#6B7280'} /><Text style={[styles.modalInputText, !createRegion && styles.placeholderText]}>{createRegion || '시/도를 선택하세요'}</Text></TouchableOpacity>
            <Text style={styles.modalLabel}>상세 장소</Text>
            <TextInput style={styles.modalInput} placeholder="예: 호계체육관 (2글자 이상)" placeholderTextColor="#9CA3AF" value={detailedLocation} onChangeText={setDetailedLocation} />
            <Text style={styles.modalLabel}>성별</Text>
            <View style={styles.optionGroup}><FilterOptionButton label="남성" icon={null} isSelected={createGender === '남성'} onPress={() => setCreateGender('남성')} /><FilterOptionButton label="여성" icon={null} isSelected={createGender === '여성'} onPress={() => setCreateGender('여성')} /><FilterOptionButton label="무관" icon={null} isSelected={createGender === '무관'} onPress={() => setCreateGender('무관')} /></View>
            <Text style={styles.modalLabel}>인원</Text>
            <View style={styles.optionGroup}><FilterOptionButton label="2인" icon={User} isSelected={createCount === 2} onPress={() => setCreateCount(2)} type="icon" /><FilterOptionButton label="4인" icon={Users} isSelected={createCount === 4} onPress={() => setCreateCount(4)} type="icon" /></View>
            <TouchableOpacity style={styles.modalAddButton} onPress={handleConfirmCreation}><Text style={styles.modalAddButtonText}>추가</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isCalendarModalVisible} transparent={true} animationType="fade" onRequestClose={() => setCalendarModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCalendarModalVisible(false)}>
          <View style={styles.calendarModalContent}><Text style={styles.modalTitle}>경기 일정 확인</Text><RNCalendar dayComponent={renderCalendarDay} monthFormat={'yyyy년 MM월'} theme={{ arrowColor: '#1F2937' }} /><TouchableOpacity style={styles.closeButton} onPress={() => setCalendarModalVisible(false)}><Text style={styles.closeButtonText}>닫기</Text></TouchableOpacity></View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { backgroundColor: '#111827', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  logoContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  logoWrapper: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 32, height: 32, marginRight: 8 },
  logoText: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  notificationButton: { position: 'relative', padding: 4 },
  badge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#EF4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#111827' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchContainer: { position: 'relative', flex: 1 },
  searchInput: { backgroundColor: '#374151', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, paddingRight: 40, fontSize: 16, color: '#FFFFFF' },
  searchIcon: { position: 'absolute', right: 12, top: 13 },
  cancelButton: { paddingLeft: 16 },
  cancelButtonText: { color: '#FFFFFF', fontSize: 16 },

  filterPanelContainer: { backgroundColor: '#F9FAFB', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterTabsScroll: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  filterTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8, flexDirection: 'row', alignItems: 'center' },
  filterTabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  filterTabText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  filterTabTextActive: { color: 'white' },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399', marginLeft: 6 },
  filterDetailContainer: { paddingHorizontal: 16, paddingTop: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterInputButton: { flex: 1, backgroundColor: 'white', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  resetBadge: { backgroundColor: '#EF4444', borderRadius: 12, padding: 6, marginLeft: 8 },

  noticeContainer: { width: '100%', height: 200, position: 'relative', overflow: 'hidden' },
  noticeImage: { width: '100%', height: '100%' },
  noticeGradientOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%', paddingHorizontal: 20, paddingBottom: 32, justifyContent: 'flex-end' },
  noticeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34D399', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 8, gap: 4 },
  noticeBadgeText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  noticeTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  noticeSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  paginationContainer: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  paginationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  paginationDotActive: { backgroundColor: '#34D399', width: 18 },

  dateSelectorContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingVertical: 16, paddingHorizontal: 12 },
  calendarButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1F2937', justifyContent: 'center', alignItems: 'center', marginHorizontal: 4 },
  dateButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 22, height: 48 },
  dateButtonSelected: { backgroundColor: '#34D399' },
  dateButtonDay: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  dateButtonLabel: { fontSize: 12, color: '#374151' },
  dateButtonTextSelected: { color: 'white' },
  sliderMatchDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#34D399', marginTop: 2 },

  listContent: { paddingBottom: 88 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#34D399', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },

  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalBackdropPressable: { ...StyleSheet.absoluteFillObject },
  modalContent: { width: '100%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 32, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 20, marginTop: 'auto' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1F2937', marginBottom: 24, textAlign: 'center' },
  modalInput: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: '#1F2937', marginBottom: 16 },
  modalInputButton: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  modalInputText: { fontSize: 16, color: '#1F2937', marginLeft: 8 },
  placeholderText: { color: '#9CA3AF' },
  modalLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  optionGroup: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  optionButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', gap: 6 },
  optionButtonIcon: { paddingVertical: 10 },
  optionButtonSelected: { backgroundColor: '#34D399', borderColor: '#34D399' },
  optionButtonText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  optionButtonTextSelected: { color: '#FFFFFF' },
  modalAddButton: { backgroundColor: '#34D399', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  modalAddButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

  regionModalContent: { width: '100%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 32, height: '70%', marginTop: 'auto' },
  regionItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  regionItemText: { fontSize: 18, color: '#1F2937' },
  regionHeaderBack: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 },
  regionHeaderBackText: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginLeft: 8 },

  calendarModalContent: { width: '90%', backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 5 },
  closeButton: { marginTop: 15, backgroundColor: '#34D399', padding: 12, borderRadius: 10, alignItems: 'center' },
  closeButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  // ✅ 캘린더 날짜 커스텀 컴포넌트(renderCalendarDay)에 사용되는 스타일 추가
  calendarDayContainer: { alignItems: 'center', justifyContent: 'center', height: 44, width: 40 },
  calendarDayTextContainer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calendarDayText: { fontSize: 15, color: '#1F2937' },
  todayBackground: { backgroundColor: '#9CA3AF' },
  matchDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399', position: 'absolute', bottom: 0 },

  notifModalContent: { width: '90%', backgroundColor: 'white', borderRadius: 16, padding: 24, alignSelf: 'center', maxHeight: '80%', elevation: 10 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  emptyNotifContainer: { alignItems: 'center', paddingVertical: 32 },
  emptyNotifText: { color: '#9CA3AF', marginTop: 12, fontSize: 16 },
  notifItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  notifTextContainer: { flex: 1, marginRight: 12 },
  notifTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  notifTitle: { fontSize: 14, fontWeight: 'bold', color: '#34D399' },
  notifTime: { fontSize: 12, color: '#9CA3AF' },
  notifMessage: { fontSize: 15, color: '#1F2937', lineHeight: 20 },
  notifActionContainer: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  acceptBtn: { backgroundColor: '#34D399' },
  declineBtn: { backgroundColor: '#F3F4F6' },

  profileModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  profileModalContent: { width: '85%', backgroundColor: '#1C1D2B', borderRadius: 20, padding: 25, alignItems: 'center', elevation: 5 },
  profileSection: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 10, backgroundColor: '#333' },
  profileNameText: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  profileLocationText: { fontSize: 14, color: '#A0A0A0' },
  hostBadgeText: { marginTop:6, color: '#34D399', fontSize: 12, fontWeight: 'bold', backgroundColor: 'rgba(52, 211, 153, 0.15)', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4 },
  statsContainer: { flexDirection: 'row', backgroundColor: '#25263A', borderRadius: 15, paddingVertical: 15, width: '100%', justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 12, color: '#888', marginBottom: 5 },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  statDivider: { width: 1, height: '60%', backgroundColor: '#444' },
  joinRequestButton: { width: '100%', backgroundColor: '#34D399', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 0 },
  editButton: { flex: 1, backgroundColor: '#374151', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  deleteButton: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  joinRequestButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  profileCloseButton: { width: '100%', paddingVertical: 12, backgroundColor: '#333', borderRadius: 12, alignItems: 'center' },
  profileCloseButtonText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});