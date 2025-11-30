package com.canemap.app;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Configure WebView for better caching control
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Clear cache on app start to ensure fresh content
            webView.clearCache(true);
            webView.clearHistory();
            
            // Enable cache but with proper control
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            // Note: setAppCacheEnabled() is deprecated and removed in newer Android versions
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            
            // Force reload on navigation to prevent stale content
            settings.setJavaScriptEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            
            // Set WebChromeClient for permissions and downloads
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
            
            // Add JavaScript interface to clear cache from web
            webView.addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void clearCache() {
                    runOnUiThread(() -> {
                        webView.clearCache(true);
                        webView.reload();
                    });
                }
            }, "AndroidCache");
        }
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.READ_EXTERNAL_STORAGE
            }, 1001);
        }
    }
}
