/* navigation.js — Навигация и автоскролл на страницах Boosty: переход к посту/ленте,
 * автооткрытие чата, переключение тайтла по URL, перехват History API. */

import { BLOG_SLUG, isExtensionContextValid } from './utils.js';
import { state } from './state.js';

// Внешние зависимости (рендер UI, группировка тайтлов, оркестрация видимости,
// очистка, общий объект обработчиков), внедряются из content.js через setNavigationDeps().
let render = () => {};
let getGroupedTitles = () => [];
let checkUrlAndToggleVisibility = () => {};
let cleanup = () => {};
let eventHandlers = {};

function setNavigationDeps(d) {
  if (d.render) render = d.render;
  if (d.getGroupedTitles) getGroupedTitles = d.getGroupedTitles;
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

  // Вспомогательная функция проверки наличия хэша поста в URL
  function hasPostHash() {
    const hash = window.location.hash;
    return /^#post-[a-f0-9-]+/i.test(hash);
  }

  // Автоматический скролл к конкретному посту по хэшу #post-[postId] в URL
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

    let attempts = 0;
    const maxAttempts = 30; // ~15 секунд при 500мс интервале

    const interval = setInterval(() => {
      attempts++;

      // Ищем ссылку на этот пост в ленте (исключая панель расширения)
      const allLinks = document.querySelectorAll(`a[href*="${postId}" i]`);
      let linkElement = null;
      const sidebar = document.getElementById('lf-sidebar');
      for (const link of allLinks) {
        if (sidebar && sidebar.contains(link)) continue;
        linkElement = link;
        break;
      }

      if (linkElement) {
        clearInterval(interval);

        // Находим родительский элемент поста
        const postElement = linkElement.closest('[class*="Post-scss--module_root"]');
        const targetElement = postElement || linkElement;

        const yOffset = -80; // 56px шапка Boosty + 24px воздух
        const rect = targetElement.getBoundingClientRect();
        const y = rect.top + window.pageYOffset + yOffset;

        window.scrollTo({ top: y, behavior: 'smooth' });
        return;
      }

      // Прокручиваем вниз для подгрузки новых постов только после 5 неудачных попыток (~2.5 сек),
      // чтобы дать странице время на первичный рендеринг без резких прыжков.
      if (attempts > 5) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
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
