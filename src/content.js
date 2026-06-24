/* content.js - Помощник по отслеживанию озвучек на Boosty (Boosty Bookmark) */
/* Точка входа бандла: импорты модулей, проводка зависимостей (init), запуск
   URL-интервала и слушателей верхнего уровня. Источник правды — src/,
   корневой content.js собирается esbuild. */

import {
  BLOG_SLUG,
  TAGS_BLACKLIST,
  TAB_NAMES,
  isExtensionContextValid,
  formatDate,
  arePostsEqual
} from './utils.js';
import {
  state,
  webdavConfig,
  setStateDeps,
  ensureUserData,
  loadStateFromStorage,
  saveStateToStorage,
  loadWebDavConfig
} from './state.js';
import {
  setSyncDeps,
  patchFetch,
  getWebDavOrigin,
  requestWebDavPermission,
  isWebDavConfigured,
  triggerAutoWebDavSync,
  performWebDavSync,
  backgroundSync,
  analyzeNewContent
} from './sync.js';
import {
  setSidebarDeps,
  render,
  showNotification,
  createSidebar,
  createTriggerButton,
  renderListContent,
  renderSettingsContent,
  cleanupHeaderObserver
} from './ui/sidebar.js';
import {
  setNavigationDeps,
  isTargetPage,
  checkAndScrollToPost,
  checkAndScrollToFeed,
  checkAndTriggerOpenChat,
  syncActiveTitleFromUrl,
  patchHistory,
  resetNavScrollState,
  resetProcessedTagParam
} from './navigation.js';
import { getPlayerProgressForPost, initPlayerTracking, sendVideoQualityPref } from './players.js';
import { getGroupedTitles } from './grouping.js';
import {
  devSettings,
  loadDevSettings,
  applyDevSettingsEffects,
  initDevTools,
  cleanupDevTools,
  showDevToolsUI,
  hideDevToolsUI
} from './ui/devtools.js';

// ID интервала периодической проверки URL (для остановки при инвалидации контекста)
let urlCheckIntervalId = null;
// Хранилище ссылок на обработчики событий для их корректного удаления в cleanup()
let eventHandlers = {};

// Полная очистка: удаление DOM-элементов и остановка интервалов осиротевшего скрипта
function cleanup() {
  // Останавливаем периодическую проверку URL
  if (urlCheckIntervalId) {
    clearInterval(urlCheckIntervalId);
    urlCheckIntervalId = null;
  }

  if (DEV) {
    cleanupDevTools();
  }

  // Удаляем слушатели событий
  if (eventHandlers.popstate) window.removeEventListener('popstate', eventHandlers.popstate);
  if (eventHandlers.hashchange) window.removeEventListener('hashchange', eventHandlers.hashchange);
  if (eventHandlers.lfLocationchange) window.removeEventListener('lf_locationchange', eventHandlers.lfLocationchange);
  if (eventHandlers.beforeunload) window.removeEventListener('beforeunload', eventHandlers.beforeunload);
  if (eventHandlers.tagClickHandler) document.removeEventListener('click', eventHandlers.tagClickHandler);
  if (eventHandlers.headerClickHandler) document.removeEventListener('click', eventHandlers.headerClickHandler);

  // Восстанавливаем оригинальные методы history
  if (eventHandlers.originalPushState) history.pushState = eventHandlers.originalPushState;
  if (eventHandlers.originalReplaceState) history.replaceState = eventHandlers.originalReplaceState;

  // Удаляем слушатель сообщений от page_script.js
  if (eventHandlers.messageHandler) window.removeEventListener('message', eventHandlers.messageHandler);

  cleanupHeaderObserver();

  // Удаляем внедрённые DOM-элементы
  const btn = document.getElementById('lf-trigger-btn');
  const sidebar = document.getElementById('lf-sidebar');
  if (btn) btn.remove();
  if (sidebar) sidebar.remove();

  resetNavScrollState();

  try {
    sessionStorage.removeItem('lf_active_title');
    sessionStorage.removeItem('lf_active_tab');
  } catch (e) {
    // Игнорируем ошибки доступа
  }
}

// Управление видимостью интерфейса в зависимости от URL
async function checkUrlAndToggleVisibility() {
  checkAndTriggerOpenChat();

  const isTarget = isTargetPage();
  const btn = document.getElementById('lf-trigger-btn');
  const sidebar = document.getElementById('lf-sidebar');

  if (isTarget) {
    checkAndScrollToFeed();
    checkAndScrollToPost();
    initPlayerTracking();
    if (!btn || !sidebar) {
      // Создаем элементы интерфейса
      createSidebar();
      createTriggerButton();
      if (DEV) {
        initDevTools();
      }

      // Запускаем фоновую синхронизацию (проверка новых постов)
      if (state.posts.length > 0) {
        render();
        backgroundSync();
      } else {
        render();
      }

      if (state.settings.sidebarOpen) {
        triggerAutoWebDavSync();
      }
    } else {
      // Если интерфейс уже есть, просто показываем его
      btn.style.display = '';
      sidebar.style.display = '';
      if (DEV) {
        showDevToolsUI();
      }
    }
    syncActiveTitleFromUrl();
  } else {
    resetProcessedTagParam();
    // Скрываем интерфейс, если мы ушли на другую страницу
    if (btn) btn.style.display = 'none';
    if (sidebar) {
      sidebar.style.display = 'none';
      if (sidebar.classList.contains('lf-open')) {
        sidebar.classList.remove('lf-open');
        state.settings.sidebarOpen = false;
        saveStateToStorage();
      }
    }
    if (DEV) {
      hideDevToolsUI();
    }
  }
}

// Инициализация расширения
async function init() {
  let version = '0.9.0';
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        version = manifest.version;
      }
    }
  } catch (e) {}
  console.log(`[Boosty Bookmark] Загружена версия ${version}`);

  // Внедряем зависимости в state.js (рендер/уведомления/синхронизация живут в модулях UI/sync)
  setStateDeps({ render, showNotification, performWebDavSync, isWebDavConfigured });
  // Внедряем зависимости в sync.js и ui/sidebar.js. Dev-зависимости (devSettings,
  // applyDevSettingsEffects) добавляются только под if (DEV) — иначе ссылки на них
  // удержат ui/devtools.js в релизной сборке (мешает tree-shaking, см. Стратегию 4).
  const syncDeps = {
    render, renderListContent, renderSettingsContent, showNotification, eventHandlers
  };
  const sidebarDeps = { getPlayerProgressForPost };
  if (DEV) {
    syncDeps.devSettings = devSettings;
    sidebarDeps.devSettings = devSettings;
    sidebarDeps.applyDevSettingsEffects = applyDevSettingsEffects;
  }
  setSyncDeps(syncDeps);
  setSidebarDeps(sidebarDeps);
  // Внедряем зависимости в navigation.js (рендер, оркестрация видимости, очистка, обработчики)
  setNavigationDeps({ render, checkUrlAndToggleVisibility, cleanup, eventHandlers });

  await loadStateFromStorage();
  await loadWebDavConfig();
  if (DEV) {
    await loadDevSettings();
  }

  // Отправляем настройку принудительного качества в page_script (main world) как можно
  // раньше — чтобы VK-плеер успел прочитать подменённый localStorage-ключ при инициализации.
  sendVideoQualityPref();

  // Восстанавливаем активный тайтл и вкладку из sessionStorage (для сохранения состояния текущей вкладки при перезагрузке)
  try {
    const savedActiveTitle = sessionStorage.getItem('lf_active_title');
    if (savedActiveTitle) {
      state.ui.activeTitle = savedActiveTitle;
      if (savedActiveTitle === 'Объявления') {
        state.ui.sortAsc = false;
      }
    }
    const savedActiveTab = sessionStorage.getItem('lf_active_tab');
    if (savedActiveTab) {
      state.ui.activeTab = savedActiveTab;
    }
  } catch (e) {
    // Игнорируем ошибки доступа к sessionStorage
  }

  // Обновляем время визита
  const now = Date.now();
  if (!state.lastVisit) {
    state.lastVisit = now - 24 * 60 * 60 * 1000; // Если первый раз, считаем что последний визит был день назад
  }

  // Настраиваем перехват навигации SPA и fetch-запросов
  patchFetch();
  patchHistory();

  // Запускаем периодическую проверку URL
  urlCheckIntervalId = setInterval(() => {
    // При каждом тике проверяем, не инвалидирован ли контекст расширения
    if (!isExtensionContextValid()) {
      cleanup();
      return;
    }
    checkUrlAndToggleVisibility();
  }, 500);

  // Первичная проверка текущей страницы
  await checkUrlAndToggleVisibility();

  // Слушаем закрытие страницы, чтобы обновить время последнего визита
  eventHandlers.beforeunload = () => {
    // Больше не требуется автоматическое обновление lastVisit при выходе
  };
  window.addEventListener('beforeunload', eventHandlers.beforeunload);

  // Перехват кликов по тайтлам на самом сайте Boosty для открытия в текущей вкладке (SPA-переход)
  eventHandlers.tagClickHandler = (e) => {
    if (!state.settings.openTitlesInCurrentTab) return;

    const link = e.target.closest('a');
    if (!link) return;

    const href = link.href;
    if (href && href.includes('boosty.to/lightfoxmanga') && (href.includes('postsTagsIds=') || href.includes('tag='))) {
      // Исключаем открытие в новой вкладке пользователем (Ctrl/Cmd/средний клик)
      if (e.ctrlKey || e.metaKey || e.button === 1) {
        return;
      }

      e.preventDefault();

      link.removeAttribute('target');

      const url = new URL(href);
      const relativeUrl = url.pathname + url.search + url.hash;
      try {
        history.pushState({}, '', relativeUrl);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      } catch (err) {
        window.location.href = href;
      }
    }
  };
  document.addEventListener('click', eventHandlers.tagClickHandler);

  // Закрытие сайдбара при нажатии на колокольчик уведомлений или аватарку в шапке Boosty
  eventHandlers.headerClickHandler = (event) => {
    if (!isExtensionContextValid()) { cleanup(); return; }

    const isNotificationBell = event.target.closest('button[class*="NotificationsButton-scss--module_button_"]');
    const isProfileMenu = event.target.closest('div[class*="MiniProfile-scss--module_root_"][role="button"]');

    if (isNotificationBell || isProfileMenu) {
      if (state.settings.sidebarOpen) {
        state.settings.sidebarOpen = false;
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.classList.remove('lf-open');
        }
        saveStateToStorage();
      }
    }
  };
  document.addEventListener('click', eventHandlers.headerClickHandler);
}

// Запуск
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Экспорт для среды тестирования (Vitest, ESM)
export {
  state,
  webdavConfig,
  ensureUserData,
  formatDate,
  arePostsEqual,
  getGroupedTitles,
  analyzeNewContent,
  checkAndTriggerOpenChat,
  syncActiveTitleFromUrl,
  getWebDavOrigin,
  requestWebDavPermission,
  BLOG_SLUG,
  TAGS_BLACKLIST,
  TAB_NAMES
};
