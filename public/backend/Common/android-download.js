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
  // Check if running in Android app
  if (isAndroidApp()) {
    try {
      // Method 1: Try Capacitor Filesystem API
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        const { Filesystem } = window.Capacitor.Plugins;
        const base64 = await blobToBase64(blob);
        const result = await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Filesystem.Directory.Documents,
          recursive: true
        });
        console.log('✅ File saved via Capacitor:', result.uri);
        return;
      }

      // Method 2: Try Cordova File plugin
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

      // Method 3: Use Android WebView download handler
      if (window.Android && window.Android.downloadFile) {
        const base64 = await blobToBase64(blob);
        window.Android.downloadFile(base64, filename, blob.type);
        console.log('✅ File download triggered via Android interface');
        return;
      }
    } catch (error) {
      console.warn('Android-specific download failed, falling back to standard method:', error);
    }
  }

  // Fallback: Standard browser download
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

