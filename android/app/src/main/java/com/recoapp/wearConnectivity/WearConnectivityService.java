package com.rally_app.wearConnectivity;

import android.content.Intent;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
import androidx.annotation.Nullable;

public class WearConnectivityService extends HeadlessJsTaskService {
    @Override
    protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
        return new HeadlessJsTaskConfig(
                "WearConnectivity", // 이 이름은 나중에 JS 코드와 맞춰야 합니다.
                Arguments.fromBundle(intent.getExtras()),
                5000, // 타임아웃 (5초)
                true // 포그라운드에서도 허용
        );
    }
}