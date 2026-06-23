/* navigation.js — Навигация и автоскролл на страницах Boosty: переход к посту/ленте,
 * автооткрытие чата, переключение тайтла по URL, перехват History API. */

import { BLOG_SLUG, isExtensionContextValid } from './utils.js';
import { state } from './state.js';
import { getGroupedTitles } from './grouping.js';

// Внешние зависимости (рендер UI, оркестрация видимости, очистка, общий объект
// обработчиков), внедряются из content.js через setNavigationDeps().
let render = () => {};
let checkUrlAndToggleVisibility = () => {};
let cleanup = () => {};
let eventHandlers = {};

function setNavigationDeps(d) {
  if (d.render) render = d.render;
  if (d.checkUrlAndToggleVisibility) checkUrlAndToggleVisibility = d.checkUrlAndToggleVisibility;
  if (d.cleanup) cleanup = d.cleanup;
  if (d.eventHandlers) eventHandlers = d.eventHandlers;
}

// Хранит последний проверенный URL с флагом openChat для предотвращения бесконечных циклов
let lastCheckedChatUrl = null;

  // Проверка, является ли текущая страница блогом целевого автора
  function isTargetPage() {
    const path = window.location.pathname.toLowerCase();
    return path === `/${BLOG_SLUG}` || path.startsWith(`/${BLOG_SLUG}/`);
  }

  let lastScrolledUrl = null;
  let lastScrolledPostId = null;
  let lastProcessedTagParam = null;
  // ID активного цикла скролла-к-посту (для остановки при смене главы / cleanup)
  let scrollToPostIntervalId = null;

  // Вспомогательная функция проверки наличия хэша поста в URL
  function hasPostHash() {
    const hash = window.location.hash;
    return /^#post-[a-f0-9-]+/i.test(hash);
  }

  // Поиск элемента поста в ленте Boosty по его ID (ссылку из панели расширения исключаем)
  function findFeedPostElement(postId) {
    const sidebar = document.getElementById('lf-sidebar');
    const links = document.querySelectorAll(`a[href*="${postId}" i]`);
    for (const link of links) {
      if (sidebar && sidebar.contains(link)) continue;
      return link.closest('[class*="Post-scss--module_root"]') || link;
    }
    return null;
  }

  // Поиск кнопки «Загрузить еще» ленты (RU/EN). Лента Boosty грузит первые порции
  // постов автоскроллом, но после нескольких порций показывает кнопку, которую нужно
  // кликнуть, иначе подгрузка встаёт. Исключаем кнопки комментариев и невидимые.
  function findFeedLoadMoreButton() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (!/(загрузить (еще|ещё)|load more|show more)/.test(text)) continue;
      if (/коммент|comment/.test(text)) continue;
      if (btn.closest('[class*="omment"]')) continue;
      if (btn.offsetParent === null) continue; // невидимая
      return btn;
    }
    return null;
  }

  // Подгрузка следующей порции постов в ленте. Целимся в конец КОЛОНКИ ПОСТОВ
  // (а не в document.scrollHeight — правая колонка с тирами выше колонки постов, и
  // прыжок в самый низ документа перелетает зону триггера ленивой подгрузки). Если
  // позиция скролла не изменилась с прошлого раза («парковка»), сентинел подгрузки
  // уже сработал и не пере-сработает — делаем «толчок» вверх, чтобы на следующем
  // тике он снова вошёл в зону видимости. Возвращает новую целевую позицию скролла.
  function nudgeFeedToLoadMore(prevTarget) {
    const posts = document.querySelectorAll('[class*="Post-scss--module_root"]');
    const last = posts[posts.length - 1];
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    let target = maxScroll;
    if (last) {
      const lastBottom = last.getBoundingClientRect().bottom + window.pageYOffset;
      target = Math.min(lastBottom - window.innerHeight * 0.5, maxScroll); // конец постов в нижней части экрана
    }
    target = Math.max(0, target);
    if (prevTarget !== null && Math.abs(target - prevTarget) < 8) {
      // «Парковка» — подгрузка встала. Толчок вверх, чтобы пере-взвести сентинел.
      window.scrollTo(0, Math.max(0, target - window.innerHeight * 0.7));
      return null; // сбрасываем, чтобы следующий тик снова прицелился в конец постов
    }
    window.scrollTo(0, target);
    return target;
  }

  // Установка целевого поста в верх области просмотра (под шапкой Boosty)
  function scrollPostToTop(targetElement, behavior) {
    const yOffset = -80; // 56px шапка Boosty + 24px воздух
    const y = targetElement.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: behavior || 'auto' });
  }

  // Автоматический скролл к конкретному посту по хэшу #post-[postId] в URL.
  // Двухфазный цикл: (1) догружаем посты (скролл + клики «Загрузить еще»), пока
  // целевой пост не появится в ленте; (2) приземляемся на него и удерживаем позицию,
  // пока лэйаут не стабилизируется (догрузка медиа выше может «сдвигать» цель).
  function checkAndScrollToPost() {
    if (!isTargetPage()) return;

    const hash = window.location.hash;
    const match = hash.match(/^#post-([a-f0-9-]+)/i);
    if (!match) return;

    const postId = match[1];
    const currentUrl = window.location.href;

    // Предотвращаем бесконечные повторные попытки скроллинга к тому же самому посту
    if (currentUrl === lastScrolledPostId) return;
    lastScrolledPostId = currentUrl;

    // Останавливаем предыдущий цикл, если пользователь быстро переключил главу
    if (scrollToPostIntervalId) {
      clearInterval(scrollToPostIntervalId);
      scrollToPostIntervalId = null;
    }

    let attempts = 0;
    const maxAttempts = 50; // ~30 секунд при 600мс — хватает на догрузку 40+ постов
    let lastCount = -1;
    let stagnantTicks = 0;
    let foundTarget = null;
    let stabilizeTicks = 0;
    let lastTop = null;
    let prevScrollTarget = null;

    scrollToPostIntervalId = setInterval(() => {
      attempts++;

      // --- Фаза 2: цель найдена, приземляемся и ждём стабилизации позиции ---
      if (foundTarget) {
        const top = Math.round(foundTarget.getBoundingClientRect().top + window.pageYOffset);
        if (lastTop === null) {
          scrollPostToTop(foundTarget, 'smooth'); // первичное плавное приземление
        } else if (Math.abs(top - lastTop) >= 4) {
          scrollPostToTop(foundTarget, 'auto'); // лэйаут «поехал» — мгновенная коррекция
          stabilizeTicks = 0;
        } else {
          stabilizeTicks++;
        }
        lastTop = top;
        if (stabilizeTicks >= 2 || attempts >= maxAttempts) {
          clearInterval(scrollToPostIntervalId);
          scrollToPostIntervalId = null;
        }
        return;
      }

      // --- Фаза 1: догружаем посты, пока не появится целевой ---
      const target = findFeedPostElement(postId);
      if (target) {
        foundTarget = target; // позиционирование — со следующего тика (кадр на лэйаут)
        return;
      }

      const n = document.querySelectorAll('[class*="Post-scss--module_root"]').length;
      if (n > lastCount) { lastCount = n; stagnantTicks = 0; }
      else stagnantTicks++;

      // Кнопка «Загрузить еще» имеет приоритет: лента отдаёт первые порции
      // автоскроллом, но затем требует явного клика, иначе подгрузка встаёт.
      const btn = findFeedLoadMoreButton();
      if (btn) {
        btn.click();
        prevScrollTarget = null;
        stagnantTicks = 0;
      } else {
        prevScrollTarget = nudgeFeedToLoadMore(prevScrollTarget);
      }

      // Долго нет прироста и нет кнопки догрузки → поста в ленте нет, выходим.
      if (attempts >= maxAttempts || (stagnantTicks >= 12 && !btn)) {
        clearInterval(scrollToPostIntervalId);
        scrollToPostIntervalId = null;
      }
    }, 600);
  }

  // Автоматический скролл к ленте постов, если в URL есть параметры фильтрации (теги)
  function checkAndScrollToFeed() {
    if (!isTargetPage()) return;
    if (hasPostHash()) return; // Пропускаем скролл к фиду, если нужно скроллить к посту

    const currentUrl = window.location.href;
    if (currentUrl === lastScrolledUrl) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('postsTagsIds') || urlParams.has('tag')) {
      let attempts = 0;
      const maxAttempts = 30; // 3 секунды максимум
      const interval = setInterval(() => {
        attempts++;
        const targetElement = document.querySelector('[class*="FeedTabs-scss--module_root_"]');
        if (targetElement) {
          clearInterval(interval);
          const yOffset = -80; // 56px шапка Boosty + 24px запас (воздух)
          const rect = targetElement.getBoundingClientRect();
          const y = rect.top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: 'smooth' });
          lastScrolledUrl = currentUrl;
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 100);
    } else {
      lastScrolledUrl = currentUrl;
    }
  }

  // Автоматическое открытие чата с автором при переходе по ссылке с флагом ?openChat=true
  function checkAndTriggerOpenChat() {
    const currentUrl = window.location.href;
    
    // Проверяем, содержит ли URL параметр openChat
    const hasOpenChat = currentUrl.includes('openChat=true') || currentUrl.includes('openChat');
    if (!hasOpenChat) return;

    // Предотвращаем повторный запуск для того же URL
    if (currentUrl === lastCheckedChatUrl) return;
    lastCheckedChatUrl = currentUrl;

    const startPathname = window.location.pathname;

    // Убираем флаг из URL, чтобы при перезагрузке чат не открывался повторно
    try {
      const url = new URL(currentUrl);
      if (url.searchParams.has('openChat')) {
        url.searchParams.delete('openChat');
      }
      let newHash = url.hash;
      if (newHash.includes('openChat')) {
        newHash = newHash.replace('openChat', '').replace('?openChat', '').replace('&openChat', '').replace('=', '').replace('true', '');
        newHash = newHash.replace(/^[#&]+/, '#');
        if (newHash === '#') newHash = '';
        url.hash = newHash;
      }
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (e) {
      console.error('[Boosty Bookmark] Failed to clean URL:', e);
    }

    let attempts = 0;
    const maxAttempts = 30; // ~15 секунд при 500мс интервале

    const interval = setInterval(() => {
      // Если во время ожидания пользователь ушёл со страницы, прекращаем попытки
      if (window.location.pathname !== startPathname) {
        clearInterval(interval);
        return;
      }
      
      attempts++;

      // Ищем кнопку чата
      // 1. По data-test-id (наиболее надежный селектор для Boosty)
      let chatBtn = document.querySelector('button[data-test-id="AUTHORCARDBLOCK:messageButton"]');

      // 2. Фолбек по тексту кнопки
      if (!chatBtn) {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
        chatBtn = buttons.find(el => {
          const text = (el.textContent || el.innerText || '').toLowerCase().trim();
          return text === 'чат' || text === 'chat' || text === 'написать сообщение' || text === 'сообщение';
        });
      }

      // 3. Фолбек по классу, содержащему messageButton
      if (!chatBtn) {
        chatBtn = document.querySelector('[class*="messageButton"]');
      }

      if (chatBtn) {
        clearInterval(interval);
        try {
          chatBtn.click();
          console.log('[Boosty Bookmark] Automatically opened chat.');
        } catch (e) {
          console.error('[Boosty Bookmark] Failed to click chat button:', e);
        }
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[Boosty Bookmark] Chat button not found after maximum attempts.');
      }
    }, 500);
  }

  // Автоматический переход на детальный вид тайтла при изменении URL страницы
  function syncActiveTitleFromUrl() {
    if (!state.settings.syncTitleFromUrl) return;
    if (!isTargetPage()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const tagParam = urlParams.get('postsTagsIds') || urlParams.get('tag') || null;

    if (tagParam === lastProcessedTagParam) {
      return;
    }

    const previousTagParam = lastProcessedTagParam;
    lastProcessedTagParam = tagParam;

    if (tagParam) {
      const allTitles = getGroupedTitles();
      
      // 1. Попытка сопоставить по tagId
      let matchedTitle = allTitles.find(t => t.tagId && String(t.tagId) === String(tagParam));
      
      // 2. Если не нашли, пробуем сопоставить по имени (декодированному из URL)
      if (!matchedTitle) {
        try {
          const decodedTag = decodeURIComponent(tagParam).trim().toLowerCase();
          matchedTitle = allTitles.find(t => t.name.trim().toLowerCase() === decodedTag);
        } catch (e) {
          // Игнорируем ошибки декодирования
        }
      }
      
      if (matchedTitle) {
        if (state.ui.activeTitle !== matchedTitle.name) {
          console.log(`[Boosty Bookmark] Автоматическое переключение на тайтл: "${matchedTitle.name}" (найден по тегу ${tagParam})`);
          state.ui.activeTitle = matchedTitle.name;
          try {
            sessionStorage.setItem('lf_active_title', matchedTitle.name);
          } catch (e) {}
          render();
        }
      }
    } else {
      // tagParam === null, но previousTagParam !== null
      // Это означает переход с конкретного тега на общую ленту
      if (previousTagParam !== null && state.ui.activeTitle !== null) {
        console.log(`[Boosty Bookmark] Сброс активного тайтла при переходе на общую ленту`);
        state.ui.activeTitle = null;
        try {
          sessionStorage.setItem('lf_active_title', '');
        } catch (e) {}
        render();
      }
    }
  }

  // Перехват истории переходов SPA (React Router / HTML5 History API)
  function patchHistory() {
    eventHandlers.originalPushState = history.pushState;
    eventHandlers.originalReplaceState = history.replaceState;
    
    history.pushState = function () {
      const result = eventHandlers.originalPushState.apply(this, arguments);
      if (isExtensionContextValid()) {
        try { window.dispatchEvent(new Event('lf_locationchange')); } catch(e) {}
      }
      return result;
    };
    
    history.replaceState = function () {
      const result = eventHandlers.originalReplaceState.apply(this, arguments);
      if (isExtensionContextValid()) {
        try { window.dispatchEvent(new Event('lf_locationchange')); } catch(e) {}
      }
      return result;
    };
    
    eventHandlers.popstate = () => {
      if (!isExtensionContextValid()) { cleanup(); return; }
      try { window.dispatchEvent(new Event('lf_locationchange')); } catch(e) {}
    };
    window.addEventListener('popstate', eventHandlers.popstate);
    
    eventHandlers.hashchange = () => {
      if (!isExtensionContextValid()) { cleanup(); return; }
      try { window.dispatchEvent(new Event('lf_locationchange')); } catch(e) {}
    };
    window.addEventListener('hashchange', eventHandlers.hashchange);
    
    eventHandlers.lfLocationchange = () => {
      if (!isExtensionContextValid()) { cleanup(); return; }
      checkUrlAndToggleVisibility();
    };
    window.addEventListener('lf_locationchange', eventHandlers.lfLocationchange);
  }


// Сброс навигационного состояния (вызывается из cleanup() в content.js)
function resetNavScrollState() {
  lastScrolledUrl = null;
  lastScrolledPostId = null;
  lastProcessedTagParam = null;
  if (scrollToPostIntervalId) {
    clearInterval(scrollToPostIntervalId);
    scrollToPostIntervalId = null;
  }
}

// Сброс только обработанного тег-параметра (вызывается из checkUrlAndToggleVisibility)
function resetProcessedTagParam() {
  lastProcessedTagParam = null;
}

export {
  setNavigationDeps,
  isTargetPage,
  hasPostHash,
  checkAndScrollToPost,
  checkAndScrollToFeed,
  checkAndTriggerOpenChat,
  syncActiveTitleFromUrl,
  patchHistory,
  resetNavScrollState,
  resetProcessedTagParam
};
