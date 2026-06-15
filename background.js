/**
 * Background Service Worker для Boosty Bookmark.
 * Проксирует WebDAV-запросы к Яндекс.Диску и другим серверам в обход CORS и CSP.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    const { url, method, headers, bodyArray } = message;

    const fetchOptions = {
      method,
      headers
    };

    if (bodyArray && Array.isArray(bodyArray)) {
      fetchOptions.body = new Uint8Array(bodyArray);
    }

    fetch(url, fetchOptions)
      .then(async (response) => {
        const ok = response.ok;
        const status = response.status;

        let responseBodyArray = null;
        if (ok && method === 'GET') {
          const ab = await response.arrayBuffer();
          responseBodyArray = Array.from(new Uint8Array(ab));
        }

        sendResponse({
          success: true,
          ok,
          status,
          bodyArray: responseBodyArray
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
