// page_script.js — работает в main world страницы Boosty
// 1. Перехватывает fetch и XMLHttpRequest запросы к /reaction для синхронизации лайков
//    в обратную сторону (реальный клик пользователя по реакции → чекбокс расширения).
// 2. Косметически подсвечивает сердечко поста на странице, когда лайк ставится из расширения.
//    Реальная постановка/снятие лайка идёт через REST API в content.js; программный клик по
//    hover-поповеру реакций на текущей вёрстке Boosty не срабатывает (нужны trusted-события),
//    поэтому здесь мы лишь правим data-active и счётчик кнопки напрямую.
// 3. Принудительное качество VK-плеера через перехват localStorage.
(function () {
  'use strict';

  // Внутренний build-маркер. Бампается при КАЖДОМ изменении кода расширения —
  // чтобы можно было проверить в DevTools, что загружена свежая версия:
  //   в консоли страницы Boosty набери  __LF_BUILD
  // Должен совпадать со значением в src/content.js (LF_INTERNAL_BUILD).
  const LF_INTERNAL_BUILD = '2026-06-26.7';
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
          // (Запросы самого расширения идут из content.js в изолированном мире и сюда не попадают.)
          const fetchPromise = originalFetch.apply(this, arguments);
          fetchPromise.then(response => {
            if (response.ok) {
              console.log(`[BoostyBookmark page_script] Перехвачен fetch ${upperMethod} /reaction для поста ${postId}`);
              likedPosts.set(postId, isLiked);
              applyLikeVisual(postId, isLiked, false);
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
              likedPosts.set(postId, isLiked);
              applyLikeVisual(postId, isLiked, false);
              window.postMessage({ type: LF_MSG_TYPE, postId, isLiked }, '*');
            }
          });
        }
      }
    } catch (e) {}

    return originalXHRSend.apply(this, arguments);
  };

  // =====================================================================
  // КОСМЕТИЧЕСКАЯ ПОДСВЕТКА ЛАЙКА: расширение → сердечко поста на странице
  // =====================================================================

  /**
   * Находит кнопку реакции для поста по postId.
   * Ищет ссылку на пост в DOM (вне sidebar расширения), поднимается к контейнеру
   * и находит кнопку [data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"].
   */
  function findReactionButton(postId) {
    const sidebar = document.getElementById('lf-sidebar');

    // 1. Если текущий URL страницы содержит этот postId, кнопка реакций на странице
    //    и есть кнопка этого поста (актуально для страницы конкретного поста).
    if (window.location.pathname.includes(postId)) {
      const btns = document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
      for (const btn of btns) {
        if (sidebar && sidebar.contains(btn)) continue;
        return btn;
      }
    }

    // 2. Иначе (например, в общей ленте) ищем через ссылки на этот пост на странице
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
   * Сдвигает первый чисто числовой текстовый узел внутри элемента на delta (+1/−1).
   * Форматированные значения ("1.2k") не трогаем, чтобы не исказить отображение.
   */
  function adjustLikeCount(el, delta) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue.trim();
      if (/^\d+$/.test(raw)) {
        const next = Math.max(0, parseInt(raw, 10) + delta);
        node.nodeValue = node.nodeValue.replace(raw, String(next));
        return;
      }
    }
  }

  // Наш собственный класс подсветки выбранной реакции. В отличие от класса Boosty
  // (`ReactionItem-scss--module_selected_<хэш>`, где хэш генерируется сборкой и неизвестен
  // на холодной странице), мы вешаем СВОЙ класс и стилизуем его внедрённым ниже CSS —
  // поэтому подсветка работает сразу, с первого раза, без знания хэша Boosty.
  const LF_LIKED_CLASS = 'lf-bb-liked';
  const likedPosts = new Map();

  // Внедряем стиль подсветки один раз. Повторяет вид «выбранной» реакции Boosty:
  // серая пилюля-контейнер + бейдж-счётчик бренд-оранжевым с белым текстом.
  // Контейнер — полупрозрачным серым (одинаково читается на тёмной и светлой теме),
  // счётчик — точным брендовым цветом Boosty (rgb(241,95,44)), он постоянен в обеих темах.
  function ensureLikeStyleInjected() {
    if (document.getElementById('lf-bb-reaction-style')) return;
    const style = document.createElement('style');
    style.id = 'lf-bb-reaction-style';
    style.textContent = `
      [class*="ReactionItem-scss--module_container"].${LF_LIKED_CLASS} {
        background-color: rgba(128, 128, 128, 0.22) !important;
        border-radius: 40px !important;
      }
      [class*="ReactionItem-scss--module_container"].${LF_LIKED_CLASS} [class*="ReactionItem-scss--module_counter"] {
        background-color: rgb(241, 95, 44) !important;
        color: #fff !important;
      }
      [data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"].${LF_LIKED_CLASS} {
        background-color: rgba(241, 95, 44, 0.08) !important;
        border: 1px solid rgba(241, 95, 44, 0.3) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Видимый элемент реакции «сердечко» в постоянном ряду реакций (страница поста,
   * раскрытый пост ленты). В свёрнутых карточках ленты такого ряда нет — вернёт null.
   */
  function findVisibleHeartReactionItem(scope) {
    const items = scope.querySelectorAll('[class*="ReactionItem-scss--module_container"].heart');
    for (const it of items) {
      if (it.offsetParent !== null && it.getBoundingClientRect().width > 0) return it;
    }
    return null;
  }

  // Считается ли сердечко сейчас «выбранным» на странице: либо Boosty отрисовал свой
  // класс _selected_ (реальная реакция), либо мы повесили свой LF_LIKED_CLASS.
  function isHeartShownLiked(heartItem) {
    return heartItem.classList.contains(LF_LIKED_CLASS) ||
      [...heartItem.classList].some(c => c.includes('ReactionItem-scss--module_selected_'));
  }

  function isPopoverOpenForBtn(btn) {
    const popoverHolder = btn.hasAttribute('aria-describedby') ? btn : btn.querySelector('[aria-describedby]');
    const popoverId = popoverHolder ? popoverHolder.getAttribute('aria-describedby') : null;
    if (popoverId && document.getElementById(popoverId)) {
      return true;
    }

    const popover = document.querySelector('[class*="ReactionSelector"], [class*="TooltipContent"]');
    if (!popover) return false;

    const btnRect = btn.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    const btnCenterX = btnRect.left + btnRect.width / 2;
    const popoverCenterX = popoverRect.left + popoverRect.width / 2;
    const distanceX = Math.abs(btnCenterX - popoverCenterX);

    if (distanceX < 150 && Math.abs(btnRect.top - popoverRect.bottom) < 120) {
      return true;
    }
    return false;
  }

  function findActiveReactionButton() {
    const btns = document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
    for (const btn of btns) {
      if (isPopoverOpenForBtn(btn)) return btn;
    }
    return null;
  }

  function getPostIdFromButton(btn) {
    if (window.location.pathname.includes('/posts/')) {
      const match = window.location.pathname.match(/\/posts\/([a-f0-9-]+)/i);
      if (match) return match[1];
    }

    let current = btn;
    let maxDepth = 20;
    while (current && current !== document.body && maxDepth > 0) {
      current = current.parentElement;
      maxDepth--;
      const link = current.querySelector('a[href*="/posts/"]');
      if (link) {
        const match = link.href.match(/\/posts\/([a-f0-9-]+)/i);
        if (match) return match[1];
      }
    }
    return null;
  }

  function applyHeartItemVisual(heartItem, isLiked) {
    const isCurrentlyLiked = heartItem.classList.contains(LF_LIKED_CLASS) ||
      [...heartItem.classList].some(c => c.includes('ReactionItem-scss--module_selected_'));

    if (isCurrentlyLiked === isLiked) return; // уже в нужном состоянии

    const counter = heartItem.querySelector('[class*="ReactionItem-scss--module_counter"]');
    if (isLiked) {
      heartItem.classList.add(LF_LIKED_CLASS);
      if (counter) adjustLikeCount(counter, 1);
    } else {
      heartItem.classList.remove(LF_LIKED_CLASS);
      [...heartItem.classList]
        .filter(c => c.includes('ReactionItem-scss--module_selected_'))
        .forEach(c => heartItem.classList.remove(c));
      if (counter) adjustLikeCount(counter, -1);
    }
  }

  /**
   * Косметически приводит элементы реакции к состоянию isLiked.
   */
  function applyLikeVisual(postId, isLiked, adjustCount = false) {
    likedPosts.set(postId, isLiked);

    const reactionBtn = findReactionButton(postId);
    if (!reactionBtn) return; // пост не отрендерен на странице — нечего подсвечивать

    // 1. Обновляем агрегатную кнопку реакций (всегда, если она есть)
    const isBtnCurrentlyLiked = reactionBtn.classList.contains(LF_LIKED_CLASS);
    if (isBtnCurrentlyLiked !== isLiked) {
      if (isLiked) {
        reactionBtn.classList.add(LF_LIKED_CLASS);
      } else {
        reactionBtn.classList.remove(LF_LIKED_CLASS);
      }
      
      if (adjustCount) {
        const amountEl = reactionBtn.querySelector('[class*="amount"]');
        if (amountEl) {
          adjustLikeCount(amountEl, isLiked ? 1 : -1);
        }
      }
    }

    // 2. Обновляем сердечко в открытом поповере/ряду реакций (если они отрендерены и видны)
    const postScope = reactionBtn.closest('[data-test-id="COMMON_POST:ROOT"]') || document;
    const heartItem = findVisibleHeartReactionItem(postScope);
    if (heartItem) {
      applyHeartItemVisual(heartItem, isLiked);
    }
  }

  // Возвращает элемент открытого поповера реакций, связанного с кнопкой (по aria-describedby).
  function getOpenPopoverForBtn(btn) {
    const holder = btn.hasAttribute('aria-describedby') ? btn : btn.querySelector('[aria-describedby]');
    const id = holder && holder.getAttribute('aria-describedby');
    return id ? document.getElementById(id) : null;
  }

  // Наблюдатель за появлением всплывающих меню реакций, чтобы подсветить сердечко
  // в открывшемся меню, если пост уже лайкнут из расширения.
  // Boosty — React-SPA, DOM мутирует постоянно, поэтому НЕ сканируем каждую мутацию:
  // лишь ставим дебаунс-таймер и один раз проверяем — открыт ли поповер у лайкнутого поста.
  function initPopoverObserver() {
    let scheduled = false;

    const handle = () => {
      scheduled = false;
      const activeBtn = findActiveReactionButton();
      if (!activeBtn) return;
      const postId = getPostIdFromButton(activeBtn);
      if (!postId || likedPosts.get(postId) !== true) return;

      // Подсвечиваем сердечко в самом поповере и в ряду реакций поста (если отрисованы)
      const scopes = [];
      const popover = getOpenPopoverForBtn(activeBtn);
      if (popover) scopes.push(popover);
      const postScope = activeBtn.closest('[data-test-id="COMMON_POST:ROOT"]');
      if (postScope) scopes.push(postScope);
      for (const scope of scopes) {
        const heartItem = findVisibleHeartReactionItem(scope);
        if (heartItem) applyHeartItemVisual(heartItem, true);
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (scheduled) return;
      let hasAdded = false;
      for (const m of mutations) { if (m.addedNodes.length) { hasAdded = true; break; } }
      if (!hasAdded) return;
      scheduled = true;
      setTimeout(handle, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

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

    if (event.data.type === 'LF_SET_LIKE_VISUAL') {
      const { postId, isLiked } = event.data;
      if (postId) applyLikeVisual(postId, !!isLiked, true);
      return;
    }

    if (event.data.type === 'LF_SYNC_ALL_LIKES') {
      const { likedIds } = event.data;
      if (Array.isArray(likedIds)) {
        likedPosts.clear();
        for (const id of likedIds) {
          likedPosts.set(id, true);
        }

        // Применяем начальную визуальную подсветку к уже лайкнутым постам на странице без изменения счетчиков
        const btns = document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
        for (const btn of btns) {
          const postId = getPostIdFromButton(btn);
          if (postId) {
            const isLiked = likedPosts.get(postId) === true;
            applyLikeVisual(postId, isLiked, false);
          }
        }
      }
      return;
    }
  });

  // Внедряем стиль подсветки сердечка (наш собственный класс)
  ensureLikeStyleInjected();

  // Инициализируем наблюдатель за поповерами
  initPopoverObserver();

  console.log(`[BoostyBookmark page_script] Загружен в main world (build ${LF_INTERNAL_BUILD}) — перехват fetch/XHR + косметика лайков активны`);
})();
