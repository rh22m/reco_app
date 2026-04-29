import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

// 2세대(v2) 함수 선언 방식 (지역과 문서 경로를 객체로 전달)
export const analyzeBadmintonPremium = onDocumentCreated(
  {
    document: "analysis_requests/{docId}",
    region: "asia-northeast3" // 서울 리전
  },
  async (event) => {
    // 1. 이벤트 데이터 확인 (타입 에러 방지)
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    if (!data || data.status !== "pending") return;

    try {
      // 분석 중 상태로 변경
      await snap.ref.update({ status: "processing" });

      // 2. Storage에서 좌표 데이터 읽기
      const bucket = admin.storage().bucket();
      const [file] = await bucket.file(data.dataPath).download();
      const frames = JSON.parse(file.toString());

      // 3. 고도 분석 로직 (스플릿 스텝 및 이동 거리)
      let splitSteps = 0;
      let moveDistance = 0;

      for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1].landmarks;
        const curr = frames[i].landmarks;

        // 발목(27, 28) 좌표가 동시에 급격히 위로 이동하면 점프로 간주
        if (prev[27].y - curr[27].y > 0.06 && prev[28].y - curr[28].y > 0.06) {
          splitSteps++;
        }

        // 골반 중앙 이동 거리 누적
        const dx = (curr[23].x + curr[24].x)/2 - (prev[23].x + prev[24].x)/2;
        const dy = (curr[23].y + curr[24].y)/2 - (prev[23].y + prev[24].y)/2;
        moveDistance += Math.sqrt(dx*dx + dy*dy);
      }

      // 4. 결과 업데이트
      await snap.ref.update({
        status: "completed",
        report: {
          splitStepCount: splitSteps,
          coverage: parseFloat(moveDistance.toFixed(2)),
          score: Math.min(100, 60 + splitSteps * 10),
          feedback: splitSteps > 2 ? "훌륭한 보폭과 스텝입니다!" : "상대 타구 시 조금 더 민첩한 점프가 필요합니다."
        }
      });
    } catch (e) {
      console.error("분석 중 에러 발생:", e);
      await snap.ref.update({ status: "failed" });
    }
  }
);