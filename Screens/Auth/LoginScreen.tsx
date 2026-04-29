import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Mail, Lock } from 'lucide-react-native';

// [수정] onLogin이 비동기 결과를 반환할 수 있도록 Promise 타입 추가
interface LoginScreenProps {
  onGoToSignUp: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onGoToSignUp, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // [추가] 에러 메시지 상태 관리
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleLoginPress = async () => {
    // 1. 초기화
    setEmailError('');
    setPasswordError('');
    let hasError = false;

    // 2. 입력값 유효성 검사 (빈 값 체크)
    if (!email.trim()) {
      setEmailError('이메일을 입력해주세요.');
      hasError = true;
    }
    if (!password.trim()) {
      setPasswordError('비밀번호를 입력해주세요.');
      hasError = true;
    }

    if (hasError) return;

    // 3. 로그인 시도 및 에러 처리
    setIsLoading(true);
    try {
      await onLogin(email, password);
      // 로그인 성공 시 App.tsx에서 화면 전환 처리됨
    } catch (error: any) {
      console.log('Login Error:', error.code);
      // 파이어베이스 에러 코드를 사용자 친화적 메시지로 변환
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-email':
        case 'auth/invalid-credential': // 최신 파이어베이스 보안 강화로 통합된 경우 있음
          setEmailError('일치하는 계정이 없습니다.');
          break;
        case 'auth/wrong-password':
          setPasswordError('비밀번호가 일치하지 않습니다.');
          break;
        case 'auth/too-many-requests':
          setPasswordError('접속 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
          break;
        default:
          // 그 외 에러는 비밀번호 쪽에 띄우거나, 이메일/비밀번호 둘 다 불확실할 때 표시
          if (error.message.includes('password')) {
             setPasswordError('비밀번호를 확인해주세요.');
          } else {
             setEmailError('로그인 정보를 다시 확인해주세요.');
          }
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
        <Text style={styles.subtitle}>로그인하여 랠리를 시작하세요!</Text>

        {/* 2. 이메일 입력 폼 */}
        <View style={[styles.inputContainer, emailError ? styles.inputErrorBorder : null]}>
          <Mail color={emailError ? "#EF4444" : "#9CA3AF"} size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#6B7280"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(''); // 타이핑 시작하면 에러 지움
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        {/* 이메일 에러 메시지 (작은 빨간 글씨) */}
        <View style={styles.errorContainer}>
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        </View>

        {/* 3. 비밀번호 입력 폼 */}
        <View style={[styles.inputContainer, passwordError ? styles.inputErrorBorder : null]}>
          <Lock color={passwordError ? "#EF4444" : "#9CA3AF"} size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#6B7280"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(''); // 타이핑 시작하면 에러 지움
            }}
            secureTextEntry
          />
        </View>
        {/* 비밀번호 에러 메시지 (작은 빨간 글씨) */}
        <View style={styles.errorContainer}>
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        </View>

        {/* 4. 로그인 버튼 */}
        <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLoginPress}
            disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '로그인 중...' : '로그인'}
          </Text>
        </TouchableOpacity>

        {/* 5. 회원가입 링크 */}
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    width: '100%',
    marginBottom: 0, // 에러 메시지 공간을 위해 마진 제거 (errorContainer가 담당)
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: 'transparent', // 기본 테두리 투명
  },
  inputErrorBorder: {
    borderColor: '#EF4444', // 에러 발생 시 빨간 테두리
  },
  errorContainer: {
    width: '100%',
    minHeight: 20, // 에러 메시지 높이 확보
    marginBottom: 12, // 다음 입력창과의 간격
    justifyContent: 'center',
    paddingLeft: 4,
  },
  errorText: {
    color: '#EF4444', // 빨간색
    fontSize: 12,
    marginTop: 4,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    height: '100%',
  },
  button: {
    backgroundColor: '#34D399',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#059669',
    opacity: 0.7,
  },
  buttonText: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
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