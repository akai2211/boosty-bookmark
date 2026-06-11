// page_script.js — работает в main world страницы Boosty
// Перехватывает fetch и XMLHttpRequest запросы к /reaction для мгновенной синхронизации лайков
(function () {
  'use strict';

  const LF_MSG_TYPE = 'LF_REACTION_INTERCEPTED';

  // --- Перехват fetch ---
  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    const fetchPromise = originalFetch.apply(this, arguments);

    try {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      const method = (init && init.method) || (input instanceof Request ? input.method : 'GET');

      const upperMethod = method.toUpperCase();
      if ((upperMethod === 'POST' || upperMethod === 'DELETE') && url.includes('/reaction')) {
        const match = url.match(/\/post\/([a-f0-9-]+)\/reaction/i);
        if (match) {
          const postId = match[1];
          const isLiked = upperMethod === 'POST';

          fetchPromise.then(response => {
            if (response.ok) {
              console.log(`[LightFox page_script] Перехвачен fetch ${upperMethod} /reaction для поста ${postId}`);
              window.postMessage({ type: LF_MSG_TYPE, postId, isLiked }, '*');
            }
          }).catch(() => {});
        }
      }
    } catch (e) {}

    return fetchPromise;
  };

  // --- Перехват XMLHttpRequest ---
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._lfMethod = method;
    this._lfUrl = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    try {
      const method = (this._lfMethod || '').toUpperCase();
      const url = this._lfUrl || '';

      if ((method === 'POST' || method === 'DELETE') && url.includes('/reaction')) {
        const match = url.match(/\/post\/([a-f0-9-]+)\/reaction/i);
        if (match) {
          const postId = match[1];
          const isLiked = method === 'POST';

          this.addEventListener('load', function () {
            if (this.status >= 200 && this.status < 300) {
              console.log(`[LightFox page_script] Перехвачен XHR ${method} /reaction для поста ${postId}`);
              window.postMessage({ type: LF_MSG_TYPE, postId, isLiked }, '*');
            }
          });
        }
      }
    } catch (e) {}

    return originalXHRSend.apply(this, arguments);
  };

  console.log('[LightFox page_script] Загружен в main world — перехват fetch и XHR активен');
})();
