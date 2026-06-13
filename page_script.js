// page_script.js — работает в main world страницы Boosty
// 1. Перехватывает fetch и XMLHttpRequest запросы к /reaction для мгновенной синхронизации лайков
// 2. Обрабатывает программные клики по кнопке реакции для обратной синхронизации (расширение → Boosty DOM)
(function () {
  'use strict';

  const LF_MSG_TYPE = 'LF_REACTION_INTERCEPTED';

  // Множество ID постов, для которых мы в данный момент симулируем клик
  const simulatedPosts = new Set();

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

          // Если мы сами программно кликаем по этому посту, блокируем реальный React-запрос
          // Это предотвращает дублирование (content.js уже отправил API-запрос) и откат UI из-за 404
          if (simulatedPosts.has(postId)) {
            console.log(`[BoostyBookmark page_script] Блокируем дублирующий React-запрос ${upperMethod} для поста ${postId}`);
            return Promise.resolve(new Response('{}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          }

          // Иначе это реальный клик пользователя
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

          // Если мы сами программно кликаем по этому посту, блокируем реальный XHR-запрос
          if (simulatedPosts.has(postId)) {
            console.log(`[BoostyBookmark page_script] Блокируем дублирующий React-XHR ${method} для поста ${postId}`);
            Object.defineProperty(this, 'readyState', { value: 4, writable: false });
            Object.defineProperty(this, 'status', { value: 200, writable: false });
            Object.defineProperty(this, 'statusText', { value: 'OK', writable: false });
            Object.defineProperty(this, 'responseText', { value: '{}', writable: false });
            
            setTimeout(() => {
              if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
              if (typeof this.onload === 'function') this.onload();
              this.dispatchEvent(new Event('readystatechange'));
              this.dispatchEvent(new Event('load'));
            }, 10);
            return; // Не отправляем оригинальный запрос!
          }

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
  // ОБРАТНАЯ СИНХРОНИЗАЦИЯ: программный клик по реакции Boosty из расширения
  // =====================================================================

  /**
   * Находит кнопку реакции для поста по postId.
   * Ищет ссылку на пост в DOM (вне sidebar расширения), поднимается к контейнеру
   * и находит кнопку [data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"].
   */
  function findReactionButton(postId) {
    const sidebar = document.getElementById('lf-sidebar');
    const allLinks = document.querySelectorAll(`a[href*="${postId}" i]`);

    for (const link of allLinks) {
      if (sidebar && sidebar.contains(link)) continue;

      let current = link;
      let maxDepth = 20;
      while (current && current !== document.body && maxDepth > 0) {
        current = current.parentElement;
        maxDepth--;
        const btn = current.querySelector('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
        if (btn) return btn;
      }
    }
    return null;
  }

  /**
   * Ожидание появления popover с выбором реакций.
   */
  function waitForReactionPopover(timeout) {
    return new Promise((resolve) => {
      const check = () => {
        const imgs = document.querySelectorAll('img[src*="heart"]');
        for (const img of imgs) {
          const inButton = img.closest('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
          if (!inButton) {
            const container = img.closest('[role="tooltip"], [class*="TooltipContent"], [class*="ReactionSelector"], [class*="Menu"]');
            if (container) return container;
            const parent = img.parentElement && img.parentElement.parentElement;
            if (parent && parent.querySelectorAll('img').length >= 3) return parent;
          }
        }
        return null;
      };

      const found = check();
      if (found) { resolve(found); return; }

      const observer = new MutationObserver(() => {
        const el = check();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(check());
      }, timeout);
    });
  }

  /**
   * Обновляет визуальное состояние лайка через нативный React-клик.
   * На Boosty постановка и снятие лайка делается одинаково: клик по кнопке, затем клик по сердечку.
   */
  async function simulateReaction(postId, shouldLike) {
    try {
      const reactionBtn = findReactionButton(postId);
      if (!reactionBtn) {
        console.log(`[BoostyBookmark page_script] Пост ${postId} не найден на странице`);
        return;
      }

      // Устанавливаем флаг, что мы программно кликаем. Это заблокирует нативный сетевой запрос React,
      // чтобы избежать конфликтов с нашими собственными запросами из content.js.
      simulatedPosts.add(postId);

      // Кликаем по главной кнопке реакции (открывает popover)
      reactionBtn.click();

      // Ждем popover (как для постановки, так и для снятия лайка)
      const popover = await waitForReactionPopover(1500);
      if (!popover) {
        console.warn(`[BoostyBookmark page_script] Popover реакций не появился для поста ${postId}`);
        simulatedPosts.delete(postId);
        return;
      }

      await new Promise(r => setTimeout(r, 100)); // небольшая пауза для рендера
      
      let heartElement = Array.from(popover.querySelectorAll('img')).find(img => img.src && img.src.includes('heart'));
      if (!heartElement) {
        document.body.click(); // Закрываем popover
        simulatedPosts.delete(postId);
        return;
      }

      const clickTarget = heartElement.closest('button, [role="button"]') || heartElement.closest('div') || heartElement;
      clickTarget.click();
      console.log(`[BoostyBookmark page_script] Нативный клик по сердечку выполнен для поста ${postId} (shouldLike=${shouldLike})`);

      // Снимаем флаг блокировки через 500мс (достаточно для перехвата fetch)
      setTimeout(() => simulatedPosts.delete(postId), 500);

    } catch (e) {
      console.error('[BoostyBookmark page_script] Ошибка при нативном клике:', e);
      simulatedPosts.delete(postId);
    }
  }

  // --- Слушатель сообщений от content.js ---
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'LF_TOGGLE_LIKE_DOM') return;

    const { postId, isLiked } = event.data;
    if (postId) {
      simulateReaction(postId, isLiked);
    }
  });

  console.log('[BoostyBookmark page_script] Загружен в main world — перехват fetch/XHR + обратная синхронизация активны');
})();
