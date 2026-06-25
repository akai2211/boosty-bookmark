/**
 * Background Service Worker для Boosty Bookmark.
 * Проксирует WebDAV-запросы к Яндекс.Диску и другим серверам в обход CORS и CSP.
 */

// Бинарные данные <-> base64 для передачи тела WebDAV через sendMessage (см. utils.js).
// Дублируется здесь, т.к. service worker не модуль и не может импортировать из src/.
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RELOAD_EXTENSION') {
    sendResponse({ success: true });
    setTimeout(() => {
      chrome.runtime.reload();
    }, 50);
    return true;
  }

  if (message.action === 'updateBadge') {
    const action = chrome.action || chrome.browserAction;
    if (action) {
      action.setBadgeText({ text: message.text || '' });
      action.setBadgeBackgroundColor({ color: '#ff5c12' });
    }
    sendResponse({ success: true });
    return;
  }

  if (message.type === 'WEBDAV_REQUEST') {
    const { url, method, headers, bodyBase64 } = message;

    const fetchOptions = {
      method,
      headers
    };

    if (bodyBase64) {
      fetchOptions.body = base64ToUint8Array(bodyBase64);
    }

    fetch(url, fetchOptions)
      .then(async (response) => {
        const ok = response.ok;
        const status = response.status;
        const etag = response.headers.get('etag') || null;

        let responseBodyBase64 = null;
        if (ok && method === 'GET') {
          const ab = await response.arrayBuffer();
          responseBodyBase64 = arrayBufferToBase64(ab);
        }

        sendResponse({
          success: true,
          ok,
          status,
          etag,
          bodyBase64: responseBodyBase64
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message || 'Ошибка сети'
        });
      });

    return true; // Важно для асинхронного sendResponse
  }
});
