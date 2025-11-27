package com.canemap.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}

import android.Manifest;
import android.os.Build;

@Override
public void onStart() {
    super.onStart();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        requestPermissions(new String[]{
                Manifest.permission.CAMERA
        }, 1001);
    }
}

import android.webkit.WebChromeClient;

@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    this.bridge.getWebView().setWebChromeClient(new WebChromeClient(){
        @Override
        public void onPermissionRequest(final android.webkit.PermissionRequest request) {
            runOnUiThread(() -> request.grant(request.getResources()));
        }
    });
}
