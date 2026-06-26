// page_script.js — работает в main world страницы Boosty
// 1. Перехватывает fetch и XMLHttpRequest запросы к /reaction для синхронизации лайков
//    в одну сторону: реальный клик пользователя по реакции на посте → чекбокс расширения.
//    Расширение САМО лайки больше не ставит — лайкать можно только на самом посте Boosty.
// 2. Принудительное качество VK-плеера через перехват localStorage.
(function () {
  'use strict';

  // Внутренний build-маркер. Бампается при КАЖДОМ изменении кода расширения —
  // чтобы можно было проверить в DevTools, что загружена свежая версия:
  //   в консоли страницы Boosty набери  __LF_BUILD
  // Должен совпадать со значением в src/utils.js (LF_INTERNAL_BUILD).
  const LF_INTERNAL_BUILD = '2026-06-27.10';
  try { window.__LF_BUILD = LF_INTERNAL_BUILD; } catch (e) {}

  const LF_MSG_TYPE = 'LF_REACTION_INTERCEPTED';

  // --- Перехват fetch ---
  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      const method = (init && init.method) || (input instanceof Request ? input.method : 'GET');
      const upperMethod = method.toUpperCase();

      if ((upperMethod === 'POST' || upperMethod === 'DELETE') && url.includes('/reaction')) {
        const match = url.match(/\/post\/([a-f0-9-]+)\/reaction/i);
        if (match) {
          const postId = match[1];
          const isLiked = upperMethod === 'POST';

          // Реальный клик пользователя по реакции на странице → сообщаем content.js.
          const fetchPromise = originalFetch.apply(this, arguments);
          fetchPromise.then(response => {
            if (response.ok) {
              console.log(`[BoostyBookmark page_script] Перехвачен fetch ${upperMethod} /reaction для поста ${postId}`);
              window.postMessage({ type: LF_MSG_TYPE, postId, isLiked }, '*');
            }
          }).catch(() => {});
          return fetchPromise;
        }
      }
    } catch (e) {}

    return originalFetch.apply(this, arguments);
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
              console.log(`[BoostyBookmark page_script] Перехвачен XHR ${method} /reaction для поста ${postId}`);
              window.postMessage({ type: LF_MSG_TYPE, postId, isLiked }, '*');
            }
          });
        }
      }
    } catch (e) {}

    return originalXHRSend.apply(this, arguments);
  };

  // =====================================================================
  // ПРИНУДИТЕЛЬНОЕ КАЧЕСТВО VK-ПЛЕЕРА
  // =====================================================================
  // Кнопку настроек VK-плеера нельзя открыть программно (нужен trusted-клик),
  // поэтому качество выставляется не кликами по меню, а через localStorage-ключ
  // `vk_player_preferred_quality`, который плеер сам читает при инициализации.
  // Ключ привязан к videoId конкретного видео; плеер сверяет pref.videoId со своим
  // и стирает запись при несовпадении. videoId доступен из store плеера ровно в
  // момент чтения ключа, поэтому мы перехватываем getItem и подставляем актуальный
  // videoId + желаемое качество на лету. Настройка приходит из content.js.

  const VK_QUALITY_KEY = 'vk_player_preferred_quality';
  let qualityPref = { enabled: false, value: 'auto' };

  // Возвращает videoId плеера, инициализирующегося в момент чтения ключа.
  // store.videoId — публичное свойство Svelte-компонента vk-video-player (main world).
  function getActiveVkVideoId() {
    const players = document.querySelectorAll('vk-video-player');
    for (const p of players) {
      try {
        const vid = (p.store && p.store.videoId) ||
          (p.videoConfig && p.videoConfig.videos && p.videoConfig.videos[0] && p.videoConfig.videos[0].unitedVideoId);
        if (vid) return String(vid);
      } catch (e) {}
    }
    return null;
  }

  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    if (key === VK_QUALITY_KEY && qualityPref.enabled && qualityPref.value && qualityPref.value !== 'auto') {
      try {
        const videoId = getActiveVkVideoId();
        if (videoId) {
          return JSON.stringify({ videoId, value: qualityPref.value });
        }
      } catch (e) {}
    }
    return originalGetItem.apply(this, arguments);
  };

  // --- Слушатель сообщений от content.js ---
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === 'LF_SET_QUALITY_PREF') {
      qualityPref = {
        enabled: !!event.data.enabled,
        value: event.data.value || 'auto'
      };
      return;
    }
  });

  console.log(`[BoostyBookmark page_script] Загружен в main world (build ${LF_INTERNAL_BUILD}) — перехват fetch/XHR (лайк→галочка) + качество VK активны`);
})();
