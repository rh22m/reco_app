import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';

// onLogin이 비동기 결과를 반환할 수 있도록 Promise 타입 추가 (기존과 동일)
interface LoginScreenProps {
  onGoToSignUp: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onGoToSignUp, onLogin }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);

  // 에러 메시지 상태 관리 (입력창이 통합되었으므로 하나의 에러 상태로 관리)
  const [loginError, setLoginError] = useState('');

  const handleKakaoLogin = async () => {
    // 1. 초기화
    setLoginError('');
    setIsLoading(true);

    try {
      // 2. 카카오 로그인 및 프로필 가져오기
      await login();
      const profile = await getProfile();

      // 3. 카카오 이메일 제공 동의 확인
      if (!profile.email) {
        Alert.alert(
          '이메일 동의 필요',
          '로그인을 위해 카카오 이메일 정보가 필수입니다. 카카오 연동 해제 후 다시 시도하여 이메일 제공에 동의해주세요.'
        );
        setIsLoading(false);
        return;
      }

      // 4. SignUpScreen과 동일하게 이메일과 카카오 ID를 로그인 정보로 사용
      const email = profile.email;
      const password = profile.id.toString();

      // 5. 로그인 시도
      await onLogin(email, password);
      // 로그인 성공 시 App.tsx에서 화면 전환 처리됨

    } catch (error: any) {
      console.log('Login Error:', error);

      // 카카오 로그인 취소 시 예외 처리
      if (error.message === 'Logged out' || error.code === 'E_CANCELLED_OPERATION') {
        setIsLoading(false);
        return;
      }

      // 파이어베이스 에러 코드를 사용자 친화적 메시지로 변환
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-email':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          setLoginError('가입되지 않은 계정이거나 로그인 정보가 일치하지 않습니다.');
          break;
        case 'auth/too-many-requests':
          setLoginError('접속 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
          break;
        default:
          setLoginError('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* 1. 로고 */}
        <Image
          source={require('../../assets/images/reco-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>RECO</Text>
        <Text style={styles.subtitle}>카카오 계정으로 간편하게 로그인하세요!</Text>

        {/* 2. 카카오 로그인 버튼 (기존 로그인 버튼 스타일 + 카카오 컬러 적용) */}
        <TouchableOpacity
            style={[styles.kakaoButton, isLoading && styles.buttonDisabled]}
            onPress={handleKakaoLogin}
            disabled={isLoading}
        >
          <Image
            source={{ uri: 'https://developers.kakao.com/assets/img/lib/logos/kakaolink/kakaolink_btn_medium.png' }}
            style={styles.kakaoIcon}
          />
          <Text style={styles.kakaoButtonText}>
            {isLoading ? '로그인 중...' : '카카오 계정으로 로그인'}
          </Text>
        </TouchableOpacity>

        {/* 3. 에러 메시지 (작은 빨간 글씨) */}
        <View style={styles.errorContainer}>
          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
        </View>

        {/* 4. 회원가입 링크 */}
        <View style={styles.footerLink}>
          <Text style={styles.linkText}>계정이 없으신가요? </Text>
          <TouchableOpacity onPress={onGoToSignUp}>
            <Text style={styles.linkTextHighlight}>회원가입</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 40,
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 0, // 에러 메시지 공간을 위해 마진 0
  },
  kakaoIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  errorContainer: {
    width: '100%',
    minHeight: 20, // 에러 메시지 높이 확보
    marginBottom: 24, // 다음 UI(푸터 링크)와의 간격
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444', // 빨간색
    fontSize: 14,
    marginTop: 8,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  linkTextHighlight: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});