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

  // Проверка наличия host-permission для WebDAV-origin.
  // chrome.permissions недоступен в content-скрипте, поэтому проверку делает background.
  if (message.type === 'WEBDAV_CHECK_PERMISSION') {
    const origin = message.origin;
    if (!origin || !chrome.permissions) {
      sendResponse({ success: true, granted: true });
      return true;
    }
    chrome.permissions.contains({ origins: [origin] }, (granted) => {
      sendResponse({ success: true, granted: !!granted });
    });
    return true;
  }

  // Открытие окна выдачи доступа к произвольному WebDAV-серверу.
  // chrome.permissions.request требует контекст страницы расширения + user gesture,
  // поэтому из content-скрипта открываем permissions.html (там есть кнопка-запрос).
  // Компактное popup-окно вместо вкладки; оно само закрывается после выдачи прав.
  if (message.type === 'OPEN_WEBDAV_PERMISSION_PAGE') {
    const params = new URLSearchParams();
    if (message.origin) params.set('origin', message.origin);
    if (message.lang) params.set('lang', message.lang);
    const url = chrome.runtime.getURL('permissions.html') + '?' + params.toString();
    if (chrome.windows && chrome.windows.create) {
      chrome.windows.create({ url, type: 'popup', width: 480, height: 360 }, () => {
        sendResponse({ success: true });
      });
    } else {
      // Фолбэк (напр. некоторые сборки Firefox без windows.create) — обычная вкладка.
      chrome.tabs.create({ url }, () => {
        sendResponse({ success: true });
      });
    }
    return true;
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
