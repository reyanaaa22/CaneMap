/**
 * Android Download Utility for WebView/Capacitor
 * Handles file downloads in Android app environment
 */

/**
 * Detect if running in Android app (WebView/Capacitor)
 */
export function isAndroidApp() {
  return /Android/i.test(navigator.userAgent) && 
         (window.Capacitor !== undefined || 
          window.cordova !== undefined || 
          window.Android !== undefined ||
          navigator.userAgent.includes('wv'));
}

/**
 * Android-compatible file download
 * Works in both browser and Android WebView
 * @param {Blob} blob - File blob to download
 * @param {string} filename - Filename for download
 * @returns {Promise<void>}
 */
export async function downloadFile(blob, filename) {
  console.log('📥 Starting download:', filename, 'Size:', blob.size, 'bytes');
  
  // Check if running in Android app
  if (isAndroidApp()) {
    console.log('📱 Detected Android app environment');
    try {
      // Method 1: Use Android JavaScript interface (most reliable)
      if (window.AndroidDownload && typeof window.AndroidDownload.downloadFile === 'function') {
        console.log('📥 Using AndroidDownload interface');
        const base64 = await blobToBase64(blob);
        try {
          window.AndroidDownload.downloadFile(base64, filename, blob.type || 'application/octet-stream');
          console.log('✅ File download triggered via AndroidDownload interface');
          return;
        } catch (error) {
          console.warn('❌ AndroidDownload interface failed:', error);
        }
      } else {
        console.log('⚠️ AndroidDownload interface not available');
      }
      
      // Method 2: Try Capacitor Filesystem API
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        const { Filesystem } = window.Capacitor.Plugins;
        const base64 = await blobToBase64(blob);
        
        // Try External Storage (Downloads) first, fallback to Documents
        try {
          // For Android, try to write to external storage Downloads
          const result = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Filesystem.Directory.ExternalStorage,
            recursive: true
          });
          console.log('✅ File saved via Capacitor (ExternalStorage):', result.uri);
          return;
        } catch (externalError) {
          try {
            // Fallback to Documents
            const result = await Filesystem.writeFile({
              path: filename,
              data: base64,
              directory: Filesystem.Directory.Documents,
              recursive: true
            });
            console.log('✅ File saved via Capacitor (Documents):', result.uri);
            return;
          } catch (fsError) {
            console.warn('Filesystem write failed, trying alternative:', fsError);
          }
        }
      }

      // Method 3: Try Cordova File plugin
      if (window.cordova && window.cordova.file) {
        const base64 = await blobToBase64(blob);
        window.resolveLocalFileSystemURL(
          cordova.file.externalRootDirectory + 'Download/',
          function(dirEntry) {
            dirEntry.getFile(filename, { create: true, exclusive: false }, function(fileEntry) {
              fileEntry.createWriter(function(fileWriter) {
                fileWriter.onwriteend = function() {
                  console.log('✅ File saved via Cordova:', fileEntry.fullPath);
                };
                fileWriter.write(base64);
              });
            });
          }
        );
        return;
      }
      
      // Method 4: Try Android interface (legacy)
      if (window.Android && window.Android.downloadFile) {
        const base64 = await blobToBase64(blob);
        window.Android.downloadFile(base64, filename, blob.type);
        console.log('✅ File download triggered via Android interface (legacy)');
        return;
      }
    } catch (error) {
      console.warn('❌ Android-specific download failed, falling back to standard method:', error);
    }
  }

  // Fallback: Standard browser download
  console.log('🌐 Using browser fallback download method');
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    console.log('✅ Browser download triggered');
  } catch (error) {
    console.error('❌ Browser download failed:', error);
    throw error;
  }
}

/**
 * Convert Blob to Base64
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:type;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Download file from URL (for Firebase Storage URLs)
 * @param {string} url - File URL
 * @param {string} filename - Filename for download
 * @returns {Promise<void>}
 */
export async function downloadFileFromURL(url, filename) {
  try {
    // Fetch the file
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('Failed to fetch file');
    
    const blob = await response.blob();
    await downloadFile(blob, filename);
  } catch (error) {
    console.error('Error downloading file from URL:', error);
    throw error;
  }
}

