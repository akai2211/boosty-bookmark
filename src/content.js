/* content.js - Помощник по отслеживанию озвучек на Boosty (Boosty Bookmark) */
/* Точка входа бандла. Источник правды — src/, корневой content.js собирается esbuild. */

import { t, tCategory, getCurrentLang } from './locales.js';
import * as BoostyBookmarkSync from './webdav-sync.js';
import {
  BLOG_SLUG,
  STORAGE_KEY,
  WEBDAV_CONFIG_KEY,
  WEBDAV_AUTO_SYNC_MIN_INTERVAL_MS,
  TAGS_BLACKLIST,
  TAB_NAMES,
  FOX_SVG_PATH,
  PLATE_SVG_PATH,
  BOOKMARK_SVG_PATH,
  escapeHtml,
  getUsdtAddress,
  isExtensionContextValid,
  formatDate,
  arePostsEqual,
  formatSeconds
} from './utils.js';
import {
  state,
  webdavConfig,
  setStateDeps,
  ensureUserData,
  updateExtensionBadge,
  loadStateFromStorage,
  saveStateToStorage,
  debouncedWebDavUpload,
  exportUserData,
  importUserData,
  loadWebDavConfig,
  saveWebDavConfig,
  buildLocalChannelsMapFromStorage,
  applyMergedChannelToState
} from './state.js';
import {
  setSyncDeps,
  patchFetch,
  getWebDavOrigin,
  requestWebDavPermission,
  isWebDavConfigured,
  triggerAutoWebDavSync,
  performWebDavSync,
  saveWebDavSettingsFromForm,
  getBoostyAuthToken,
  performIncrementalSync,
  performFullSync,
  backgroundSync
} from './sync.js';
import {
  setSidebarDeps,
  render,
  showNotification,
  createSidebar,
  createTriggerButton,
  renderListContent,
  renderSettingsContent
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
import { getPlayerProgressForPost, initPlayerTracking } from './players.js';
import {
  devSettings,
  setDevtoolsDeps,
  loadDevSettings,
  applyDevSettingsEffects,
  initDevTools,
  cleanupDevTools,
  showDevToolsUI,
  hideDevToolsUI
} from './ui/devtools.js';

  // ID интервала периодической проверки URL (для возможности остановки при инвалидации контекста)
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
    let version = '0.8.0';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
        const manifest = chrome.runtime.getManifest();
        if (manifest && manifest.version) {
          version = manifest.version;
        }
      }
    } catch (e) {}
    console.log(`[Boosty Bookmark] Загружена версия ${version}`);

    // Внедряем зависимости в state.js (рендер/уведомления/синхронизация остаются в content.js)
    setStateDeps({ render, showNotification, performWebDavSync, isWebDavConfigured });
    // Внедряем зависимости в sync.js и ui/sidebar.js. Dev-зависимости (devSettings,
    // applyDevSettingsEffects) добавляются только под if (DEV) — иначе ссылки на них
    // удержат ui/devtools.js в релизной сборке (мешает tree-shaking, см. Стратегию 4).
    const syncDeps = {
      render, renderListContent, renderSettingsContent, showNotification,
      getGroupedTitles, getGroupedTitlesInternal, eventHandlers
    };
    const sidebarDeps = {
      getGroupedTitles, getPlayerProgressForPost,
      sendBoostyReaction, removeBoostyReaction, formatSyncDate
    };
    if (DEV) {
      syncDeps.devSettings = devSettings;
      sidebarDeps.devSettings = devSettings;
      sidebarDeps.applyDevSettingsEffects = applyDevSettingsEffects;
      setDevtoolsDeps({ formatSyncDate });
    }
    setSyncDeps(syncDeps);
    setSidebarDeps(sidebarDeps);
    // Внедряем зависимости в navigation.js (рендер, группировка, оркестрация видимости, очистка, обработчики)
    setNavigationDeps({ render, getGroupedTitles, checkUrlAndToggleVisibility, cleanup, eventHandlers });

    await loadStateFromStorage();
    await loadWebDavConfig();
    if (DEV) {
      await loadDevSettings();
    }

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

  // -------------------------------------------------------------
  // ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (WebDAV)
  // -------------------------------------------------------------

  function formatSyncDate(timestamp) {
    if (!timestamp) return t('settings_webdav_never_sync');
    const date = new Date(timestamp);
    const isEn = (typeof getCurrentLang === 'function' ? getCurrentLang() : 'ru') === 'en';
    const dateLocale = isEn ? 'en-US' : 'ru-RU';
    return date.toLocaleString(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // -------------------------------------------------------------
  // ЛОГИКА СИНХРОНИЗАЦИИ И АНАЛИЗА API
  // -------------------------------------------------------------

  // Отправка лайка (реакции) на пост в Boosty
  async function sendBoostyReaction(postId) {
    const token = getBoostyAuthToken();
    if (!token) {
      console.warn('Не удалось поставить лайк на Boosty: токен авторизации отсутствует.');
      return;
    }
    
    try {
      const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/${postId}/reaction?from_page=blog`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ reaction: 'heart' }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.warn(`Не удалось поставить лайк на Boosty (статус ${response.status}):`, text);
        return;
      }
      
      console.log(`Лайк успешно отправлен на Boosty для поста ${postId}`);
      
      // Обновляем локальный кэш поста, чтобы при ререндере он отображался как лайкнутый
      const post = state.posts.find(p => String(p.id) === String(postId));
      if (post) post.isLiked = true;
      
    } catch (e) {
      console.warn('Не удалось отправить реакцию на Boosty:', e);
    }
  }

  // Удаление лайка (реакции) с поста на Boosty
  async function removeBoostyReaction(postId) {
    const token = getBoostyAuthToken();
    if (!token) {
      console.warn('Не удалось снять лайк на Boosty: токен авторизации отсутствует.');
      return;
    }
    
    try {
      const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/${postId}/reaction?from_page=blog`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ reaction: 'heart' }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.warn(`Не удалось снять лайк на Boosty (статус ${response.status}):`, text);
        return;
      }
      
      console.log(`Лайк успешно снят на Boosty для поста ${postId}`);
      
      // Обновляем локальный кэш поста
      const post = state.posts.find(p => String(p.id) === String(postId));
      if (post) post.isLiked = false;
      
    } catch (e) {
      console.warn('Не удалось снять реакцию на Boosty:', e);
    }
  }

  // Группировка постов по тайтлам (тегам)
  function getGroupedTitles() {
    return getGroupedTitlesInternal(state.posts);
  }

  function getGroupedTitlesInternal(posts) {
    const titlesMap = {};
    const tagNamesMap = {};
    const postNamesMap = {};
    let hasMigration = false;
    
    // Сначала извлекаем сопоставления из сохраненных ссылок описания блога
    if (Array.isArray(state.blogDescriptionLinks)) {
      state.blogDescriptionLinks.forEach(link => {
        const urlStr = link.url;
        const cleanName = link.title;
        try {
          const urlObj = new URL(urlStr, 'https://boosty.to');
          const postsTagsIds = urlObj.searchParams.get('postsTagsIds');
          if (postsTagsIds) {
            tagNamesMap[postsTagsIds] = cleanName;
          } else {
            const postMatch = urlObj.pathname.match(/\/posts\/([a-f0-9-]+)/i);
            if (postMatch && postMatch[1]) {
              postNamesMap[postMatch[1]] = cleanName;
            }
          }
        } catch (e) {
          // Игнорируем некорректные URL
        }
      });
    }
    
    // Если ссылка ведет на пост, связываем теги этого поста с красивым именем
    posts.forEach(post => {
      if (postNamesMap[post.id]) {
        const cleanName = postNamesMap[post.id];
        const cleanTags = post.tags.filter(t => !TAGS_BLACKLIST.includes(t.title.toLowerCase()));
        cleanTags.forEach(tagObj => {
          if (tagObj.id && !tagNamesMap[tagObj.id]) {
            tagNamesMap[tagObj.id] = cleanName;
          }
        });
      }
    });

    posts.forEach(post => {
      // Находим все чистые теги поста (исключая технические из черного списка)
      const cleanTags = post.tags
        .filter(t => !TAGS_BLACKLIST.includes(t.title.toLowerCase()));
      
      // Если после фильтрации тегов не осталось, относим к категории "Объявления"
      if (cleanTags.length === 0) {
        cleanTags.push({ id: '', title: 'Объявления' });
      }
      
      // Добавляем пост во все соответствующие группы тегов
      cleanTags.forEach(tagObj => {
        const defaultName = tagObj.title.charAt(0).toUpperCase() + tagObj.title.slice(1);
        let titleName = defaultName;
        
        if (tagObj.id && tagNamesMap[tagObj.id]) {
          titleName = tagNamesMap[tagObj.id];
        }
        
        // Миграция данных прогресса со старого названия на красивое новое
        if (titleName !== defaultName && state.user_data[defaultName]) {
          if (!state.user_data[titleName]) {
            state.user_data[titleName] = state.user_data[defaultName];
            state.user_data[titleName].updatedAt = Date.now();
            delete state.user_data[defaultName];
            hasMigration = true;
          } else {
            // Если существуют оба ключа, сливаем их на основе таймстампов
            const oldData = state.user_data[defaultName];
            const newData = state.user_data[titleName];
            
            const oldTime = oldData.updatedAt || 0;
            const newTime = newData.updatedAt || 0;
            
            const mergedReadPosts = [...new Set([...(oldData.readPosts || []), ...(newData.readPosts || [])])];
            const mergedStatus = newTime >= oldTime ? newData.status : oldData.status;
            const mergedNotes = newTime >= oldTime ? (newData.notes || '') : (oldData.notes || '');
            const mergedUpdatedAt = Math.max(oldTime, newTime);
            
            state.user_data[titleName] = {
              status: mergedStatus,
              notes: mergedNotes,
              readPosts: mergedReadPosts,
              updatedAt: mergedUpdatedAt
            };
            
            delete state.user_data[defaultName];
            hasMigration = true;
          }
        }

        if (!titlesMap[titleName]) {
          titlesMap[titleName] = {
            name: titleName,
            tagId: tagObj.id,
            posts: [],
            subscriptionLevels: new Set()
          };
        }
        // Если у существующего тайтла не был сохранен ID тега (например, из-за первого поста с пустым ID), сохраняем его
        if (!titlesMap[titleName].tagId && tagObj.id) {
          titlesMap[titleName].tagId = tagObj.id;
        }
        titlesMap[titleName].posts.push(post);
        if (post.subscriptionLevel && post.subscriptionLevel.name) {
          titlesMap[titleName].subscriptionLevels.add(post.subscriptionLevel.name);
        }
      });
    });
    
    if (hasMigration) {
      saveStateToStorage();
    }
    
    // Формируем финальный массив тайтлов с подсчетом прогресса и метаданных
    return Object.values(titlesMap).map(title => {
      // Сортируем посты внутри тайтла по времени публикации (по умолчанию по возрастанию для хронологии глав)
      title.posts.sort((a, b) => a.publishTime - b.publishTime);
      
      const userTitleData = state.user_data[title.name] || { status: 'none', notes: '', readPosts: [] };
      
      // Подсчет количества просмотренных постов
      const readSet = new Set((userTitleData.readPosts || []).map(String));
      let readCount = 0;
      
      title.posts.forEach(post => {
        const isRead = readSet.has(String(post.id)) || (state.settings.syncLikes && post.isLiked);
        if (isRead) readCount++;
      });
      
      // Определяем цвет индикатора
      let statusColor = 'grey'; // По умолчанию - не начато
      if (userTitleData.status === 'dropped') {
        statusColor = 'red';
      } else if (readCount === title.posts.length && title.posts.length > 0) {
        statusColor = 'green';
      } else if (readCount > 0) {
        statusColor = 'yellow';
      }
      
      // Вычисляем является ли тайтл Новым (добавлен после нашего последнего захода)
      const isNewTitle = Array.isArray(state.newTitles) && state.newTitles.includes(title.name);
      
      // Проверяем есть ли новые главы
      const hasNewChapters = Array.isArray(state.newChapters) && state.newChapters.includes(title.name);
      
      // Определяем категорию (тир подписки) тайтла на основе подписок его постов
      let category = 'Бесплатные';
      const lowercaseName = title.name.toLowerCase();
      
      let isFullyFinished = false;
      let isVolumeFinished = false;

      // 1. Попытка определить по примечанию (note) из описания блога
      let blogNote = '';
      if (state.blogDescriptionLinks && state.blogDescriptionLinks.length > 0) {
        const match = state.blogDescriptionLinks.find(link => 
          link.title.toLowerCase().trim() === title.name.toLowerCase().trim() ||
          (title.posts.length > 0 && link.url.includes(title.posts[0].id))
        );
        if (match && match.note) {
          blogNote = match.note.toLowerCase();
        }
      }

      if (blogNote) {
        if (blogNote.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(blogNote) || blogNote.includes('🔥')) {
          if (blogNote.includes('том')) {
            isVolumeFinished = true;
          } else {
            isFullyFinished = true;
          }
        }
      }

      // 2. Проверка самого имени тайтла
      if (!isFullyFinished && !isVolumeFinished) {
        if (lowercaseName.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(lowercaseName)) {
          if (lowercaseName.includes('том')) {
            isVolumeFinished = true;
          } else {
            isFullyFinished = true;
          }
        }
      }

      // 3. Проверка заголовка последнего поста (игнорируя одиночные смайлики 🔥)
      if (!isFullyFinished && !isVolumeFinished && title.posts.length > 0) {
        const lastPost = title.posts[title.posts.length - 1];
        const pTitle = lastPost.title.toLowerCase();
        if (pTitle.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(pTitle)) {
          if (pTitle.includes('том')) {
            isVolumeFinished = true;
          } else {
            isFullyFinished = true;
          }
        }
      }

      if (lowercaseName === 'объявления') {
        category = 'Объявления';
      } else if (lowercaseName.includes('только для девушек') || lowercaseName.includes('охотник на охотника')) {
        category = 'Только для девушек';
      } else if (lowercaseName.includes('пик боевых искусств') || title.subscriptionLevels.has('Любители пика💥')) {
        category = 'Любители пика💥';
      } else if (title.subscriptionLevels.has('Любитель ютуба')) {
        category = 'Любитель ютуба';
      } else if (title.subscriptionLevels.has('Любитель манги😈')) {
        category = 'Любитель манги😈';
      } else if (title.subscriptionLevels.has('Лисямбы🦊')) {
        category = 'Лисямбы🦊';
      } else if (title.subscriptionLevels.has('Массонский орден шейхов💎')) {
        category = 'Массонский орден шейхов💎';
      } else if (title.subscriptionLevels.size > 0) {
        category = Array.from(title.subscriptionLevels)[0];
      }
      
      // Автоматическое присвоение статуса "Завершено" или "Смотрю" на основе прогресса
      let currentStatus = userTitleData.status || 'none';
      if (isFullyFinished && readCount === title.posts.length && title.posts.length > 0 && (currentStatus === 'none' || currentStatus === 'watching')) {
        currentStatus = 'completed';
        if (!state.user_data[title.name]) {
          state.user_data[title.name] = { status: 'completed', notes: '', readPosts: [], updatedAt: 0 };
        } else {
          state.user_data[title.name].status = 'completed';
        }
        hasMigration = true;
      } else if (currentStatus === 'none' && readCount > 1) {
        currentStatus = 'watching';
        if (!state.user_data[title.name]) {
          state.user_data[title.name] = { status: 'watching', notes: '', readPosts: [], updatedAt: 0 };
        } else {
          state.user_data[title.name].status = 'watching';
        }
        hasMigration = true;
      }
      
      return {
        ...title,
        status: currentStatus,
        notes: userTitleData.notes || '',
        readPosts: userTitleData.readPosts || [],
        readCount,
        statusColor,
        isNewTitle,
        hasNewChapters,
        category,
        isFullyFinished,
        isVolumeFinished
      };
    });
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
  checkAndTriggerOpenChat,
  syncActiveTitleFromUrl,
  getWebDavOrigin,
  requestWebDavPermission,
  BLOG_SLUG,
  TAGS_BLACKLIST,
  TAB_NAMES
};
