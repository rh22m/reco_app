import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import {
  Settings, Shield, LogOut, ChevronRight, PencilRuler, History, Dumbbell,
  Wallet, Scale, Gem, ShoppingBag, X, CheckCircle2, Camera, Edit2, Trash2, FileText, MapPin
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient, Stop, G, Text as SvgText, TSpan } from 'react-native-svg';

// 갤러리 접근용 패키지
import { launchImageLibrary } from 'react-native-image-picker';

// Firebase 연동
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, updateDoc, collectionGroup, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';

import { getRmrTier, getDisplayTier } from '../../utils/rmrCalculator';
import { recommendRacket, RacketDetail } from '../../utils/racketRecommender';
import { AnalysisReport } from '../AI/AIAnalysis';

interface ProfileScreenProps {
  onLogout: () => void;
  userProfile?: any;
}

const TIER_IMAGES = {
  gold: require('../../assets/images/tier_gold.png'),
  silver: require('../../assets/images/tier_silver.png'),
  bronze: require('../../assets/images/tier_bronze.png'),
};

const TIER_LEVELS = [
  { name: 'Gold 1', type: 'gold', minRmr: 1500 },
  { name: 'Gold 2', type: 'gold', minRmr: 1400 },
  { name: 'Gold 3', type: 'gold', minRmr: 1300 },
  { name: 'Silver 1', type: 'silver', minRmr: 1200 },
  { name: 'Silver 2', type: 'silver', minRmr: 1100 },
  { name: 'Silver 3', type: 'silver', minRmr: 1000 },
  { name: 'Bronze 1', type: 'bronze', minRmr: 900 },
  { name: 'Bronze 2', type: 'bronze', minRmr: 800 },
  { name: 'Bronze 3', type: 'bronze', minRmr: 0 },
];

const COLORS = {
  gold: { front: ['#FFD700', '#FDB931'], side: '#B8860B' },
  silver: { front: ['#E0E0E0', '#BDBDBD'], side: '#757575' },
  bronze: { front: ['#FFA07A', '#CD7F32'], side: '#8B4513' },
  disabled: { front: ['#4B5563', '#374151'], side: '#1F2937' }
};

const LEGAL_TEXTS = {
  terms: `제1조 (목적)\n본 약관은 레코(RECO) 서비스 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.\n\n제2조 (서비스 이용)\n회원은 회사가 제공하는 배드민턴 매칭 및 분석 서비스를 상호 존중과 페어플레이 정신에 입각하여 사용하여야 합니다.`,
  privacy: `1. 개인정보 수집 항목\n이메일, 비밀번호, 닉네임, 휴대폰 번호, 활동 지역, 성별 등 서비스 제공에 필요한 최소한의 정보를 수집합니다.\n\n2. 이용 목적\n수집된 정보는 유저 간의 원활한 매칭 연결과 RMR 기반의 분석 서비스 제공을 위해 사용됩니다.`,
  location: `1. 위치정보 이용 목적\n사용자의 현재 위치를 기반으로 주변 경기장 및 실시간 매칭 파트너 정보를 제공하기 위해 위치정보를 이용합니다.\n\n2. 권리 표기\n본 서비스 내 제공되는 AI 분석 알고리즘, Glicko-2 기반의 RMR 레이팅 시스템의 모든 권리는 레코(RECO)에 있습니다.`
};

export default function ProfileScreen({ onLogout, userProfile }: ProfileScreenProps) {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<'tier' | 'info' | 'racket'>('tier');
  const [selectedTierName, setSelectedTierName] = useState<string | null>(null);

  const [videoHistory, setVideoHistory] = useState<AnalysisReport[]>([]);
  const [latestFlow, setLatestFlow] = useState({ tempo: 0.5, endurance: 0.5 });
  const [allRacketsData, setAllRacketsData] = useState<RacketDetail[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRacket, setSelectedRacket] = useState<RacketDetail | null>(null);

  // --- 모달 상태 ---
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // 닉네임 변경 관련 상태
  const [newNickname, setNewNickname] = useState(userProfile?.nickname || '');
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [isNicknameValid, setIsNicknameValid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 약관 확인 모달 상태
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalTitle, setLegalTitle] = useState('');
  const [legalContent, setLegalContent] = useState('');

  const screenWidth = Dimensions.get('window').width;
  const PYRAMID_HEIGHT = 200;
  const PYRAMID_WIDTH = 210;
  const CENTER_X = screenWidth / 3;
  const START_Y = 20;
  const DEPTH_X = 6;
  const DEPTH_Y = -12;

  useEffect(() => {
    if (!userProfile?.uid) {
        setIsLoadingDB(false);
        return;
    }
    setNewNickname(userProfile.nickname);

    const fetchData = async () => {
        try {
            const db = getFirestore(getApp());
            const appId = 'rally-app-main';

            // 유저 데이터 로드
            if (userProfile.latestFlow) {
                setLatestFlow(userProfile.latestFlow);
            }

            const videoRef = collection(db, 'artifacts', appId, 'users', userProfile.uid, 'videoHistory');
            const q = query(videoRef, orderBy('createdAt', 'desc'), limit(5));
            const snapshot = await getDocs(q);
            const vHist = snapshot.docs.map(doc => doc.data() as AnalysisReport);

            setVideoHistory(vHist);

            // 라켓 DB 데이터 로드
            const racketRef = collection(db, 'rackets');
            const racketSnap = await getDocs(racketRef);
            if (!racketSnap.empty) {
                const fetchedRackets = racketSnap.docs.map(d => ({ id: d.id, ...d.data() } as RacketDetail));
                setAllRacketsData(fetchedRackets);
            }

        } catch (e) {
            console.error("Firestore DB 펫치 에러:", e);
        } finally {
            setIsLoadingDB(false);
        }
    };
    fetchData();
  }, [userProfile]);

  const user = {
    name: userProfile?.nickname || '사용자',
    location: userProfile?.region || '지역 미설정',
    rmr: userProfile?.rmr || 1000,
    mannerScore: userProfile?.mannerScore ?? 5.0,
    wins: userProfile?.wins || 0,
    losses: userProfile?.losses || 0,
    rallyCount: userProfile?.rallyCount || 0,
    avatar: userProfile?.avatarUrl ? { uri: userProfile.avatarUrl } : require('../../assets/images/profile.png'),
    videoHistory: videoHistory,
    latestFlow: latestFlow
  };

  const currentTierName = getRmrTier(user.rmr);
  const displayTierName = getDisplayTier(user.rmr, user.rallyCount);
  const currentTierData = TIER_LEVELS.find(t => t.name === currentTierName);
  const currentTierType = currentTierData ? currentTierData.type : 'bronze';
  const targetTierName = selectedTierName ?? currentTierName;

  const racketResult = useMemo(() => {
    if (isLoadingDB || allRacketsData.length === 0) return null;
    return recommendRacket(user.videoHistory, user.rmr, user.latestFlow, allRacketsData);
  }, [user.rmr, user.videoHistory, user.latestFlow, allRacketsData, isLoadingDB]);

  const handleTierPress = (tierName: string) => {
    if (selectedTierName === tierName) setSelectedTierName(null);
    else setSelectedTierName(tierName);
  };

  const openRacketDetail = (racket: RacketDetail) => {
    setSelectedRacket(racket);
    setDetailModalVisible(true);
  };

  const openLegalModal = (title: string, content: string) => {
    setLegalTitle(title);
    setLegalContent(content);
    setLegalModalVisible(true);
  };

  const handleCheckNickname = async () => {
    if (!newNickname.trim()) {
        setNicknameMessage('닉네임을 입력해주세요.');
        return;
    }
    if (newNickname === userProfile.nickname) {
        setNicknameMessage('현재 사용 중인 닉네임입니다.');
        setIsNicknameValid(true);
        return;
    }

    setIsCheckingNickname(true);
    try {
        const db = getFirestore(getApp());
        const q = query(collectionGroup(db, 'profile'), where('nickname', '==', newNickname));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            setNicknameMessage('사용 가능한 닉네임입니다.');
            setIsNicknameValid(true);
        } else {
            setNicknameMessage('이미 사용 중인 닉네임입니다.');
            setIsNicknameValid(false);
        }
    } catch (e) {
        setNicknameMessage('확인 중 오류가 발생했습니다.');
        setIsNicknameValid(false);
    } finally {
        setIsCheckingNickname(false);
    }
  };

  const handleSaveAccountSettings = async () => {
    if (!isNicknameValid && newNickname !== userProfile.nickname) {
        Alert.alert('오류', '닉네임 중복 확인을 해주세요.');
        return;
    }

    setIsSaving(true);
    try {
        const db = getFirestore(getApp());
        const appId = 'rally-app-main';
        const userRef = doc(db, 'artifacts', appId, 'users', userProfile.uid, 'profile', 'info');

        await updateDoc(userRef, {
            nickname: newNickname
        });

        Alert.alert('성공', '계정 정보가 업데이트 되었습니다.');
        setAccountModalVisible(false);
    } catch (e) {
        Alert.alert('실패', '업데이트에 실패했습니다.');
    } finally {
        setIsSaving(false);
    }
  };

  const handleProfileImageChange = async () => {
      launchImageLibrary({ mediaType: 'photo', quality: 0.5 }, async (response) => {
          if (response.didCancel) return;
          if (response.errorCode) {
              Alert.alert('오류', '이미지를 선택할 수 없습니다.');
              return;
          }

          if (response.assets && response.assets.length > 0) {
              const asset = response.assets[0];
              if (!asset.uri) return;

              setIsSaving(true);
              try {
                  const responseUrl = await fetch(asset.uri);
                  const blob = await responseUrl.blob();

                  const storage = getStorage(getApp());
                  const imageRef = ref(storage, `artifacts/rally-app-main/users/${userProfile.uid}/profile_image.jpg`);

                  await uploadBytesResumable(imageRef, blob);
                  const downloadURL = await getDownloadURL(imageRef);

                  const db = getFirestore(getApp());
                  const userRef = doc(db, 'artifacts', 'rally-app-main', 'users', userProfile.uid, 'profile', 'info');
                  await updateDoc(userRef, { avatarUrl: downloadURL });

                  Alert.alert('성공', '프로필 사진이 성공적으로 변경되었습니다.');
              } catch (e) {
                  console.error("Profile Image Upload Error: ", e);
                  Alert.alert('실패', '사진 업로드 중 오류가 발생했습니다.');
              } finally {
                  setIsSaving(false);
              }
          }
      });
  };

  const handleDeleteAccount = () => {
      Alert.alert(
          '회원 탈퇴',
          '정말로 탈퇴하시겠습니까? 모든 경기 기록과 RMR 점수가 영구적으로 삭제되며 복구할 수 없습니다.',
          [
              { text: '취소', style: 'cancel' },
              {
                  text: '탈퇴하기',
                  style: 'destructive',
                  onPress: async () => {
                      const auth = getAuth(getApp());
                      const currentUser = auth.currentUser;
                      if (currentUser) {
                          try {
                              await currentUser.delete();
                          } catch (e: any) {
                              if (e.code === 'auth/requires-recent-login') {
                                  Alert.alert('오류', '보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요.');
                                  onLogout();
                              } else {
                                  Alert.alert('탈퇴 실패', '문제가 발생했습니다. 고객센터에 문의해주세요.');
                              }
                          }
                      }
                  }
              }
          ]
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 정보</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MatchHistory')} style={styles.historyButton}>
          <History size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* 유저 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.profileLeft}>
            <Image source={user.avatar} style={styles.avatar} />
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.location}>{user.location}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.profileRight}>
            <View style={styles.statItem}><Text style={styles.statLabel}>티어</Text><Text style={styles.statValueTier}>{displayTierName}</Text></View>
            <View style={styles.statItem}><Text style={styles.statLabel}>전적</Text><Text style={styles.statValue}>{user.wins}승 {user.losses}패</Text></View>
            <View style={styles.statItem}><Text style={styles.statLabel}>매너</Text><Text style={styles.statValue}>{Number(user.mannerScore).toFixed(1)} / 5.0</Text></View>
          </View>
        </View>

        {/* 탭 네비게이션 */}
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'tier' && styles.activeTabButton]} onPress={() => setActiveTab('tier')}>
            <Text style={[styles.tabText, activeTab === 'tier' && styles.activeTabText]}>티어</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'info' && styles.activeTabButton]} onPress={() => setActiveTab('info')}>
            <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>티어 정보</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'racket' && styles.activeTabButton]}
            onPress={() => setActiveTab('racket')}
          >
            <Text style={[styles.tabText, activeTab === 'racket' && styles.activeTabText]}>
              장비 추천
            </Text>
            <View style={styles.betaBadge}>
              <Text style={styles.betaText}>BETA</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 탭별 콘텐츠 */}
        <View style={styles.contentSection}>
          {activeTab === 'tier' ? (
            <View style={styles.tierTabContent}>
              <View style={styles.tierImageContainer}>
                 <Image source={TIER_IMAGES[currentTierType as keyof typeof TIER_IMAGES]} style={styles.mainTierImage} resizeMode="contain" />
              </View>
              <Text style={styles.myScoreText}>{user.rmr} RMR</Text>
              <Text style={styles.myTierLabel}>현재 나의 티어: <Text style={{color: COLORS[currentTierType as keyof typeof COLORS].front[0]}}>{displayTierName}</Text></Text>
            </View>
          ) : activeTab === 'info' ? (
            <View style={styles.pyramidSection}>
              <Text style={styles.pyramidTitle}>티어 표</Text>
              <Text style={styles.pyramidSubtitle}>{selectedTierName ? '다시 누르면 내 정보로 돌아갑니다' : '다른 등급을 눌러 상세 정보를 확인하세요'}</Text>
              <View style={styles.svgContainer}>
                <Svg height={PYRAMID_HEIGHT + 42} width={screenWidth}>
                  <Defs>
                    {Object.keys(COLORS).map((key) => (
                      <LinearGradient id={`grad_${key}`} x1="0" y1="0" x2="1" y2="1" key={key}>
                        <Stop offset="0" stopColor={COLORS[key as keyof typeof COLORS].front[0]} stopOpacity="1" />
                        <Stop offset="1" stopColor={COLORS[key as keyof typeof COLORS].front[1]} stopOpacity="1" />
                      </LinearGradient>
                    ))}
                  </Defs>
                  {TIER_LEVELS.map((level, index) => {
                    const isCurrent = level.name === currentTierName;
                    const isSelected = level.name === selectedTierName;
                    const isTarget = level.name === targetTierName;
                    let colorKey = (isCurrent || isSelected) ? level.type : 'disabled';
                    const colorSet = COLORS[colorKey as keyof typeof COLORS];
                    const totalLevels = TIER_LEVELS.length;
                    const topRatio = index / totalLevels;
                    const bottomRatio = (index + 1) / totalLevels;
                    const yTop = START_Y + (topRatio * PYRAMID_HEIGHT);
                    const yBottom = START_Y + (bottomRatio * PYRAMID_HEIGHT);
                    const wTop = PYRAMID_WIDTH * topRatio;
                    const wBottom = PYRAMID_WIDTH * bottomRatio;
                    const xTopLeft = CENTER_X - (wTop / 2);
                    const xTopRight = CENTER_X + (wTop / 2);
                    const xBottomLeft = CENTER_X - (wBottom / 2);
                    const xBottomRight = CENTER_X + (wBottom / 2);

                    const frontPath = `M ${xTopLeft} ${yTop} L ${xTopRight} ${yTop} L ${xBottomRight} ${yBottom} L ${xBottomLeft} ${yBottom} Z`;
                    const sidePath = `M ${xTopRight} ${yTop} L ${xTopRight + DEPTH_X} ${yTop + DEPTH_Y} L ${xBottomRight + DEPTH_X} ${yBottom + DEPTH_Y} L ${xBottomRight} ${yBottom} Z`;

                    let line1 = '', line2 = '', labelColor = '#9CA3AF';
                    if (isTarget) {
                      const diff = level.minRmr - user.rmr;
                      if (isCurrent) { line1 = `◀ ${level.name} (현재 ${user.rmr}점)`; line2 = `   구간: ${level.minRmr} ~ ${TIER_LEVELS[index - 1]?.minRmr - 1 || 'MAX'}점`; labelColor = '#34D399'; }
                      else if (diff > 0) { line1 = `◀ ${level.name} (${level.minRmr}점⬆)`; line2 = `   승급까지 +${diff}점 필요`; labelColor = '#F87171'; }
                      else { line1 = `◀ ${level.name} (${level.minRmr}점⬆)`; line2 = `   달성 완료 (여유 +${Math.abs(diff)}점)`; labelColor = '#60A5FA'; }
                    }

                    return (
                      <G key={level.name} onPress={() => handleTierPress(level.name)}>
                        <Path d={sidePath} fill={colorSet.side} stroke={colorSet.side} strokeWidth={1} />
                        <Path d={frontPath} fill={`url(#grad_${colorKey})`} stroke={isSelected ? '#FFFFFF' : (isCurrent ? '#FFFFFF' : '#111827')} strokeWidth={isSelected ? 2 : 0.5} />
                        {isTarget && (
                          <SvgText fill={labelColor} fontSize="14" fontWeight="bold" x={xBottomRight + DEPTH_X + 12} y={yBottom - (PYRAMID_HEIGHT / totalLevels / 2)} textAnchor="start">
                            <TSpan x={xBottomRight + DEPTH_X + 12} dy="-6">{line1}</TSpan>
                            <TSpan x={xBottomRight + DEPTH_X + 12} dy="16" fontSize="11" fontWeight="normal" fill="#9CA3AF">{line2}</TSpan>
                          </SvgText>
                        )}
                      </G>
                    );
                  })}
                </Svg>
              </View>
            </View>
          ) : (
            <View style={styles.racketSection}>
              {isLoadingDB ? (
                  <Text style={{color: '#9CA3AF', textAlign: 'center', marginTop: 40}}>추천 데이터를 불러오는 중입니다...</Text>
              ) : allRacketsData.length === 0 ? (
                  <Text style={{color: '#9CA3AF', textAlign: 'center', marginTop: 40}}>라켓 데이터가 없습니다. Home에서 DB셋업을 실행해주세요.</Text>
              ) : racketResult ? (
                <>
                  <View style={styles.racketHeaderCard}>
                    <Dumbbell size={28} color="#34D399" />
                    <View style={{marginLeft: 12}}>
                      <Text style={styles.racketMainStyle}>플레이 스타일: {racketResult.balance}</Text>
                      <Text style={styles.racketSubStyle}>추천 샤프트: {racketResult.shaft}</Text>
                    </View>
                  </View>

                  <Text style={styles.analysisDesc}>{racketResult.description}</Text>

                  <View style={styles.racketGrid}>
                    <View style={styles.productCard}>
                      <View style={styles.productBadge}><Gem size={12} color="#FDB931" /><Text style={styles.productBadgeText}>프리미엄</Text></View>
                      <Text style={styles.productName}>{racketResult.premium.name}</Text>
                      <Text style={styles.productTag}>숙련자용 최고 사양</Text>
                      <TouchableOpacity style={[styles.buyButton, {backgroundColor: '#374151'}]} onPress={() => openRacketDetail(racketResult.premium)}><ShoppingBag size={16} color="white" /><Text style={styles.buyText}>상세보기</Text></TouchableOpacity>
                    </View>
                    <View style={styles.productCard}>
                      <View style={[styles.productBadge, {backgroundColor: 'rgba(96, 165, 250, 0.2)'}]}><Wallet size={12} color="#60A5FA" /><Text style={[styles.productBadgeText, {color: '#60A5FA'}]}>가성비</Text></View>
                      <Text style={styles.productName}>{racketResult.budget.name}</Text>
                      <Text style={styles.productTag}>최고의 효율과 퍼포먼스</Text>
                      <TouchableOpacity style={[styles.buyButton, {backgroundColor: '#374151'}]} onPress={() => openRacketDetail(racketResult.budget)}><ShoppingBag size={16} color="white" /><Text style={styles.buyText}>상세보기</Text></TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setAccountModalVisible(true)}>
              <Settings size={22} color="#9CA3AF" />
              <Text style={styles.menuText}>계정 설정</Text>
              <ChevronRight size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => setPrivacyModalVisible(true)}>
              <Shield size={22} color="#9CA3AF" />
              <Text style={styles.menuText}>개인정보 및 보안</Text>
              <ChevronRight size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
              <LogOut size={22} color="#EF4444" />
              <Text style={[styles.menuText, {color: '#EF4444'}]}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 장비 상세 모달 */}
      <Modal animationType="slide" transparent={true} visible={detailModalVisible} onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>라켓 상세 정보</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}><X size={24} color="white" /></TouchableOpacity>
            </View>
            <View style={styles.modalScroll}>
              <View style={styles.racketImagePlaceholder}>
                {selectedRacket?.imageUrl ? (
                    <Image source={{ uri: selectedRacket.imageUrl }} style={{ width: 200, height: 200, borderRadius: 20, resizeMode: 'contain' }} />
                ) : selectedRacket?.id && RACKET_IMAGES[selectedRacket.id] ? (
                  <Image source={RACKET_IMAGES[selectedRacket.id]} style={{ width: 200, height: 200, borderRadius: 20, resizeMode: 'contain' }} />
                ) : (
                  <Text style={{ color: '#4B5563' }}>이미지 없음</Text>
                )}
              </View>
              <Text style={styles.detailRacketName}>{selectedRacket?.name}</Text>
              <View style={styles.specContainer}>
                <View style={styles.specRow}><Scale size={17} color="#34D399" /><Text style={styles.specLabel}>무게:</Text><Text style={styles.specValue}>{selectedRacket?.weight}</Text></View>
                <View style={styles.specRow}><PencilRuler size={17} color="#FDB931" /><Text style={styles.specLabel}>권장 장력:</Text><Text style={styles.specValue}>{selectedRacket?.tension}</Text></View>
              </View>
              <Text style={styles.featureTitle}>주요 특징</Text>
              {selectedRacket?.features.map((f, i) => (
                <View key={i} style={styles.featureRow}><CheckCircle2 size={16} color="#34D399" /><Text style={styles.featureText}>{f}</Text></View>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 계정 설정 모달 */}
      <Modal animationType="slide" transparent={true} visible={accountModalVisible} onRequestClose={() => setAccountModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>계정 설정</Text>
              <TouchableOpacity onPress={() => setAccountModalVisible(false)}><X size={24} color="white" /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* 프로필 사진 변경 영역 */}
                <View style={styles.editProfileImageContainer}>
                    <TouchableOpacity onPress={handleProfileImageChange} style={styles.avatarWrapper}>
                        <Image source={user.avatar} style={styles.editAvatar} />
                        <View style={styles.cameraIconBadge}>
                            <Camera size={16} color="white" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.editProfileImageText}>사진 변경</Text>
                </View>

                {/* 닉네임 변경 영역 */}
                <Text style={styles.inputLabel}>닉네임</Text>
                <View style={styles.inputRow}>
                    <View style={styles.inputContainer}>
                        <Edit2 size={20} color="#9CA3AF" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            value={newNickname}
                            onChangeText={(text) => {
                                setNewNickname(text);
                                setIsNicknameValid(false);
                                setNicknameMessage('');
                            }}
                            placeholder="새 닉네임 입력"
                            placeholderTextColor="#6B7280"
                        />
                    </View>
                    <TouchableOpacity style={styles.checkBtn} onPress={handleCheckNickname} disabled={isCheckingNickname}>
                        {isCheckingNickname ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.checkBtnText}>중복확인</Text>}
                    </TouchableOpacity>
                </View>
                {nicknameMessage ? (
                    <Text style={[styles.messageText, isNicknameValid ? {color: '#34D399'} : {color: '#EF4444'}]}>
                        {nicknameMessage}
                    </Text>
                ) : null}

                <TouchableOpacity
                    style={[styles.modalCloseBtn, {marginTop: 40}, (!isNicknameValid && newNickname !== userProfile?.nickname) && {opacity: 0.5}]}
                    onPress={handleSaveAccountSettings}
                    disabled={(!isNicknameValid && newNickname !== userProfile?.nickname) || isSaving}
                >
                    {isSaving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={styles.modalCloseBtnText}>저장하기</Text>}
                </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 개인정보 및 보안 모달 */}
      <Modal animationType="slide" transparent={true} visible={privacyModalVisible} onRequestClose={() => setPrivacyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>개인정보 및 보안</Text>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}><X size={24} color="white" /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.securitySection}>
                <Text style={styles.inputLabel}>약관 및 정책</Text>

                <TouchableOpacity style={styles.menuItemRow} onPress={() => openLegalModal('이용약관', LEGAL_TEXTS.terms)}>
                    <FileText size={20} color="#9CA3AF" />
                    <Text style={styles.menuText}>이용약관</Text>
                    <ChevronRight size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItemRow} onPress={() => openLegalModal('개인정보 처리방침', LEGAL_TEXTS.privacy)}>
                    <Shield size={20} color="#9CA3AF" />
                    <Text style={styles.menuText}>개인정보 처리방침</Text>
                    <ChevronRight size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItemRow} onPress={() => openLegalModal('권리 표기 및 위치정보', LEGAL_TEXTS.location)}>
                    <MapPin size={20} color="#9CA3AF" />
                    <Text style={styles.menuText}>권리 표기 및 위치정보</Text>
                    <ChevronRight size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <View style={styles.dangerZone}>
                    <Text style={styles.dangerTitle}>위험 구역 (Danger Zone)</Text>
                    <Text style={styles.dangerDesc}>계정을 삭제하면 모든 RMR 기록과 전적이 영구적으로 사라집니다.</Text>
                    <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
                        <Trash2 size={20} color="#EF4444" style={styles.inputIcon} />
                        <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 법적 고지(약관) 내용 모달 */}
      <Modal animationType="fade" transparent={true} visible={legalModalVisible} onRequestClose={() => setLegalModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{legalTitle}</Text>
              <TouchableOpacity onPress={() => setLegalModalVisible(false)}>
                <X size={24} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginVertical: 16, maxHeight: 400 }}>
              <Text style={{ color: '#D1D5DB', lineHeight: 22 }}>{legalContent}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setLegalModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, backgroundColor: '#1F2937' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  historyButton: { padding: 4 },
  profileCard: { flexDirection: 'row', backgroundColor: '#1F2937', margin: 16, borderRadius: 16, padding: 16, alignItems: 'center' },
  profileLeft: { flex: 4, alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, marginBottom: 8, backgroundColor: '#374151' },
  name: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  location: { fontSize: 11, color: '#9CA3AF' },
  verticalDivider: { width: 1, height: '80%', backgroundColor: '#374151', marginHorizontal: 15 },
  profileRight: { flex: 6, gap: 8 },
  statItem: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: '#9CA3AF', fontSize: 13 },
  statValue: { color: 'white', fontWeight: 'bold' },
  statValueTier: { color: '#34D399', fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1F2937', borderRadius: 12, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTabButton: { backgroundColor: '#374151' },
  tabText: { color: '#9CA3AF', fontSize: 14 },
  activeTabText: { color: 'white', fontWeight: 'bold' },
  contentSection: { minHeight: 300 },
  tierTabContent: { alignItems: 'center', paddingVertical: 1 },
  tierImageContainer: { width: 200, height: 200, marginBottom: 15 },
  mainTierImage: { width: '100%', height: '100%' },
  myScoreText: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  myTierLabel: { color: '#9CA3AF', marginTop: 4, marginBottom: 38 },
  pyramidSection: { alignItems: 'center', marginBottom: 0, marginTop: 2.7, },
  pyramidTitle: { color: '#9CA3AF', fontSize: 16, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1.5 },
  pyramidSubtitle: { color: '#6B7280', fontSize: 11, marginBottom: 20, },
  svgContainer: { alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10, },
  racketSection: { paddingHorizontal: 16 },
  racketHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#34D399' },
  racketMainStyle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  racketSubStyle: { color: '#34D399', fontSize: 14 },
  analysisDesc: { color: '#9CA3AF', fontSize: 13, marginVertical: 16, lineHeight: 20, textAlign: 'center' },
  racketGrid: { flexDirection: 'row', gap: 12 },
  productCard: { flex: 1, backgroundColor: '#1F2937', borderRadius: 16, padding: 12, alignItems: 'center' },
  productBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(253, 185, 49, 0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 2, marginBottom: 8 },
  productBadgeText: { color: '#FDB931', fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  productName: { color: 'white', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginTop:8, height: 28 },
  productTag: { color: '#6B7280', fontSize: 10, marginBottom: 10 },
  buyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginBottom: 2 },
  buyText: { color: 'white', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  menuSection: { backgroundColor: '#1F2937', marginTop: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  menuText: { flex: 1, color: 'white', marginLeft: 12, fontSize: 15 },
  menuItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, marginBottom: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1F2937', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#374151' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalScroll: { alignItems: 'center' },
  racketImagePlaceholder: { width: 200, height: 200, backgroundColor: '#111827', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#374151' },
  detailRacketName: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  specContainer: { width: '100%', backgroundColor: '#111827', borderRadius: 16, padding: 16, marginBottom: 20 },
  specRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  specLabel: { color: '#9CA3AF', fontSize: 14, marginLeft: 12, width: 70 },
  specValue: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  featureTitle: { color: 'white', fontSize: 15, fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  featureText: { color: '#D1D5DB', fontSize: 13, marginLeft: 10, marginBottom: 2 },
  modalCloseBtn: { backgroundColor: '#34D399', width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  modalCloseBtnText: { color: '#111827', fontWeight: 'bold', fontSize: 16 },

  betaBadge: { position: 'absolute', top: +4, right: 4, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, zIndex: 10 },
  betaText: { color: '#FFFFFF', fontSize: 8, fontWeight: 'bold', includeFontPadding: false },

  // 계정 설정 및 프로필 변경 모달 스타일
  editProfileImageContainer: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  avatarWrapper: { position: 'relative' },
  editAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#374151' },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#34D399', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#1F2937' },
  editProfileImageText: { color: '#9CA3AF', fontSize: 13, marginTop: 12 },

  inputLabel: { color: '#D1D5DB', fontSize: 14, marginBottom: 8, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 12, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: 'white', fontSize: 16, paddingVertical: 14 },
  checkBtn: { backgroundColor: '#374151', paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', height: 52 },
  checkBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  messageText: { fontSize: 12, marginTop: 6, marginLeft: 4 },

  securitySection: { marginTop: 10 },
  dangerZone: { marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#374151' },
  dangerTitle: { color: '#EF4444', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  dangerDesc: { color: '#9CA3AF', fontSize: 13, marginBottom: 16, lineHeight: 20 },
  deleteAccountButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  deleteAccountText: { color: '#EF4444', fontSize: 15, fontWeight: 'bold' },
});