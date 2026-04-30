import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Modal,
  SafeAreaView,
  Dimensions,
  FlatList,
  Pressable,
} from 'react-native';
import {
  Mail,
  User,
  Check,
  X,
  ChevronRight,
  MapPin,
  ChevronLeft,
} from 'lucide-react-native';

import { login, getProfile } from '@react-native-seoul/kakao-login';
// RMRCalculator에서 퀴즈 계산 관련 함수 임포트
import { getInitialRMRAndRD } from '../../utils/rmrCalculator';

const { width } = Dimensions.get('window');

interface SignUpScreenProps {
  onGoToLogin: () => void;
  onSignUp: (email: string, password: string, nickname: string, rmr: number, rd: number, region: string, gender: string) => void;
  checkKakaoDuplicate: (kakaoId: string) => Promise<boolean>;
  checkNicknameAvailability: (nickname: string) => Promise<boolean>;
}

const MAIN_REGIONS = [
  { label: '서울', value: '서울' },
  { label: '경기', value: '경기' },
  { label: '인천', value: '인천' },
  { label: '강원', value: '강원' },
  { label: '충청', value: '충청' },
  { label: '전라', value: '전라' },
  { label: '경상', value: '경상' },
  { label: '제주', value: '제주' },
];

const SUB_REGIONS: { [key: string]: string[] } = {
  '서울': ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '경기': ['수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '광명시', '김포시', '군포시', '광주시', '이천시', '양주시', '오산시', '구리시', '안성시', '포천시', '의왕시', '하남시', '여주시', '양평군', '동두천시', '과천시', '가평군', '연천군'],
  '인천': ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  '강원': ['전체'], '충청': ['전체'], '전라': ['전체'], '경상': ['전체'], '제주': ['전체']
};

const LEGAL_TEXTS = {
  terms: `제1조 (목적)\n본 약관은 레코(RECO) 서비스 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.`,
  privacy: `1. 개인정보 수집 항목\n이메일, 비밀번호, 닉네임, 휴대폰 번호, 활동 지역, 성별 등 서비스 제공에 필요한 최소한의 정보를 수집합니다.`,
  location: `1. 위치정보 이용 목적\n사용자의 현재 위치를 기반으로 주변 경기장 및 매칭 정보를 제공하기 위해 위치정보를 이용합니다.`
};

const StepIndicator = ({ currentStep }: { currentStep: number }) => (
  <View style={styles.stepIndicatorContainer}>
    {[1, 2, 3, 4].map((step) => (
      <React.Fragment key={step}>
        <View
          style={[
            styles.stepDot,
            step === currentStep && styles.stepDotActive,
            step < currentStep && styles.stepDotCompleted,
          ]}
        >
          {step < currentStep ? (
            <Check size={14} color="white" />
          ) : (
            <Text style={[styles.stepText, step === currentStep && styles.stepTextActive]}>
              {step}
            </Text>
          )}
        </View>
        {step < 4 && <View style={styles.stepLine} />}
      </React.Fragment>
    ))}
  </View>
);

const Step1_TOS = ({ onNext }: { onNext: () => void }) => {
  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeLocation, setAgreeLocation] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  const handleAgreeAll = (value: boolean) => {
    setAgreeAll(value);
    setAgreeTerms(value);
    setAgreePrivacy(value);
    setAgreeLocation(value);
  };

  const openModal = (title: string, content: string) => {
    setModalTitle(title);
    setModalContent(content);
    setModalVisible(true);
  };

  const isNextDisabled = !agreeTerms || !agreePrivacy || !agreeLocation;

  return (
    <>
      <Text style={styles.title}>약관 동의</Text>
      <Text style={styles.subtitle}>레코(RECO) 여정을 위해 동의가 필요해요.</Text>
      <TouchableOpacity style={[styles.checkContainer, styles.checkAll]} onPress={() => handleAgreeAll(!agreeAll)}>
        <View style={[styles.checkbox, agreeAll && styles.checkboxActive]}>
          {agreeAll && <Check size={16} color="white" />}
        </View>
        <Text style={styles.checkLabelAll}>전체 동의하기</Text>
      </TouchableOpacity>
      <View style={styles.divider} />
      <View style={styles.termRow}>
        <TouchableOpacity style={styles.termCheckArea} onPress={() => setAgreeTerms(!agreeTerms)}>
          <View style={[styles.checkbox, agreeTerms && styles.checkboxActive]}>
            {agreeTerms && <Check size={16} color="white" />}
          </View>
          <Text style={styles.checkLabel}>[필수] 이용약관</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openModal('이용약관', LEGAL_TEXTS.terms)}>
          <Text style={styles.checkLink}>보기</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.termRow}>
        <TouchableOpacity style={styles.termCheckArea} onPress={() => setAgreePrivacy(!agreePrivacy)}>
          <View style={[styles.checkbox, agreePrivacy && styles.checkboxActive]}>
            {agreePrivacy && <Check size={16} color="white" />}
          </View>
          <Text style={styles.checkLabel}>[필수] 개인정보 처리방침</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openModal('개인정보 처리방침', LEGAL_TEXTS.privacy)}>
          <Text style={styles.checkLink}>보기</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.termRow}>
        <TouchableOpacity style={styles.termCheckArea} onPress={() => setAgreeLocation(!agreeLocation)}>
          <View style={[styles.checkbox, agreeLocation && styles.checkboxActive]}>
            {agreeLocation && <Check size={16} color="white" />}
          </View>
          <Text style={styles.checkLabel}>[필수] 위치정보 이용약관</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openModal('위치정보 이용약관', LEGAL_TEXTS.location)}>
          <Text style={styles.checkLink}>보기</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, isNextDisabled && styles.buttonDisabled]} onPress={onNext} disabled={isNextDisabled}>
        <Text style={styles.buttonText}>다음</Text>
      </TouchableOpacity>

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalText}>{modalContent}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalButtonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const Step2_KakaoVerify = ({
  onNext,
  onGoToLogin,
  checkKakaoDuplicate // 추가
}: {
  onNext: (data: any) => void;
  onGoToLogin: () => void;
  checkKakaoDuplicate: (kakaoId: string) => Promise<boolean>; // 추가
}) => {
  const [isVerified, setIsVerified] = useState(false);

  const handleKakaoVerification = async () => {
    try {
      const token = await login();
      const profile = await getProfile();

      // 핵심 수정: 카카오에서 이메일을 제대로 안 줬을 경우 컷!
      if (!profile.email) {
        Alert.alert(
          '이메일 동의 필요',
          '회원가입을 위해 카카오 이메일 정보가 필수입니다. 카카오 연동 해제 후 다시 시도하여 이메일 제공에 동의해주세요.'
        );
        return; // 여기서 멈추기 때문에 파이어베이스 에러가 안 납니다.
      }

      const kakaoIdString = profile.id.toString();

      const isDuplicate = await checkKakaoDuplicate(kakaoIdString);

      if (isDuplicate) {
        Alert.alert(
          '이미 가입된 계정',
          '해당 카카오 계정으로 가입된 정보가 있습니다. 로그인 화면으로 이동합니다.',
          [{ text: '확인', onPress: onGoToLogin }]
        );
        return; // 중복이면 여기서 멈춤
      }

      setIsVerified(true);
      Alert.alert('인증 성공', '카카오 간편인증이 완료되었습니다.');

      setTimeout(() => {
        onNext({
          email: profile.email, // 진짜 카카오 이메일을 그대로 넘김!
          kakaoId: profile.id.toString(),
          password: profile.id.toString()
        });
      }, 800);

    } catch (err: any) {
      console.error('Kakao Verification Error:', err);
      if (err.message !== 'Logged out') {
        Alert.alert('인증 실패', '카카오 인증 중 오류가 발생했습니다.');
      }
    }
  };

  return (
    <>
      <Text style={styles.title}>본인 인증</Text>
      <Text style={styles.subtitle}>안전한 매칭을 위해 카카오 간편인증을 진행합니다.</Text>

      {!isVerified ? (
        <TouchableOpacity style={styles.kakaoVerifyButton} onPress={handleKakaoVerification}>
          <Image
            source={{ uri: 'https://developers.kakao.com/assets/img/lib/logos/kakaolink/kakaolink_btn_medium.png' }}
            style={styles.kakaoIcon}
          />
          <Text style={styles.kakaoVerifyButtonText}>카카오로 본인인증 하기</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.verifiedBox}>
          <Check size={24} color="#34D399" />
          <Text style={styles.verifiedText}>인증이 완료되었습니다.</Text>
        </View>
      )}
    </>
  );
};

const Step3_AccountInfo = ({
  onNext,
  initialData,
  checkNicknameAvailability
}: {
  onNext: (data: any) => void;
  initialData: any;
  checkNicknameAvailability: (nickname: string) => Promise<boolean>;
}) => {
  // 비밀번호 관련 상태 제거
  const [nickname, setNickname] = useState(initialData.nickname || '');
  const [region, setRegion] = useState(initialData.region || '');
  const [gender, setGender] = useState<'남성' | '여성' | null>(initialData.gender || null);

  const [nicknameMsg, setNicknameMsg] = useState('');
  const [isNicknameValid, setIsNicknameValid] = useState(false);
  const [isNicknameChecked, setIsNicknameChecked] = useState(false);

  const [isRegionModalVisible, setIsRegionModalVisible] = useState(false);
  const [tempMainRegion, setTempMainRegion] = useState<string | null>(null);

  const handleNicknameChange = (text: string) => {
    setNickname(text.replace(/\s/g, ''));
    setIsNicknameValid(false);
    setIsNicknameChecked(false);
    setNicknameMsg('');
  };

  const handleCheckNickname = async () => {
    if (!nickname) {
        setNicknameMsg('닉네임을 입력해주세요.');
        return;
    }
    if (nickname.length < 2) {
        setNicknameMsg('닉네임은 2자 이상이어야 합니다.');
        return;
    }

    setNicknameMsg('확인 중...');

    try {
        const isAvail = await checkNicknameAvailability(nickname);
        setIsNicknameChecked(true);
        if (isAvail) {
            setNicknameMsg('사용 가능한 닉네임입니다.');
            setIsNicknameValid(true);
        } else {
            setNicknameMsg('이미 사용 중인 닉네임입니다.');
            setIsNicknameValid(false);
        }
    } catch (error) {
        console.error(error);
        setNicknameMsg('확인 중 오류가 발생했습니다.');
        setIsNicknameChecked(true);
        setIsNicknameValid(false);
    }
  };

  const handleNext = () => {
    if (!isNicknameChecked || !isNicknameValid) {
        Alert.alert('확인 필요', '닉네임 중복 확인 버튼을 눌러주세요.');
        return;
    }
    if (!region || !gender) {
      Alert.alert('입력 누락', '지역과 성별을 선택해주세요.');
      return;
    }
    // 이메일과 패키지 데이터는 initialData에서 유지
    onNext({ nickname, region, gender });
  };

  const handleRegionItemPress = (itemValue: string) => {
    if (!tempMainRegion) {
      setTempMainRegion(itemValue);
    } else {
      const finalRegion = itemValue === '전체' ? tempMainRegion : `${tempMainRegion} ${itemValue}`;
      setRegion(finalRegion);
      setIsRegionModalVisible(false);
      setTempMainRegion(null);
    }
  };

  const renderRegionList = () => {
    if (!tempMainRegion) {
      return (
        <FlatList
          data={MAIN_REGIONS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.regionItem} onPress={() => handleRegionItemPress(item.value)}>
              <Text style={styles.regionItemText}>{item.label}</Text>
              <ChevronRight size={16} color="#D1D5DB" />
            </TouchableOpacity>
          )}
        />
      );
    }
    const subRegions = SUB_REGIONS[tempMainRegion] || ['전체'];
    return (
      <View style={{flex: 1, width: '100%'}}>
        <TouchableOpacity style={styles.regionHeaderBack} onPress={() => setTempMainRegion(null)}>
          <ChevronLeft size={20} color="#374151" />
          <Text style={styles.regionHeaderBackText}>{tempMainRegion} (다시 선택)</Text>
        </TouchableOpacity>
        <FlatList
          data={subRegions}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.regionItem} onPress={() => handleRegionItemPress(item)}>
              <Text style={styles.regionItemText}>
                {item === '전체' ? `${tempMainRegion} 전체` : item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  // 비밀번호 검증이 빠지면서 비활성화 조건 간소화
  const isButtonDisabled = !isNicknameValid || !region || !gender;

  return (
    <>
      <Text style={styles.title}>계정 정보</Text>
      <Text style={styles.subtitle}>로그인 정보와 프로필을 완성해주세요.</Text>

      {/* 카카오 인증된 이메일 자동 삽입 (읽기 전용) */}
      <View style={[styles.inputContainer, styles.inputVerified]}>
        <Mail size={20} color="#34D399" style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: '#34D399', fontWeight: 'bold' }]}
          value={initialData.email}
          editable={false}
        />
      </View>
      <Text style={[styles.helperText, styles.successText, { marginBottom: 16, marginTop: -8, alignSelf: 'flex-start' }]}>
        카카오 연동으로 이메일이 자동 입력되었습니다.
      </Text>

      {/* 닉네임 입력 */}
      <View style={[styles.inputContainer, { marginTop: 0, marginBottom: 0 }]}>
        <User size={20} color="#9CA3AF" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="닉네임"
          placeholderTextColor="#9CA3AF"
          value={nickname}
          onChangeText={handleNicknameChange}
        />
      </View>

      <TouchableOpacity
        style={[styles.checkButton, isNicknameChecked && isNicknameValid ? styles.checkButtonSuccess : {}]}
        onPress={handleCheckNickname}
        disabled={isNicknameChecked && isNicknameValid}
      >
        <Text style={styles.checkButtonText}>
            {isNicknameChecked && isNicknameValid ? "확인 완료" : "중복 확인"}
        </Text>
      </TouchableOpacity>

      <View style={styles.msgContainer}>
        {nicknameMsg ? (
            <Text style={[styles.helperText, isNicknameValid ? styles.successText : styles.errorText]}>
                {nicknameMsg}
            </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.inputContainer}
        onPress={() => { setTempMainRegion(null); setIsRegionModalVisible(true); }}
      >
        <MapPin size={20} color={region ? "#34D399" : "#9CA3AF"} style={styles.inputIcon} />
        <Text style={[styles.inputText, !region && styles.placeholderText]}>
          {region || "주 활동 지역 선택"}
        </Text>
        <ChevronRight size={20} color="#6B7280" />
      </TouchableOpacity>

      <View style={styles.genderContainer}>
        <TouchableOpacity style={[styles.genderButton, gender === '남성' && styles.genderButtonSelected]} onPress={() => setGender('남성')}>
          <Text style={[styles.genderText, gender === '남성' && styles.genderTextSelected]}>남성</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.genderButton, gender === '여성' && styles.genderButtonSelected]} onPress={() => setGender('여성')}>
          <Text style={[styles.genderText, gender === '여성' && styles.genderTextSelected]}>여성</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, isButtonDisabled && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={isButtonDisabled}
      >
        <Text style={styles.buttonText}>다음</Text>
      </TouchableOpacity>

      <Modal animationType="slide" transparent={true} visible={isRegionModalVisible} onRequestClose={() => setIsRegionModalVisible(false)}>
        <Pressable style={styles.regionModalOverlay} onPress={() => setIsRegionModalVisible(false)}>
          <Pressable style={styles.regionModalContent} onPress={() => {}}>
            <Text style={styles.regionModalTitle}>지역 선택</Text>
            {renderRegionList()}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const Step4_RMRQuiz = ({ onComplete }: { onComplete: (correctCount: number) => void }) => {
  const [answer1, setAnswer1] = useState<string | null>(null);
  const [answer2, setAnswer2] = useState<string | null>(null);
  const [answer3, setAnswer3] = useState<string | null>(null);

  const handleComplete = () => {
    let correctCount = 0;
    if (answer1 === 'B') correctCount++;
    if (answer2 === 'A') correctCount++;
    if (answer3 === 'A') correctCount++;
    onComplete(correctCount);
  };

  const isAllAnswered = answer1 && answer2 && answer3;

  return (
    <>
      <Text style={styles.title}>실력 가이드</Text>
      <Text style={styles.subtitle}>기본적인 룰 퀴즈로 초기 RMR 신뢰도를 측정합니다.</Text>

      <ScrollView style={{width: '100%'}} showsVerticalScrollIndicator={false}>
        <Text style={styles.quizQuestion}>Q1. 배드민턴 복식 경기에서, 서브 순서는 어떻게 되나요?</Text>
        <TouchableOpacity style={[styles.quizOption, answer1 === 'A' && styles.quizOptionSelected]} onPress={() => setAnswer1('A')}>
          <Text style={[styles.quizText, answer1 === 'A' && styles.quizTextSelected]}>A. 점수를 낼 때마다 서버가 바뀐다.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quizOption, answer1 === 'B' && styles.quizOptionSelected]} onPress={() => setAnswer1('B')}>
          <Text style={[styles.quizText, answer1 === 'B' && styles.quizTextSelected]}>B. 점수를 낸 팀이 계속 서브를 넣는다.</Text>
        </TouchableOpacity>

        <Text style={[styles.quizQuestion, { marginTop: 16 }]}>Q2. 배드민턴 경기 중 셔틀콕이 라인에 닿으면 어떻게 판정되나요?</Text>
        <TouchableOpacity style={[styles.quizOption, answer2 === 'A' && styles.quizOptionSelected]} onPress={() => setAnswer2('A')}>
          <Text style={[styles.quizText, answer2 === 'A' && styles.quizTextSelected]}>A. 인 (In)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quizOption, answer2 === 'B' && styles.quizOptionSelected]} onPress={() => setAnswer2('B')}>
          <Text style={[styles.quizText, answer2 === 'B' && styles.quizTextSelected]}>B. 아웃 (Out)</Text>
        </TouchableOpacity>

        <Text style={[styles.quizQuestion, { marginTop: 16 }]}>Q3. 랠리포인트 시스템에서 한 세트는 보통 몇 점을 먼저 내야 승리하나요?</Text>
        <TouchableOpacity style={[styles.quizOption, answer3 === 'A' && styles.quizOptionSelected]} onPress={() => setAnswer3('A')}>
          <Text style={[styles.quizText, answer3 === 'A' && styles.quizTextSelected]}>A. 21점</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quizOption, answer3 === 'B' && styles.quizOptionSelected]} onPress={() => setAnswer3('B')}>
          <Text style={[styles.quizText, answer3 === 'B' && styles.quizTextSelected]}>B. 25점</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, !isAllAnswered && styles.buttonDisabled, {marginBottom: 40}]} onPress={handleComplete} disabled={!isAllAnswered}>
          <Text style={styles.buttonText}>가입 완료</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
};

export default function SignUpScreen({
  onGoToLogin,
  onSignUp,
  checkKakaoDuplicate,
  checkNicknameAvailability
}: SignUpScreenProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [signUpData, setSignUpData] = useState({});

  const handleNextStep = (data: any = {}) => {
    setSignUpData({ ...signUpData, ...data });
    setCurrentStep(currentStep + 1);
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
        setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = (correctCount: number) => {
    const { email, password, nickname, region, gender } = signUpData as any;
    if (email && nickname) {
        const { rmr, rd } = getInitialRMRAndRD(correctCount);
        console.log("최종 회원가입 데이터:", { email, nickname, rmr, rd, region, gender });
        // 부모 컴포넌트의 타입 인터페이스 유지를 위해 password 값을 그대로 넘겨줌
        onSignUp(email, password, nickname, rmr, rd, region, gender);
    } else {
        Alert.alert("오류", "회원가입에 필요한 정보가 누락되었습니다.");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1_TOS onNext={handleNextStep} />;
      case 2:
              return (
                <Step2_KakaoVerify
                  onNext={handleNextStep}
                  onGoToLogin={onGoToLogin}
                  checkKakaoDuplicate={checkKakaoDuplicate} // Step2로 토스해줍니다.
                />
              );
      case 3:
        return (
          <Step3_AccountInfo
            onNext={handleNextStep}
            initialData={signUpData}
            checkNicknameAvailability={checkNicknameAvailability}
          />
        );
      case 4: return <Step4_RMRQuiz onComplete={handleComplete} />;
      default: return <Step1_TOS onNext={handleNextStep} />;
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.topSafeArea} />
      <View style={styles.header}>
        {currentStep > 1 && (
          <TouchableOpacity onPress={handlePrevStep} style={styles.backButton}>
            <ChevronLeft size={28} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={require('../../assets/images/reco-logo.png')} style={styles.logo} />
        <StepIndicator currentStep={currentStep} />
        {renderStep()}
        <View style={styles.linksContainer}>
          <TouchableOpacity onPress={onGoToLogin}>
            <Text style={styles.linkText}>이미 계정이 있으신가요? <Text style={styles.linkTextHighlight}>로그인</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  topSafeArea: { height: 40, backgroundColor: '#111827' },
  header: {
    height: 50,
    width: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: '#111827',
  },
  backButton: { padding: 8, marginLeft: -8 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo: { width: 60, height: 60, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#9CA3AF', marginBottom: 32, textAlign: 'center' },

  stepIndicatorContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, width: '80%' },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: '#34D399' },
  stepDotCompleted: { backgroundColor: '#34D399' },
  stepText: { color: '#9CA3AF', fontWeight: 'bold' },
  stepTextActive: { color: 'white' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#374151' },

  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, width: '100%', marginBottom: 16, paddingHorizontal: 16 },
  inputVerified: { borderColor: '#34D399', borderWidth: 1 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: 'white' },
  inputText: { flex: 1, paddingVertical: 14, fontSize: 16, color: 'white' },
  placeholderText: { color: '#9CA3AF' },

  emailRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 0 },
  atSign: { color: 'white', fontSize: 18, marginHorizontal: 8, fontWeight: 'bold' },

  checkButton: {
    width: '100%',
    paddingVertical: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 0
  },
  checkButtonSuccess: { backgroundColor: '#059669' },
  checkButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  msgContainer: { width: '100%', marginBottom: 8, marginTop: 4, paddingLeft: 4, minHeight: 20, justifyContent: 'center' },
  helperText: { fontSize: 12 },
  errorText: { color: '#EF4444' },
  successText: { color: '#34D399' },

  genderContainer: { flexDirection: 'row', width: '100%', gap: 12, marginBottom: 16 },
  genderButton: { flex: 1, backgroundColor: '#374151', borderRadius: 8, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  genderButtonSelected: { backgroundColor: '#1F2937', borderColor: '#34D399' },
  genderText: { fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  genderTextSelected: { color: '#34D399', fontWeight: 'bold' },

  button: { backgroundColor: '#34D399', borderRadius: 8, width: '100%', paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#111827', fontSize: 16, fontWeight: 'bold' },
  buttonDisabled: { backgroundColor: '#374151', opacity: 0.5 },

  linksContainer: { width: '100%', alignItems: 'center', marginTop: 24, borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 24 },
  linkText: { fontSize: 14, color: '#9CA3AF' },
  linkTextHighlight: { color: '#34D399', fontWeight: 'bold' },
  skipButton: { marginTop: 16 },

  checkContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 16 },
  checkAll: { marginBottom: 20 },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#9CA3AF', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#34D399', borderColor: '#34D399' },
  checkLabelAll: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  divider: { height: 1, backgroundColor: '#374151', width: '100%', marginBottom: 20 },
  termRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 },
  termCheckArea: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkLabel: { fontSize: 16, color: 'white' },
  checkLink: { fontSize: 14, color: '#9CA3AF', textDecorationLine: 'underline', padding: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', height: '70%', backgroundColor: '#1F2937', borderRadius: 12, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  modalBody: { flex: 1, marginVertical: 16 },
  modalText: { color: '#D1D5DB', lineHeight: 22 },
  modalButton: { backgroundColor: '#34D399', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalButtonText: { color: '#111827', fontWeight: 'bold', fontSize: 16 },

  regionModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  regionModalContent: { width: '100%', height: '60%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 32 },
  regionModalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1F2937', marginBottom: 20, textAlign: 'center' },
  regionItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  regionItemText: { fontSize: 18, color: '#1F2937' },
  regionHeaderBack: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 },
  regionHeaderBackText: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginLeft: 8 },

  // 추가된 카카오 인증 버튼 스타일
  kakaoVerifyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE500', borderRadius: 8, paddingVertical: 14, width: '100%', marginBottom: 10 },
  kakaoIcon: { width: 24, height: 24, marginRight: 10 },
  kakaoVerifyButtonText: { color: '#191919', fontWeight: 'bold', fontSize: 16 },
  verifiedBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#1F2937', borderRadius: 8, borderWidth: 1, borderColor: '#34D399', width: '100%', marginBottom: 10 },
  verifiedText: { color: '#34D399', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },

  quizQuestion: { fontSize: 16, color: 'white', width: '100%', marginBottom: 16, fontWeight: '500' },
  quizOption: { backgroundColor: '#374151', borderRadius: 8, padding: 16, width: '100%', marginBottom: 12 },
  quizOptionSelected: { backgroundColor: '#34D399', borderColor: '#34D399' },
  quizText: { fontSize: 16, color: 'white' },
  quizTextSelected: { color: '#111827', fontWeight: 'bold' },
});