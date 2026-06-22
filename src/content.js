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
      if (devReactionsIntervalId) {
        clearInterval(devReactionsIntervalId);
        devReactionsIntervalId = null;
      }
      window.removeEventListener('mouseleave', handleReactionLeave, true);
      window.removeEventListener('mouseout', handleReactionLeave, true);
      window.removeEventListener('pointerleave', handleReactionLeave, true);
      window.removeEventListener('pointerout', handleReactionLeave, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('scroll', handleDevScroll, { passive: true });
      if (devScrollTimeout) {
        clearTimeout(devScrollTimeout);
        devScrollTimeout = null;
      }
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

    if (DEV) {
      const devBtn = document.getElementById('lf-dev-trigger-btn');
      const devSidebar = document.getElementById('lf-dev-sidebar');
      if (devBtn) devBtn.remove();
      if (devSidebar) devSidebar.remove();
    }

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
    const devBtn = DEV ? document.getElementById('lf-dev-trigger-btn') : null;
    const devSidebar = DEV ? document.getElementById('lf-dev-sidebar') : null;
    
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
          if (devBtn) devBtn.style.display = devSidebarOpen ? 'none' : '';
          if (devSidebar) {
            devSidebar.style.display = '';
            if (devSidebarOpen) {
              devSidebar.classList.add('lf-open');
            } else {
              devSidebar.classList.remove('lf-open');
            }
          }
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
        if (devBtn) devBtn.style.display = 'none';
        if (devSidebar) {
          devSidebar.style.display = 'none';
          devSidebar.classList.remove('lf-open');
        }
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
    // Внедряем зависимости в sync.js (UI-рендер, группировка тайтлов, dev-настройки, обработчики)
    setSyncDeps({
      render, renderListContent, renderSettingsContent, showNotification,
      getGroupedTitles, getGroupedTitlesInternal, devSettings, eventHandlers
    });
    // Внедряем зависимости в ui/sidebar.js (группировка, прогресс плеера, dev-эффекты, реакции Boosty)
    setSidebarDeps({
      getGroupedTitles, getPlayerProgressForPost, applyDevSettingsEffects,
      sendBoostyReaction, removeBoostyReaction, formatSyncDate, devSettings
    });
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

  // -------------------------------------------------------------
  // ЛОГИКА АВТОЗАПОМИНАНИЯ ВРЕМЕНИ ВОСПРОИЗВЕДЕНИЯ ПЛЕЕРА
  // -------------------------------------------------------------
  
  // Рекурсивный поиск родительского элемента с поддержкой прохода сквозь границы Shadow DOM
  function getClosestElement(element, selector) {
    let current = element;
    while (current) {
      if (current instanceof Element && current.matches(selector)) {
        return current;
      }
      let parent = current.parentElement;
      if (!parent) {
        const root = current.getRootNode();
        if (root && root instanceof ShadowRoot) {
          parent = root.host;
        }
      }
      current = parent;
    }
    return null;
  }

  // Получение ID поста, в котором находится плеер
  function getPostIdForPlayer(player) {
    const postNode = getClosestElement(player, '[class*="Post-scss--module_root"]');
    if (postNode) {
      const link = postNode.querySelector('a[href*="/posts/"]');
      if (link) {
        const match = link.href.match(/posts\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      }
    }
    const urlMatch = window.location.pathname.match(/posts\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }

  // Получение прогресса плеера для конкретного поста
  function getPlayerProgressForPost(postId) {
    if (!state.playerTimestamps) return null;
    for (const key in state.playerTimestamps) {
      const entry = state.playerTimestamps[key];
      if (entry && typeof entry === 'object' && entry.postId === postId) {
        return entry;
      }
      if (key === `video_post_${postId}`) {
        if (typeof entry === 'number') {
          return { time: entry };
        } else if (typeof entry === 'object') {
          return entry;
        }
      }
    }
    return null;
  }

  // Обновление прогресса главы в интерфейсе сайдбара
  function updateChapterProgressInUI(postId, time, duration) {
    const checkbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postId}"]`);
    if (!checkbox) return;
    const row = checkbox.closest('.lf-chapter-row');
    if (!row) return;
    
    const container = row.querySelector('.lf-chapter-title-container');
    if (!container) return;
    
    let progressEl = container.querySelector('.lf-chapter-player-progress');
    const timeStr = formatSeconds(time);
    const durationStr = duration > 0 ? formatSeconds(duration) : null;
    const text = durationStr ? t('player_progress_watched', timeStr, durationStr) : t('player_progress_stopped', timeStr);
    
    if (progressEl) {
      progressEl.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
        ${text}
      `;
    } else {
      progressEl = document.createElement('span');
      progressEl.className = 'lf-chapter-player-progress';
      progressEl.title = t('player_progress_tooltip');
      progressEl.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
        ${text}
      `;
      container.appendChild(progressEl);
    }

    if (checkbox.checked) {
      progressEl.style.display = 'none';
    } else {
      progressEl.style.display = '';
    }
  }

  // Получение уникального ключа плеера
  function getPlayerUniqueId(player) {
    if (player.tagName === 'AUDIO') {
      const src = player.getAttribute('src');
      if (src) {
        try {
          const url = new URL(src);
          return 'audio_' + url.pathname.split('/').pop();
        } catch (e) {
          return 'audio_' + src;
        }
      }
    } else if (player.tagName === 'VIDEO') {
      const playerWrapper = getClosestElement(player, '.player-wrapper, [class*="VideoPlayer_root"], [data-video-id], vk-video-player');
      if (playerWrapper) {
        const videoId = playerWrapper.getAttribute('data-video-id');
        if (videoId) return 'video_' + videoId;
      }
      const postNode = getClosestElement(player, '[class*="Post-scss--module_root"]');
      if (postNode) {
        const link = postNode.querySelector('a[href*="/posts/"]');
        if (link) {
          const match = link.href.match(/posts\/([a-zA-Z0-9_-]+)/);
          if (match) return 'video_post_' + match[1];
        }
      }
      const src = player.getAttribute('src');
      if (src) return 'video_src_' + src;
    }
    return null;
  }

  // Настройка слушателей на конкретный плеер
  function trackPlayerProgress(player) {
    if (!state.settings.savePlayerTime) return;

    setTimeout(() => {
      const uniqueId = getPlayerUniqueId(player);
      if (!uniqueId) return;

      const saved = state.playerTimestamps[uniqueId];
      let savedTime = null;
      if (saved) {
        if (typeof saved === 'number') {
          savedTime = saved;
        } else if (typeof saved === 'object' && typeof saved.time === 'number') {
          savedTime = saved.time;
        }
      }
      if (savedTime !== null && typeof savedTime === 'number') {
        if (player.currentTime < 1) {
          player.currentTime = savedTime;
        }
      }

      let previouslySavedTimestamp = savedTime || 0;

      const saveTimestamp = () => {
        if (!state.settings.savePlayerTime) return;
        
        const currentTimestamp = player.currentTime;
        const duration = player.duration;
        
        if (duration <= 60) return;
        if (Math.abs(currentTimestamp - previouslySavedTimestamp) < 10) return;
        if (currentTimestamp <= 10 || (duration && duration - currentTimestamp <= 10)) return;

        const postId = getPostIdForPlayer(player);

        state.playerTimestamps[uniqueId] = {
          time: currentTimestamp,
          duration: duration,
          postId: postId,
          updatedAt: Date.now()
        };
        previouslySavedTimestamp = currentTimestamp;
        saveStateToStorage();
        if (postId) {
          updateChapterProgressInUI(postId, currentTimestamp, duration);
        }
      };

      player.addEventListener('timeupdate', saveTimestamp);
      player.addEventListener('pause', saveTimestamp);
      
      player.addEventListener('ended', () => {
        if (!state.settings.savePlayerTime) return;
        if (state.playerTimestamps[uniqueId]) {
          delete state.playerTimestamps[uniqueId];
          saveStateToStorage();
        }
        const postId = getPostIdForPlayer(player);
        if (postId) {
          const checkbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postId}"]`);
          if (checkbox) {
            const row = checkbox.closest('.lf-chapter-row');
            if (row) {
              const progressEl = row.querySelector('.lf-chapter-player-progress');
              if (progressEl) progressEl.remove();
            }
          }
        }
      });
    }, 1000);
  }

  /**
   * Выбирает нужное разрешение из списка li.item-quality внутри playerWrapper.
   * @param {HTMLElement} playerWrapper - Обертка плеера (.player-wrapper) из Shadow DOM
   * @param {string} targetQuality - Целевое качество (например, "1080p")
   * @returns {boolean} true если качество успешно установлено
   */
  function selectQualityOption(playerWrapper, targetQuality) {
    const itemQualities = playerWrapper.querySelectorAll('li.item-quality');
    
    if (itemQualities.length === 0) {
      return false;
    }

    // Ищем элемент с нужным качеством и кликаем по нему
    for (const qualityEl of itemQualities) {
      if (qualityEl.dataset.value === targetQuality) {
        console.info(`[Boosty Bookmark] Установлено качество: ${targetQuality}`);
        qualityEl.click();
        return true;
      }
    }

    // Если точное совпадение не найдено, выбираем первый доступный вариант (обычно максимальный)
    const fallbackEl = itemQualities[0];
    console.info(`[Boosty Bookmark] Качество ${targetQuality} недоступно. Выбрано: ${fallbackEl.dataset.value}`);
    fallbackEl.click();
    return true;
  }

  /**
   * Находит пункт меню «Качество» в настройках плеера и кликает по нему,
   * чтобы открыть подменю с вариантами разрешения.
   * В новом VK-плеере меню двухуровневое:
   *   1) li.item с текстом «Качество» / «Quality» → клик открывает подменю
   *   2) li.item-quality[data-value="1080p"] → непосредственный выбор качества
   * @param {HTMLElement} playerWrapper - Обертка плеера (.player-wrapper) из Shadow DOM
   * @returns {boolean} true если пункт «Качество» найден и кликнут
   */
  function openQualitySubmenu(playerWrapper) {
    const allItems = playerWrapper.querySelectorAll('li.item');
    for (const item of allItems) {
      const text = (item.innerText || '').toLowerCase();
      if (text.includes('качество') || text.includes('quality')) {
        item.click();
        return true;
      }
    }
    return false;
  }

  /**
   * Принудительно устанавливает качество видео: открывает подменю → выбирает разрешение.
   * Поддерживает как старый формат VK-плеера (li.item-quality сразу в DOM),
   * так и новый двухуровневый (li.item «Качество» → подменю li.item-quality).
   * @param {HTMLElement} playerWrapper - Обертка плеера (.player-wrapper) из Shadow DOM
   * @param {string} targetQuality - Целевое качество (например, "1080p")
   */
  function forceVideoQuality(playerWrapper, targetQuality) {
    // Попытка 1: Старый формат — li.item-quality уже в DOM (как в старом VK-плеере)
    if (selectQualityOption(playerWrapper, targetQuality)) {
      return;
    }

    // Попытка 2: Новый формат — нужно открыть подменю «Качество»
    if (!openQualitySubmenu(playerWrapper)) {
      console.warn('[Boosty Bookmark] Пункт меню «Качество» не найден в настройках плеера.');
      return;
    }

    // Ждём появления li.item-quality после открытия подменю
    let attempts = 0;
    const maxAttempts = 30; // 3 секунды (30 × 100мс)
    const interval = setInterval(() => {
      attempts++;
      if (selectQualityOption(playerWrapper, targetQuality)) {
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        console.warn('[Boosty Bookmark] Качество не установлено: элементы li.item-quality не появились после открытия подменю.');
        clearInterval(interval);
      }
    }, 100);
  }

  /**
   * Инициализирует слежение за плеером и вешает триггер на клик
   * @param {HTMLElement} shadowRootContainer - Контейнер .shadow-root-container веб-компонента
   * @param {string} targetQuality - Целевое качество видео
   */
  function setupVideoPlayerQuality(shadowRootContainer, targetQuality) {
    const shadowRoot = shadowRootContainer.shadowRoot;
    if (!shadowRoot) {
      console.warn('[Boosty Bookmark] shadowRoot не найден в контейнере плеера.');
      return;
    }

    const attachClickListener = () => {
      const playerWrapper = shadowRoot.querySelector('div.player-wrapper');
      const clickTarget = shadowRoot.querySelector('div.player-wrapper div.container');

      if (!playerWrapper || !clickTarget) {
        return false;
      }

      // Вешаем однократный клик — при первом клике пользователя запускаем установку качества
      clickTarget.addEventListener('click', () => {
        // Даём плееру время инициализировать меню настроек после старта воспроизведения
        setTimeout(() => {
          forceVideoQuality(playerWrapper, targetQuality);
        }, 300);
      }, { once: true });

      shadowRootContainer.dataset.lfQualityInjected = 'true';
      return true;
    };

    // Пробуем подключиться сразу
    if (attachClickListener()) return;

    // Если элементы еще не отрендерились внутри shadowRoot, следим за изменениями
    const observer = new MutationObserver((mutations, obs) => {
      if (attachClickListener()) {
        obs.disconnect();
      }
    });

    observer.observe(shadowRoot, {
      childList: true,
      subtree: true
    });
  }

  // Поиск новых плееров на странице
  function initPlayerTracking() {
    if (state.settings.savePlayerTime) {
      const mediaPlayers = document.querySelectorAll('audio, video');
      mediaPlayers.forEach(player => {
        if (!player.dataset.lfTracked) {
          player.dataset.lfTracked = 'true';
          trackPlayerProgress(player);
        }
      });
    }

    const vkPlayerContainers = document.querySelectorAll('vk-video-player .shadow-root-container');
    vkPlayerContainers.forEach(container => {
      // Инициализация сохранения прогресса для видео
      if (state.settings.savePlayerTime && !container.dataset.lfTracked) {
        if (container.shadowRoot) {
          const shadowVideo = container.shadowRoot.querySelector('video');
          if (shadowVideo) {
            container.dataset.lfTracked = 'true';
            shadowVideo.dataset.lfTracked = 'true';
            trackPlayerProgress(shadowVideo);
          }
        }
      }

      // Инициализация принудительного качества видео
      if (state.settings.forceVideoQuality && container.dataset.lfQualityInjected !== 'true') {
        const targetQuality = state.settings.videoQuality || '1080p';
        setupVideoPlayerQuality(container, targetQuality);
      }
    });
  }

  // --- DevTools (dev-only). Вызовы гейтятся через if (DEV); в релизе вырезается tree-shaking'ом ---
  let devSettings = {
    enabled: false,
    cutoffDate: '',
    hideAboutAuthor: true,
    alwaysShowReactions: true
  };

  function loadDevSettings() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.get(['lf_dev_settings'], (res) => {
          if (chrome.runtime.lastError) { resolve(); return; }
          const saved = res['lf_dev_settings'] || {};
          devSettings.enabled = saved.enabled !== undefined ? !!saved.enabled : false;
          devSettings.cutoffDate = saved.cutoffDate || '';
          devSettings.hideAboutAuthor = saved.hideAboutAuthor !== undefined ? !!saved.hideAboutAuthor : true;
          devSettings.alwaysShowReactions = saved.alwaysShowReactions !== undefined ? !!saved.alwaysShowReactions : true;
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function saveDevSettings() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.set({ 'lf_dev_settings': devSettings }, () => {
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  let devSidebarOpen = true;
  let devReactionsIntervalId = null;

  function isReactionElement(el) {
    if (!el) return false;
    let current = el;
    while (current && current !== document.body) {
      if (current.getAttribute && current.getAttribute('data-test-id') === 'COMMON_REACTIONS_REACTIONSPOST:ROOT') {
        return true;
      }
      if (current.classList && (
        Array.from(current.classList).some(cls => 
          cls.includes('ReactionSelector') || 
          cls.includes('TooltipContent') || 
          cls.includes('ReactionsPost') || 
          cls.includes('ReactionButton') ||
          cls.includes('Reaction')
        )
      )) {
        return true;
      }
      if (current.getAttribute && current.getAttribute('role') === 'tooltip') {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function handleReactionLeave(e) {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      if (isReactionElement(e.target) || isReactionElement(e.relatedTarget) || e.relatedTarget === null || e.toElement === null) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }
  }

  function handleGlobalClick(e) {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      setTimeout(autoOpenReactions, 150);
    }
  }

  let devScrollTimeout = null;

  function handleDevScroll() {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      if (devScrollTimeout) clearTimeout(devScrollTimeout);
      devScrollTimeout = setTimeout(autoOpenReactions, 150);
    }
  }

  function isPopoverOpenForBtn(btn) {
    // 1. Проверка по aria-describedby
    const popoverHolder = btn.hasAttribute('aria-describedby') ? btn : btn.querySelector('[aria-describedby]');
    const popoverId = popoverHolder ? popoverHolder.getAttribute('aria-describedby') : null;
    if (popoverId && document.getElementById(popoverId)) {
      return true;
    }

    // 2. Геометрическая проверка (поиск по близости открытого попапа в DOM)
    const popover = document.querySelector('[class*="ReactionSelector"], [class*="TooltipContent"]');
    if (!popover) return false;

    const btnRect = btn.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    const btnCenterX = btnRect.left + btnRect.width / 2;
    const popoverCenterX = popoverRect.left + popoverRect.width / 2;
    const distanceX = Math.abs(btnCenterX - popoverCenterX);

    // Если попап по горизонтали близко (в пределах 150px) и по вертикали рядом (в пределах 120px)
    if (distanceX < 150 && Math.abs(btnRect.top - popoverRect.bottom) < 120) {
      return true;
    }

    return false;
  }

  function autoOpenReactions() {
    if (typeof devSettings === 'undefined' || !devSettings.alwaysShowReactions) return;

    const reactionBtns = Array.from(document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]'));
    if (reactionBtns.length === 0) return;

    let bestBtn = null;
    let minDistance = Infinity;
    const centerY = window.innerHeight / 2;

    reactionBtns.forEach(btn => {
      const rect = btn.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const btnCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(btnCenterY - centerY);
        if (distance < minDistance) {
          minDistance = distance;
          bestBtn = btn;
        }
      }
    });

    if (bestBtn) {
      const isOpen = isPopoverOpenForBtn(bestBtn);

      if (!isOpen) {
        // Мягко закрываем другие поповеры на странице
        reactionBtns.forEach(btn => {
          if (btn !== bestBtn) {
            const evt = new MouseEvent('mouseleave', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            btn.dispatchEvent(evt);
          }
        });

        // Открываем активный поповер
        const events = ['pointerenter', 'pointerover', 'mouseenter', 'mouseover'];
        events.forEach(evtName => {
          const evt = new MouseEvent(evtName, {
            bubbles: true,
            cancelable: true,
            view: window
          });
          bestBtn.dispatchEvent(evt);
        });
      }
    }
  }

  function applyDevSettingsEffects() {
    if (devSettings.hideAboutAuthor) {
      document.body.classList.add('lf-dev-hide-about-author');
    } else {
      document.body.classList.remove('lf-dev-hide-about-author');
    }

    if (devSettings.alwaysShowReactions) {
      document.body.classList.add('lf-dev-always-show-reactions');
      
      window.removeEventListener('mouseleave', handleReactionLeave, true);
      window.removeEventListener('mouseout', handleReactionLeave, true);
      window.removeEventListener('pointerleave', handleReactionLeave, true);
      window.removeEventListener('pointerout', handleReactionLeave, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('scroll', handleDevScroll, { passive: true });
      
      window.addEventListener('mouseleave', handleReactionLeave, true);
      window.addEventListener('mouseout', handleReactionLeave, true);
      window.addEventListener('pointerleave', handleReactionLeave, true);
      window.addEventListener('pointerout', handleReactionLeave, true);
      window.addEventListener('click', handleGlobalClick, true);
      window.addEventListener('scroll', handleDevScroll, { passive: true });

      if (!devReactionsIntervalId) {
        devReactionsIntervalId = setInterval(autoOpenReactions, 1000);
      }
      autoOpenReactions();
    } else {
      document.body.classList.remove('lf-dev-always-show-reactions');
      
      if (devReactionsIntervalId) {
        clearInterval(devReactionsIntervalId);
        devReactionsIntervalId = null;
      }
      
      window.removeEventListener('mouseleave', handleReactionLeave, true);
      window.removeEventListener('mouseout', handleReactionLeave, true);
      window.removeEventListener('pointerleave', handleReactionLeave, true);
      window.removeEventListener('pointerout', handleReactionLeave, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('scroll', handleDevScroll, { passive: true });
      
      if (devScrollTimeout) {
        clearTimeout(devScrollTimeout);
        devScrollTimeout = null;
      }

      document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]').forEach(btn => {
        const evt = new MouseEvent('mouseleave', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(evt);
      });
    }
  }

  function initDevTools() {
    createDevTriggerButton();
    createDevSidebar();
    applyDevSettingsEffects();
  }

  function createDevTriggerButton() {
    if (document.getElementById('lf-dev-trigger-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'lf-dev-trigger-btn';
    btn.title = 'DevTools - Панель разработчика';
    btn.innerHTML = '🛠️';
    if (devSidebarOpen) {
      btn.style.display = 'none';
    }

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      devSidebarOpen = !devSidebarOpen;
      const devSidebar = document.getElementById('lf-dev-sidebar');
      if (devSidebar) {
        if (devSidebarOpen) {
          devSidebar.classList.add('lf-open');
          btn.style.display = 'none';
          renderDevSidebarContent();
        } else {
          devSidebar.classList.remove('lf-open');
        }
      }
    });

    document.body.appendChild(btn);
  }

  function createDevSidebar() {
    if (document.getElementById('lf-dev-sidebar')) return;

    const devSidebar = document.createElement('div');
    devSidebar.id = 'lf-dev-sidebar';
    devSidebar.className = 'lf-dark';
    if (devSidebarOpen) {
      devSidebar.classList.add('lf-open');
    }

    devSidebar.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.body.appendChild(devSidebar);
    if (devSidebarOpen) {
      renderDevSidebarContent();
    }
  }

  function renderDevSidebarContent() {
    const devSidebar = document.getElementById('lf-dev-sidebar');
    if (!devSidebar) return;

    const totalPosts = state.posts.length;
    let newestPostDate = 'Нет постов';
    if (totalPosts > 0) {
      const ts = state.posts[0].publishTime;
      newestPostDate = formatSyncDate(ts * 1000);
    }

    devSidebar.innerHTML = `
      <div class="lf-dev-header">
        <h3>Boosty Bookmark DevTools</h3>
        <span class="lf-dev-close">×</span>
      </div>
      <div class="lf-dev-body">
        <div class="lf-dev-section">
          <h4>📊 Статистика</h4>
          <p>Постов в базе: <strong>${totalPosts}</strong></p>
          <p>Последний пост: <small>${newestPostDate}</small></p>
        </div>
        
        <div class="lf-dev-section">
          <h4>📅 Эмуляция даты канала</h4>
          <div class="lf-dev-row">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-enabled" ${devSettings.enabled ? 'checked' : ''}>
              Включить эмуляцию
            </label>
          </div>
          <div class="lf-dev-row">
            <label style="display: block; margin-bottom: 4px;">Дата отсечки:</label>
            <input type="date" id="lf-dev-cutoff-date" style="width: 100%; padding: 6px; box-sizing: border-box; background-color: #2a2a2a; color: #ffffff; border: 1px solid #444; border-radius: 4px; color-scheme: dark;" value="${devSettings.cutoffDate || ''}">
          </div>
          <div class="lf-dev-row" style="margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-hide-about-author" ${devSettings.hideAboutAuthor ? 'checked' : ''}>
              Скрыть блок «Об авторе»
            </label>
          </div>
          <div class="lf-dev-row" style="margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-always-show-reactions" ${devSettings.alwaysShowReactions ? 'checked' : ''}>
              Всегда раскрывать лайки (меню реакций)
            </label>
          </div>
          <button id="lf-dev-save-btn" class="lf-dev-btn">Сохранить настройки</button>
        </div>

        <div class="lf-dev-section">
          <h4>✂️ Очистка базы данных</h4>
          <button id="lf-dev-crop-btn" class="lf-dev-btn lf-dev-btn-danger">Обрезать посты новее даты</button>
          <p class="lf-dev-help">Удаляет из локальной базы все посты, которые были опубликованы позже выбранной даты отсечки.</p>
        </div>
      </div>
    `;

    devSidebar.querySelector('.lf-dev-close').addEventListener('click', () => {
      devSidebarOpen = false;
      devSidebar.classList.remove('lf-open');
      const devBtn = document.getElementById('lf-dev-trigger-btn');
      if (devBtn) {
        devBtn.style.display = '';
      }
    });

    devSidebar.querySelector('#lf-dev-save-btn').addEventListener('click', async () => {
      const enabledCheckbox = document.getElementById('lf-dev-enabled');
      const cutoffInput = document.getElementById('lf-dev-cutoff-date');
      const hideAboutAuthorCheckbox = document.getElementById('lf-dev-hide-about-author');
      const alwaysShowReactionsCheckbox = document.getElementById('lf-dev-always-show-reactions');
      
      devSettings.enabled = enabledCheckbox.checked;
      devSettings.cutoffDate = cutoffInput.value;
      devSettings.hideAboutAuthor = hideAboutAuthorCheckbox.checked;
      devSettings.alwaysShowReactions = alwaysShowReactionsCheckbox.checked;
      
      if (devSettings.enabled && devSettings.cutoffDate) {
        const cutoffTimeMs = new Date(devSettings.cutoffDate).getTime();
        if (!state.lastVisit || state.lastVisit > cutoffTimeMs) {
          state.lastVisit = cutoffTimeMs - 24 * 60 * 60 * 1000;
        }
      } else {
        state.lastVisit = Date.now();
      }
      state.newTitles = [];
      state.newChapters = [];
      await saveStateToStorage();
      
      await saveDevSettings();
      applyDevSettingsEffects();
      showNotification('Настройки DevTools сохранены!');
      renderDevSidebarContent();
      render(); // перерисовать, чтобы обновить списки во вкладках
      
      // Автоматически запускаем синхронизацию для применения новых настроек отсечки
      performIncrementalSync();
    });

    devSidebar.querySelector('#lf-dev-crop-btn').addEventListener('click', async () => {
      const cutoffInput = document.getElementById('lf-dev-cutoff-date');
      const dateVal = cutoffInput.value;
      if (!dateVal) {
        showNotification('Укажите дату отсечки!');
        return;
      }

      if (!confirm(`Вы уверены, что хотите удалить все локальные посты новее ${dateVal}?`)) {
        return;
      }

      const cutoffTime = new Date(dateVal).getTime() / 1000;
      const originalCount = state.posts.length;
      state.posts = state.posts.filter(p => p.publishTime <= cutoffTime);
      const deletedCount = originalCount - state.posts.length;

      state.collapsedGroups = {};
      
      await saveStateToStorage();
      render();
      renderDevSidebarContent();
      showNotification(`Успешно удалено ${deletedCount} постов!`);
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
