package com.rally_app.wearConnectivity; // 패키지 이름이 정확해야 합니다.

import android.content.Intent;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import com.facebook.react.HeadlessJsTaskService;

public class WearListenerService extends WearableListenerService {

    private static final String SERVICE_NAME = "WearConnectivity";

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        // 워치에서 메시지를 받으면 이 부분이 실행됩니다.
        Intent serviceIntent = new Intent(this, WearConnectivityService.class);
        serviceIntent.putExtra("path", messageEvent.getPath());

        // 데이터가 있다면 함께 보냅니다.
        if (messageEvent.getData() != null) {
            serviceIntent.putExtra("data", messageEvent.getData());
        }

        // React Native가 백그라운드에서도 처리할 수 있도록 Headless Task를 시작합니다.
        this.startService(serviceIntent);
        HeadlessJsTaskService.acquireWakeLockNow(this);
    }
}