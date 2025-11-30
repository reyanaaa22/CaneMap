package com.canemap.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.DownloadListener;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import android.util.Base64;

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
            
            // Set WebChromeClient for permissions
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
            
            // Set WebViewClient with download handler
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                    return false;
                }
            });
            
            // Handle downloads from WebView
            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                    // Use DownloadManager for downloads
                    if (checkStoragePermission()) {
                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                        request.setMimeType(mimetype);
                        request.addRequestHeader("User-Agent", userAgent);
                        request.setDescription("Downloading file...");
                        request.setTitle("CaneMap Download");
                        request.allowScanningByMediaScanner();
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, getFileNameFromUrl(url, contentDisposition));
                        
                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        dm.enqueue(request);
                    }
                }
            });
            
            // Add JavaScript interface for downloads
            webView.addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void downloadFile(String base64Data, String filename, String mimeType) {
                    runOnUiThread(() -> {
                        if (checkStoragePermission()) {
                            try {
                                byte[] fileData = Base64.decode(base64Data, Base64.DEFAULT);
                                
                                // For Android 10+ (API 29+), use scoped storage
                                File downloadsDir;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    // Android 10+ uses scoped storage - Downloads folder is accessible
                                    downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                                } else {
                                    // Android 9 and below
                                    downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                                }
                                
                                if (!downloadsDir.exists()) {
                                    downloadsDir.mkdirs();
                                }
                                
                                File file = new File(downloadsDir, filename);
                                FileOutputStream fos = new FileOutputStream(file);
                                fos.write(fileData);
                                fos.flush();
                                fos.close();
                                
                                // Notify media scanner so file appears in Downloads app
                                android.media.MediaScannerConnection.scanFile(
                                    MainActivity.this,
                                    new String[]{file.getAbsolutePath()},
                                    new String[]{mimeType != null ? mimeType : "application/octet-stream"},
                                    null
                                );
                                
                                android.util.Log.d("Download", "File saved successfully: " + file.getAbsolutePath());
                            } catch (IOException e) {
                                android.util.Log.e("Download", "Error saving file: " + e.getMessage());
                                e.printStackTrace();
                            } catch (Exception e) {
                                android.util.Log.e("Download", "Unexpected error: " + e.getMessage());
                                e.printStackTrace();
                            }
                        } else {
                            android.util.Log.w("Download", "Storage permission not granted");
                        }
                    });
                }
                
                @android.webkit.JavascriptInterface
                public void clearCache() {
                    runOnUiThread(() -> {
                        webView.clearCache(true);
                        webView.reload();
                    });
                }
            }, "AndroidDownload");
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
    
    private boolean checkStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) 
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, 
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1002);
                return false;
            }
        }
        return true;
    }
    
    private String getFileNameFromUrl(String url, String contentDisposition) {
        String filename = "download";
        
        // Try to get filename from content disposition
        if (contentDisposition != null && contentDisposition.contains("filename=")) {
            int index = contentDisposition.indexOf("filename=");
            filename = contentDisposition.substring(index + 9);
            if (filename.startsWith("\"") && filename.endsWith("\"")) {
                filename = filename.substring(1, filename.length() - 1);
            }
        } else if (url != null) {
            // Extract from URL
            int lastSlash = url.lastIndexOf('/');
            if (lastSlash >= 0 && lastSlash < url.length() - 1) {
                filename = url.substring(lastSlash + 1);
                int queryIndex = filename.indexOf('?');
                if (queryIndex > 0) {
                    filename = filename.substring(0, queryIndex);
                }
            }
        }
        
        return filename;
    }
}
