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

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
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
            
            // Add JavaScript interface for downloads
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
                        }
                    });
                }
            }, "AndroidDownload");
        }
        
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
