package com.canemap.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.DownloadListener;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import android.util.Base64;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    
    private static final int PERMISSION_REQUEST_CODE = 1001;
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
        // Request all necessary permissions
        requestAllPermissions();
        
        // Configure WebView after it's fully initialized
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            // Ensure JavaScript is enabled for interfaces
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            
            // Handle downloads from WebView
            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
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
            
            // Add JavaScript interface for downloads and permissions
            webView.addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void downloadFile(String base64Data, String filename, String mimeType) {
                    runOnUiThread(() -> {
                        if (checkStoragePermission()) {
                            try {
                                byte[] fileData = Base64.decode(base64Data, Base64.DEFAULT);
                                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                                
                                if (!downloadsDir.exists()) {
                                    downloadsDir.mkdirs();
                                }
                                
                                File file = new File(downloadsDir, filename);
                                FileOutputStream fos = new FileOutputStream(file);
                                fos.write(fileData);
                                fos.flush();
                                fos.close();
                                
                                android.media.MediaScannerConnection.scanFile(
                                    MainActivity.this,
                                    new String[]{file.getAbsolutePath()},
                                    new String[]{mimeType != null ? mimeType : "application/octet-stream"},
                                    null
                                );
                            } catch (Exception e) {
                                android.util.Log.e("Download", "Error saving file: " + e.getMessage());
                            }
                        } else {
                            // Request permission if not granted
                            requestAllPermissions();
                        }
                    });
                }
                
                @android.webkit.JavascriptInterface
                public boolean hasStoragePermission() {
                    return checkStoragePermission();
                }
                
                @android.webkit.JavascriptInterface
                public boolean hasCameraPermission() {
                    return checkCameraPermission();
                }
                
                @android.webkit.JavascriptInterface
                public void requestCameraPermission() {
                    runOnUiThread(() -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            if (!checkCameraPermission()) {
                                ActivityCompat.requestPermissions(MainActivity.this,
                                    new String[]{Manifest.permission.CAMERA},
                                    PERMISSION_REQUEST_CODE);
                            }
                        }
                    });
                }
            }, "AndroidDownload");
        }
    }
    
    /**
     * Request all necessary permissions based on Android version
     */
    private void requestAllPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> permissionsToRequest = new ArrayList<>();
            
            // Camera permission (always needed)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) 
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.CAMERA);
            }
            
            // Storage permissions based on Android version
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ (API 33+): Use granular media permissions
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.READ_MEDIA_IMAGES);
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.READ_MEDIA_VIDEO);
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.READ_MEDIA_AUDIO);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10-12 (API 29-32): Scoped storage, no WRITE_EXTERNAL_STORAGE needed for Downloads
                // But we still request READ_EXTERNAL_STORAGE for compatibility
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                }
            } else {
                // Android 9 and below (API < 29): Need both read and write
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) 
                        != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
            }
            
            // Request permissions if any are missing
            if (!permissionsToRequest.isEmpty()) {
                ActivityCompat.requestPermissions(this, 
                    permissionsToRequest.toArray(new String[0]), 
                    PERMISSION_REQUEST_CODE);
            }
        }
    }
    
    /**
     * Handle permission request results
     */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    android.util.Log.d("Permission", "Granted: " + permissions[i]);
                } else {
                    android.util.Log.w("Permission", "Denied: " + permissions[i]);
                }
            }
        }
    }
    
    /**
     * Check if storage permission is granted (handles all Android versions)
     */
    private boolean checkStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+: Check media permissions
            return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) 
                    == PackageManager.PERMISSION_GRANTED;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10-12: Downloads folder is accessible without permission
            // But we check READ_EXTERNAL_STORAGE for compatibility
            return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) 
                    == PackageManager.PERMISSION_GRANTED || 
                   Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q; // Always true for Android 10+
        } else {
            // Android 9 and below: Need WRITE_EXTERNAL_STORAGE
            return ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) 
                    == PackageManager.PERMISSION_GRANTED;
        }
    }
    
    /**
     * Check if camera permission is granted
     */
    public boolean checkCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) 
                == PackageManager.PERMISSION_GRANTED;
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
