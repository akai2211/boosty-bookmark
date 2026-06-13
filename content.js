/* content.js - Помощник по отслеживанию озвучек на Boosty (Boosty Bookmark) */

(function () {
  'use strict';

  const BLOG_SLUG = 'lightfoxmanga';
  const STORAGE_KEY = `lf_state_${BLOG_SLUG}`;
  
  // Черный список служебных тегов (будут отфильтрованы, чтобы оставить только названия произведений)
  const TAGS_BLACKLIST = [
    'халява', 'новости', 'хайлайты', 'важное', 'инфо', 
    'объявление', 'анонс', 'опрос', 'стрим', 'аудио', 
    'важная новость', 'новости канала'
  ];

  // Маппинг ключей вкладок и их человекочитаемых названий
  const TAB_NAMES = {
    watching: 'Смотрю',
    favorite: 'Избранное',
    new: 'Новые',
    all: 'Все',
    completed: 'Завершено',
    dropped: 'Брошено'
  };

  // SVG-путь иконки закладки с вырезом молнии (из предоставленного icon_bookmark.svg)
  const FOX_SVG_PATH = 'm 449.33103,227.39685 c -93.47739,12.30945 -177.5177,75.47424 -199.34875,170.57556 -9.05219,39.43347 -6.65125,79.80127 -6.65125,120 v 177 576.99989 148 c 0,65.3083 0.80237,127.0457 39.72067,183 11.02829,15.8558 23.76486,30.0051 38.27933,42.7137 79.87112,69.9338 186.64221,56.2863 285,56.2863 h 603.99997 193 c 37.6091,0 76.8356,3.2046 114,-3.25 94.1128,-16.3453 171.1193,-87.6373 188.3859,-182.75 6.5241,-35.9384 3.6141,-73.6106 3.6141,-110 v -182 -574.99989 -142 c 0,-69.06458 -1.4198,-133.61938 -45.6512,-191 -33.4875,-43.4425 -82.4043,-74.6156 -136.3488,-85.19604 -26.0959,-5.11841 -52.5424,-3.80396 -79,-3.80396 h -113 -593.99997 -194 c -31.89502,0 -66.39502,-3.73743 -98,0.42444 m 479,277.57556 c -4.19348,31.14209 -17.15967,62.73059 -25.57562,93 -20.00556,71.95325 -40.05237,143.91418 -59.57563,216 -9.03759,33.36951 -22.81817,67.80933 -27.84875,102 31.64606,3.99976 67.11499,0.92517 99.15509,0.41052 8.62061,-0.13843 17.21741,-0.41052 25.84491,-0.41052 2.8111,0 8.04181,-0.94824 10.35724,1.02771 3.18716,2.71997 -1.16272,13.48547 -1.93286,16.97229 -3.76038,17.0249 -7.94959,33.9554 -11.63428,51 -9.81061,45.38129 -19.96698,90.82299 -30.67438,135.99989 -5.82824,24.5906 -15.02759,51.7207 -16.11572,77 h 1 c 7.42847,-19.6268 22.79169,-39.1743 33.94983,-57 19.49951,-31.1512 38.26907,-62.7593 57.62577,-93.9999 C 1035.0622,962.79591 1082.9873,875.07763 1138.331,792.97241 H 997.33103 c 3.97597,-26.9209 17.05487,-55.16479 25.66657,-81 13.9656,-41.89685 27.0359,-84.10767 41,-126 8.8993,-26.69788 20.0413,-53.55396 26.3334,-81 h 88 c 38.6637,0 74.6827,-0.6571 99.8418,34 17.4697,24.06494 16.1582,50.74219 16.1582,79 v 112 479.99989 140 c 0,18.969 4.0719,43.3505 -9.213,59 -33.6935,39.6906 -74.3377,-10.3145 -98.787,-33.0895 -45.8551,-42.7148 -90.7083,-86.6412 -136,-129.9498 -26.2277,-25.0792 -50.1609,-51.5906 -89.99997,-42.4607 -27.67371,6.3419 -46.36359,31.6841 -66,50.4607 -40.21271,38.4519 -81.17474,76.2042 -121,115.0539 -21.70685,21.1751 -45.81311,55.4526 -79,53.9461 -41.8233,-1.8987 -36,-52.2362 -36,-80.9607 V 1074.9724 676.97241 c 0,-46.49805 -12.92981,-116.45947 27.00385,-150.56104 27.76306,-23.70837 58.68829,-21.43896 92.99615,-21.43896 z';

  // SVG-путь внешнего оранжевого скругленного квадрата (плашки) для создания маски отсечения (clip-path)
  const PLATE_SVG_PATH = 'm 449.33103,227.39685 c -93.47739,12.30945 -177.5177,75.47424 -199.34875,170.57556 -9.05219,39.43347 -6.65125,79.80127 -6.65125,120 v 177 576.99989 148 c 0,65.3083 0.80237,127.0457 39.72067,183 11.02829,15.8558 23.76486,30.0051 38.27933,42.7137 79.87112,69.9338 186.64221,56.2863 285,56.2863 h 603.99997 193 c 37.6091,0 76.8356,3.2046 114,-3.25 94.1128,-16.3453 171.1193,-87.6373 188.3859,-182.75 6.5241,-35.9384 3.6141,-73.6106 3.6141,-110 v -182 -574.99989 -142 c 0,-69.06458 -1.4198,-133.61938 -45.6512,-191 -33.4875,-43.4425 -82.4043,-74.6156 -136.3488,-85.19604 -26.0959,-5.11841 -52.5424,-3.80396 -79,-3.80396 h -113 -593.99997 -194 c -31.89502,0 -66.39502,-3.73743 -98,0.42444 z';

  // SVG-путь силуэта закладки с вырезанной молнией
  const BOOKMARK_SVG_PATH = 'M 928.33103,504.97241 c -4.19348,31.14209 -17.15967,62.73059 -25.57562,93 -20.00556,71.95325 -40.05237,143.91418 -59.57563,216 -9.03759,33.36951 -22.81817,67.80933 -27.84875,102 31.64606,3.99976 67.11499,0.92517 99.15509,0.41052 8.62061,-0.13843 17.21741,-0.41052 25.84491,-0.41052 2.8111,0 8.04181,-0.94824 10.35724,1.02771 3.18716,2.71997 -1.16272,13.48547 -1.93286,16.97229 -3.76038,17.0249 -7.94959,33.9554 -11.63428,51 -9.81061,45.38129 -19.96698,90.82299 -30.67438,135.99989 -5.82824,24.5906 -15.02759,51.7207 -16.11572,77 h 1 c 7.42847,-19.6268 22.79169,-39.1743 33.94983,-57 19.49951,-31.1512 38.26907,-62.7593 57.62577,-93.9999 C 1035.0622,962.79591 1082.9873,875.07763 1138.331,792.97241 H 997.33103 c 3.97597,-26.9209 17.05487,-55.16479 25.66657,-81 13.9656,-41.89685 27.0359,-84.10767 41,-126 8.8993,-26.69788 20.0413,-53.55396 26.3334,-81 h 88 c 38.6637,0 74.6827,-0.6571 99.8418,34 17.4697,24.06494 16.1582,50.74219 16.1582,79 v 112 479.99989 140 c 0,18.969 4.0719,43.3505 -9.213,59 -33.6935,39.6906 -74.3377,-10.3145 -98.787,-33.0895 -45.8551,-42.7148 -90.7083,-86.6412 -136,-129.9498 -26.2277,-25.0792 -50.1609,-51.5906 -89.99997,-42.4607 -27.67371,6.3419 -46.36359,31.6841 -66,50.4607 -40.21271,38.4519 -81.17474,76.2042 -121,115.0539 -21.70685,21.1751 -45.81311,55.4526 -79,53.9461 -41.8233,-1.8987 -36,-52.2362 -36,-80.9607 V 1074.9724 676.97241 c 0,-46.49805 -12.92981,-116.45947 27.00385,-150.56104 27.76306,-23.70837 58.68829,-21.43896 92.99615,-21.43896 z';

  // Экранирование HTML-спецсимволов для безопасной вставки в шаблоны
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ID интервала периодической проверки URL (для возможности остановки при инвалидации контекста)
  let urlCheckIntervalId = null;
  // Хранилище ссылок на обработчики событий для их корректного удаления в cleanup()
  let eventHandlers = {};

  // Проверка, жив ли контекст расширения (не был ли он перезагружен/обновлён)
  function isExtensionContextValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Полная очистка: удаление DOM-элементов и остановка интервалов осиротевшего скрипта
  function cleanup() {
    // Останавливаем периодическую проверку URL
    if (urlCheckIntervalId) {
      clearInterval(urlCheckIntervalId);
      urlCheckIntervalId = null;
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

    lastScrolledUrl = null;
    lastScrolledPostId = null;

    try {
      sessionStorage.removeItem('lf_active_title');
      sessionStorage.removeItem('lf_active_tab');
    } catch (e) {
      // Игнорируем ошибки доступа
    }
  }

  // Глобальное состояние
  let state = {
    posts: [],          // Кэш постов с API [{id, title, publishTime, tags, subscriptionLevel, isLiked}]
    user_data: {},      // Прогресс пользователя { "Название тайтла": { status, notes, readPosts: [] } }
    lastVisit: 0,       // Время предыдущего визита
    collapsedGroups: {},// Свернутые категории { "Любителям манги": true }
    blogDescriptionLinks: [], // Ссылки из описания профиля [{url, title}]
    settings: {
      syncLikes: true,   // Учитывать лайки как просмотренное
      autoMarkOpen: false, // Автоматически помечать главу как прочитанную при открытии
      tabOrder: ['favorite', 'all', 'watching', 'new', 'completed', 'dropped'],
      zoom: 1.25,         // Коэффициент масштаба боковой панели (соответствует 100% в UI)
      zoomMigrated: true, // Флаг выполненной миграции масштаба
      sidebarOpen: false, // Состояние открытости панели (сохраняется)
      openTagsInCurrentTab: true, // Открывать теги в текущей вкладке
      openChaptersInFeed: true, // Искать и открывать главы в ленте тайтла
      titleSort: 'name_asc' // Сортировка тайтлов: 'name_asc', 'name_desc', 'new_desc', 'new_asc', 'chapters_desc', 'chapters_asc', 'progress_desc', 'progress_asc'
    },
    
    // Временное состояние интерфейса (не сохраняется в БД)
    ui: {
      activeTab: 'favorite', // 'favorite', 'watching', 'new', 'all', 'completed', 'dropped'
      previousTab: 'favorite', // Запоминает предыдущую вкладку перед переходом в настройки
      searchQuery: '',
      activeTitle: null,     // Название тайтла, открытого в детальном виде (null = список)
      sortAsc: true,         // Сортировка глав: true - сначала старые (1-10, 11-20), false - новые
      isSyncing: false,      // Флаг активного процесса загрузки всей базы
      syncProgress: 0,
      tabOrderExpanded: false // По умолчанию свернут порядок вкладок
    }
  };

  // Инициализация/получение данных пользователя для тайтла (устраняет дублирование)
  function ensureUserData(titleName) {
    if (!state.user_data[titleName]) {
      state.user_data[titleName] = { status: 'none', notes: '', readPosts: [] };
    }
    return state.user_data[titleName];
  }

  // Проверка, является ли текущая страница блогом целевого автора
  function isTargetPage() {
    const path = window.location.pathname.toLowerCase();
    return path === `/${BLOG_SLUG}` || path.startsWith(`/${BLOG_SLUG}/`);
  }

  let lastScrolledUrl = null;
  let lastScrolledPostId = null;

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

      // Ищем ссылку на этот пост в ленте
      const linkElement = document.querySelector(`a[href*="${postId}" i]`);
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

  // Управление видимостью интерфейса в зависимости от URL
  async function checkUrlAndToggleVisibility() {
    const isTarget = isTargetPage();
    const btn = document.getElementById('lf-trigger-btn');
    const sidebar = document.getElementById('lf-sidebar');
    
    if (isTarget) {
      checkAndScrollToFeed();
      checkAndScrollToPost();
      if (!btn || !sidebar) {
        // Создаем элементы интерфейса
        createSidebar();
        createTriggerButton();
        
        // Запускаем фоновую синхронизацию (проверка новых постов)
        if (state.posts.length > 0) {
          render();
          backgroundSync();
        } else {
          // Если базы вообще нет, показываем интерфейс и предлагаем запустить синхронизацию
          render();
        }
      } else {
        // Если интерфейс уже есть, просто показываем его
        btn.style.display = '';
        sidebar.style.display = '';
      }
    } else {
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
    }
  }

  // Слушатель сообщений от page_script.js (main world) для перехвата лайков и результатов DOM-кликов
  function patchFetch() {
    eventHandlers.messageHandler = (event) => {
      // Принимаем сообщения только от нашего page_script.js
      if (event.source !== window) return;
      if (!event.data) return;
      
      if (!isExtensionContextValid()) return;
      
      // Обработка перехваченного лайка/дизлайка с Boosty
      if (event.data.type === 'LF_REACTION_INTERCEPTED') {
        const { postId, isLiked } = event.data;
        console.log(`[BoostyBookmark content.js] Получено сообщение от page_script: пост ${postId}, isLiked=${isLiked}`);
        if (postId) {
          handleInterceptedReaction(postId, isLiked);
        }
      }
    };
    window.addEventListener('message', eventHandlers.messageHandler);
  }

  // Обработка перехваченного лайка/дизлайка: обновление кэша и UI
  function handleInterceptedReaction(postId, isLiked) {
    if (!isExtensionContextValid()) return;
    
    const post = state.posts.find(p => String(p.id) === String(postId));
    if (post && post.isLiked !== isLiked) {
      post.isLiked = isLiked;
      
      // Обновляем кэш в хранилище
      saveStateToStorage();
      
      // Если детальный вид тайтла открыт — обновляем чекбокс точечно, без полного ререндера
      const checkbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postId}"]`);
      if (checkbox && checkbox.checked !== isLiked) {
        checkbox.checked = isLiked;
        if (isLiked) {
          checkbox.classList.add('lf-liked-checkbox');
        } else {
          checkbox.classList.remove('lf-liked-checkbox');
        }
        
        // Обновляем счётчик прогресса в заголовке
        const activeTitleName = state.ui.activeTitle;
        if (activeTitleName) {
          const updatedManga = getGroupedTitles().find(t => t.name === activeTitleName);
          if (updatedManga) {
            const headerLabel = document.querySelector('.lf-chapters-header .lf-field-label');
            if (headerLabel) {
              headerLabel.textContent = `Список глав (${updatedManga.readCount}/${updatedManga.posts.length})`;
            }
          }
        }
      } else if (!checkbox) {
        // Если мы не в детальном виде — делаем мягкий ререндер списка для обновления индикаторов
        const bodyContent = document.getElementById('lf-body-content');
        if (bodyContent && !state.ui.activeTitle) {
          renderListContent();
        }
      }
      
      console.log(`[BoostyBookmark] Перехвачен лайк на Boosty: пост ${postId} — кэш обновлён`);
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

  // Инициализация расширения
  async function init() {
    await loadStateFromStorage();

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
      if (!isExtensionContextValid()) { cleanup(); return; }
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          const data = res[STORAGE_KEY] || {};
          data.lastVisit = Date.now();
          const update = {};
          update[STORAGE_KEY] = data;
          chrome.storage.local.set(update);
        });
      } catch (e) {
        // Контекст инвалидирован — игнорируем
      }
    };
    window.addEventListener('beforeunload', eventHandlers.beforeunload);

    // Перехват кликов по тегам на самом сайте Boosty для открытия в текущей вкладке (SPA-переход)
    eventHandlers.tagClickHandler = (e) => {
      if (!state.settings.openTagsInCurrentTab) return;
      
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

  // Загрузка состояния из chrome.storage.local
  function loadStateFromStorage() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          if (chrome.runtime.lastError) { resolve(); return; }
          const saved = res[STORAGE_KEY] || {};
           state.posts = saved.posts || [];
          state.user_data = saved.user_data || {};
          state.lastVisit = saved.lastVisit || 0;
          state.collapsedGroups = saved.collapsedGroups || {};
          state.blogDescriptionLinks = saved.blogDescriptionLinks || [];
          if (saved.settings) {
            state.settings = { ...state.settings, ...saved.settings };
            // Миграция openTagsInNewTab -> openTagsInCurrentTab
            if (saved.settings.openTagsInNewTab !== undefined && saved.settings.openTagsInCurrentTab === undefined) {
              state.settings.openTagsInCurrentTab = !saved.settings.openTagsInNewTab;
              delete state.settings.openTagsInNewTab;
              saveStateToStorage();
            }
          }
          const oldDefaultOrder1 = ['favorite', 'watching', 'new', 'all', 'completed', 'dropped'];
          const oldDefaultOrder2 = ['favorite', 'all', 'new', 'watching', 'completed', 'dropped'];
          const newDefaultOrder = ['favorite', 'all', 'watching', 'new', 'completed', 'dropped'];
          if (!state.settings.tabOrder || !Array.isArray(state.settings.tabOrder) || state.settings.tabOrder.length === 0) {
            state.settings.tabOrder = newDefaultOrder;
          } else if (JSON.stringify(state.settings.tabOrder) === JSON.stringify(oldDefaultOrder1) || 
                     JSON.stringify(state.settings.tabOrder) === JSON.stringify(oldDefaultOrder2)) {
            state.settings.tabOrder = newDefaultOrder;
            saveStateToStorage();
          }
          // Проверяем и мигрируем масштаб один раз
          if (saved.settings && saved.settings.zoom !== undefined) {
            let loadedZoom = saved.settings.zoom;
            // Если значение в старом формате целых процентов (80, 100, 125 и т.д.)
            if (typeof loadedZoom === 'number' && loadedZoom >= 10) {
              const migrationMap = {
                80: 1.0,
                90: 1.125,
                100: 1.25,
                110: 1.375,
                120: 1.5,
                130: 1.625,
                140: 1.75,
                150: 1.875,
                125: 1.25 // старый дефолт
              };
              if (migrationMap[loadedZoom] !== undefined) {
                state.settings.zoom = migrationMap[loadedZoom];
              } else {
                state.settings.zoom = 1.25;
              }
              state.settings.zoomMigrated = true;
              saveStateToStorage();
            } else {
              // Если уже коэффициент
              state.settings.zoom = loadedZoom;
              state.settings.zoomMigrated = true;
            }
          } else {
            state.settings.zoom = 1.25;
            state.settings.zoomMigrated = true;
          }
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  // Сохранение состояния в chrome.storage.local
  function saveStateToStorage() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        const data = {
          posts: state.posts,
          user_data: state.user_data,
          lastVisit: state.lastVisit,
          collapsedGroups: state.collapsedGroups,
          blogDescriptionLinks: state.blogDescriptionLinks,
          settings: state.settings
        };
        const update = {};
        update[STORAGE_KEY] = data;
        chrome.storage.local.set(update, () => {
          if (chrome.runtime.lastError) { resolve(); return; }
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  // Экспорт прогресса пользователя в файл JSON
  function exportUserData() {
    try {
      const dataToExport = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        user_data: state.user_data,
        settings: state.settings
      };
      
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `boosty_bookmark_progress_${dateStr}.json`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showNotification('Прогресс экспортирован успешно!');
    } catch (e) {
      console.error('Ошибка при экспорте прогресса:', e);
      showNotification('Не удалось экспортировать прогресс.');
    }
  }

  // Импорт прогресса пользователя из файла JSON
  function importUserData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Валидация структуры импортированных данных
        if (!importedData || typeof importedData !== 'object' || !importedData.user_data) {
          throw new Error('Некорректная структура файла импорта');
        }
        
        // Перезаписываем данные прогресса и настройки
        state.user_data = importedData.user_data;
        if (importedData.settings) {
          state.settings = { ...state.settings, ...importedData.settings };
        }
        
        await saveStateToStorage();
        showNotification('Прогресс успешно импортирован!');
        render();
      } catch (err) {
        console.error('Ошибка при импорте прогресса:', err);
        showNotification('Неверный формат файла. Импорт отклонен.');
      } finally {
        // Сбрасываем значение инпута, чтобы можно было загрузить тот же файл повторно
        event.target.value = '';
      }
    };
    
    reader.readAsText(file);
  }

  // Изменение порядка вкладок
  function moveTab(index, direction) {
    const newOrder = [...state.settings.tabOrder];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newOrder.length) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;
      
      state.settings.tabOrder = newOrder;
      saveStateToStorage();
      render();
    }
  }

  // Изменение порядка вкладок с помощью Drag and Drop
  function dragAndDropReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const newOrder = [...state.settings.tabOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    
    state.settings.tabOrder = newOrder;
    saveStateToStorage();
    render();
  }

  // -------------------------------------------------------------
  // ЛОГИКА СИНХРОНИЗАЦИИ И АНАЛИЗА API
  // -------------------------------------------------------------

  // Попытка программного клика по кнопке лайка в DOM (если пост отрендерен на странице)
  function syncDomLike(postId, targetLikedState) {
    try {
      // Ищем ссылки на пост ТОЛЬКО на основной странице (вне нашего sidebar)
      const allLinks = document.querySelectorAll(`a[href*="${postId}" i]`);
      let pageLink = null;
      const sidebar = document.getElementById('lf-sidebar');
      
      for (const link of allLinks) {
        if (sidebar && sidebar.contains(link)) continue; // Пропускаем ссылки из нашего расширения
        pageLink = link;
        break;
      }
      
      if (!pageLink) return false;

      let current = pageLink;
      let likeBtn = null;
      let maxDepth = 15; 
      
      while (current && current !== document.body && maxDepth > 0) {
        current = current.parentElement;
        maxDepth--;
        
        const btns = current.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]');
        if (btns.length === 1) {
          likeBtn = btns[0];
          break;
        }
      }

      if (likeBtn) {
        const isCurrentlyLiked = likeBtn.getAttribute('data-active') === 'true';
        if (isCurrentlyLiked !== targetLikedState) {
          likeBtn.click();
          console.log(`[BoostyBookmark] DOM-клик лайка для поста ${postId}`);
          return true;
        } else {
          // Уже в нужном состоянии
          return true;
        }
      }
    } catch (e) {
      console.warn('Ошибка при поиске кнопки лайка в DOM:', e);
    }
    return false;
  }

  // Получение токена авторизации Boosty из localStorage
  function getBoostyAuthToken() {
    try {
      const authData = JSON.parse(localStorage.getItem('auth') || '{}');
      return authData.accessToken || null;
    } catch (e) {
      return null;
    }
  }

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

  // Сравнение двух постов на равенство для инкрементальной синхронизации
  function arePostsEqual(p1, p2) {
    if (p1.title !== p2.title) return false;
    if (p1.isLiked !== p2.isLiked) return false;
    
    const sub1 = p1.subscriptionLevel;
    const sub2 = p2.subscriptionLevel;
    if ((sub1 && !sub2) || (!sub1 && sub2)) return false;
    if (sub1 && sub2 && sub1.id !== sub2.id) return false;

    if (p1.tags.length !== p2.tags.length) return false;
    const tags1 = p1.tags.map(t => t.id).sort();
    const tags2 = p2.tags.map(t => t.id).sort();
    for (let i = 0; i < tags1.length; i++) {
      if (tags1[i] !== tags2[i]) return false;
    }

    return true;
  }

  // Синхронизация описания блога для получения красивых названий тайтлов
  async function syncBlogDescription() {
    try {
      const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}`;
      const headers = {};
      const token = getBoostyAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(url, { headers, credentials: 'include' });
      if (!response.ok) return;
      
      const result = await response.json();
      if (result && Array.isArray(result.description)) {
        const links = [];
        const desc = result.description;
        for (let i = 0; i < desc.length; i++) {
          const item = desc[i];
          if (item.type === 'link' && item.url && item.content) {
            let cleanTitle = '';
            try {
              const parsed = JSON.parse(item.content);
              if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                cleanTitle = parsed[0];
              }
            } catch (e) {
              cleanTitle = item.content;
            }
            if (cleanTitle) {
              let note = '';
              // Проверяем следующий элемент, если он является текстом
              if (i + 1 < desc.length && desc[i + 1].type === 'text' && desc[i + 1].content) {
                try {
                  const parsedNext = JSON.parse(desc[i + 1].content);
                  if (parsedNext && Array.isArray(parsedNext) && parsedNext.length > 0) {
                    note = parsedNext[0];
                  }
                } catch (e) {
                  note = desc[i + 1].content;
                }
              }
              links.push({
                url: item.url.trim(),
                title: cleanTitle.trim(),
                note: note.trim()
              });
            }
          }
        }
        state.blogDescriptionLinks = links;
      }
    } catch (e) {
      console.warn('Не удалось загрузить описание блога:', e);
    }
  }

  // Умная инкрементальная синхронизация постов
  async function performIncrementalSync() {
    if (state.ui.isSyncing) return;
    
    // Если постов вообще нет в базе, сразу запускаем полную синхронизацию
    if (state.posts.length === 0) {
      await performFullSync();
      return;
    }

    state.ui.isSyncing = true;
    state.ui.syncProgress = 0;
    render();
    
    const N = 15; // Требуемое количество подряд известных постов с неизмененным состоянием
    let unchangedStreak = 0;
    let offset = '';
    let page = 0;
    const limit = 100;
    let stopSync = false;
    
    // Создаем карту текущих постов для быстрого поиска и обновления
    const postMap = new Map(state.posts.map(p => [String(p.id), p]));
    
    try {
      await syncBlogDescription();
      while (!stopSync) {
        page++;
        // Показываем условный прогресс
        state.ui.syncProgress = Math.min(95, page * 15);
        render();
        
        const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/?limit=${limit}` + (offset ? `&offset=${offset}` : '');
        const headers = {};
        const token = getBoostyAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(url, { headers, credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        const pagePosts = result.data || [];
        
        if (!pagePosts.length) {
          break;
        }

        for (const p of pagePosts) {
          const fresh = {
            id: p.id,
            title: p.title || 'Без названия',
            publishTime: p.publishTime,
            isLiked: !!p.isLiked,
            subscriptionLevel: p.subscriptionLevel ? {
              name: p.subscriptionLevel.name,
              id: p.subscriptionLevel.id
            } : null,
            tags: (p.tags || []).map(t => ({
              id: t.id,
              title: t.title.trim()
            }))
          };

          const existing = postMap.get(String(fresh.id));

          if (existing) {
            if (arePostsEqual(existing, fresh)) {
              unchangedStreak++;
            } else {
              unchangedStreak = 0;
              postMap.set(String(fresh.id), fresh); // обновляем измененный пост
            }
          } else {
            unchangedStreak = 0;
            postMap.set(String(fresh.id), fresh); // добавляем новый пост
          }

          if (unchangedStreak >= N) {
            stopSync = true;
            break;
          }
        }
        
        const extra = result.extra || {};
        if (extra.isLast || stopSync) {
          break;
        }
        offset = extra.offset || '';
        
        // Небольшая задержка, чтобы не спамить сервер
        await new Promise(r => setTimeout(r, 150));
      }
      
      // Преобразуем карту обратно в отсортированный массив
      const updatedPosts = Array.from(postMap.values());
      updatedPosts.sort((a, b) => b.publishTime - a.publishTime);
      
      state.posts = updatedPosts;
      state.ui.syncProgress = 100;
      await saveStateToStorage();
      
      // Сбрасываем свернутые группы, чтобы отразить новые/обновленные посты
      state.collapsedGroups = {};
      
      showNotification('Синхронизация завершена успешно!');
      
    } catch (e) {
      console.error('Ошибка инкрементальной синхронизации Boosty:', e);
      showNotification('Ошибка при синхронизации постов. Попробуйте еще раз.');
    } finally {
      state.ui.isSyncing = false;
      render();
    }
  }

  // Полная синхронизация всей базы постов
  async function performFullSync() {
    if (state.ui.isSyncing) return;
    
    state.ui.isSyncing = true;
    state.ui.syncProgress = 0;
    render();
    
    let allPosts = [];
    let offset = '';
    let page = 0;
    const limit = 100;
    
    try {
      await syncBlogDescription();
      while (true) {
        page++;
        // Обновляем прогресс для пользователя
        state.ui.syncProgress = Math.min(95, page * 7);
        render();
        
        const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/?limit=${limit}` + (offset ? `&offset=${offset}` : '');
        const headers = {};
        const token = getBoostyAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(url, { headers, credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        const pagePosts = result.data || [];
        
        // Преобразуем посты в компактный формат для хранения
        const processed = pagePosts.map(p => ({
          id: p.id,
          title: p.title || 'Без названия',
          publishTime: p.publishTime,
          isLiked: !!p.isLiked,
          subscriptionLevel: p.subscriptionLevel ? {
            name: p.subscriptionLevel.name,
            id: p.subscriptionLevel.id
          } : null,
          tags: (p.tags || []).map(t => ({
            id: t.id,
            title: t.title.trim()
          }))
        }));
        
        allPosts.push(...processed);
        
        const extra = result.extra || {};
        if (extra.isLast || !pagePosts.length) {
          break;
        }
        offset = extra.offset || '';
        
        // Небольшая задержка, чтобы не спамить сервер
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Сохраняем в кэш
      state.posts = allPosts;
      state.collapsedGroups = {};
      state.ui.syncProgress = 100;
      await saveStateToStorage();
      
      // Оповещение об успешной синхронизации
      showNotification('Синхронизация завершена успешно!');
      
    } catch (e) {
      console.error('Ошибка синхронизации Boosty:', e);
      showNotification('Ошибка при загрузке постов. Попробуйте еще раз.');
    } finally {
      state.ui.isSyncing = false;
      render();
    }
  }

  // Фоновая синхронизация (загружает только первую страницу при открытии страницы)
  async function backgroundSync() {
    try {
      await syncBlogDescription();
      const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/?limit=40`;
      const headers = {};
      const token = getBoostyAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(url, { headers, credentials: 'include' });
      if (!response.ok) return;
      
      const result = await response.json();
      const pagePosts = result.data || [];
      if (!pagePosts.length) return;
      
      let hasUpdates = false;
      const postMap = new Map(state.posts.map(p => [p.id, p]));
      
      for (const p of pagePosts) {
        const existing = postMap.get(p.id);
        
        // Обрабатываем свежие данные поста
        const fresh = {
          id: p.id,
          title: p.title || 'Без названия',
          publishTime: p.publishTime,
          isLiked: !!p.isLiked,
          subscriptionLevel: p.subscriptionLevel ? {
            name: p.subscriptionLevel.name,
            id: p.subscriptionLevel.id
          } : null,
          tags: (p.tags || []).map(t => ({
            id: t.id,
            title: t.title.trim()
          }))
        };
        
        if (!existing) {
          // Новый пост! Добавляем в начало
          state.posts.unshift(fresh);
          hasUpdates = true;
        } else {
          // Если пост уже есть, проверяем не изменился ли статус лайка
          if (existing.isLiked !== fresh.isLiked) {
            existing.isLiked = fresh.isLiked;
            hasUpdates = true;
          }
        }
      }
      
      if (hasUpdates) {
        // Сортируем посты по времени публикации (по убыванию) на всякий случай
        state.posts.sort((a, b) => b.publishTime - a.publishTime);
        await saveStateToStorage();
        render();
      }
    } catch (e) {
      console.warn('Фоновое обновление не удалось:', e);
    }
  }

  // Группировка постов по тайтлам (тегам)
  function getGroupedTitles() {
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
    state.posts.forEach(post => {
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

    state.posts.forEach(post => {
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
      // Берем первый пост (самый старый) и смотрим время публикации
      const firstPostTime = title.posts.length > 0 ? title.posts[0].publishTime * 1000 : 0;
      const isNewTitle = firstPostTime > state.lastVisit;
      
      // Проверяем есть ли новые невышедшие главы с последнего захода для отслеживаемых/избранных тайтлов
      let hasNewChapters = false;
      if (userTitleData.status === 'watching' || userTitleData.status === 'favorite') {
        const lastPostTime = title.posts.length > 0 ? title.posts[title.posts.length - 1].publishTime * 1000 : 0;
        hasNewChapters = lastPostTime > state.lastVisit && readCount < title.posts.length;
      }
      
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
        category = 'Любителям пика';
      } else if (title.subscriptionLevels.has('Любитель ютуба')) {
        category = 'Любителям ютуба';
      } else if (title.subscriptionLevels.has('Любитель манги😈')) {
        category = 'Любителям манги';
      } else if (title.subscriptionLevels.has('Лисямбы🦊')) {
        category = 'Лисямбы мои';
      } else if (title.subscriptionLevels.has('Массонский орден шейхов💎')) {
        category = 'Для шейхов';
      }
      
      // Автоматическое присвоение статуса "Смотрю", если просмотрено больше 1 поста
      let currentStatus = userTitleData.status || 'none';
      if (currentStatus === 'none' && readCount > 1) {
        currentStatus = 'watching';
        // Мутируем состояние, чтобы сохранить этот выбор при следующем saveStateToStorage
        if (!state.user_data[title.name]) {
          state.user_data[title.name] = { status: 'watching', notes: '', readPosts: [] };
        } else {
          state.user_data[title.name].status = 'watching';
        }
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
  // ЛОГИКА ИНТЕРФЕЙСА И ОТРИСОВКИ DOM
  // -------------------------------------------------------------

  // Создание плавающей кнопки-триггера
  function createTriggerButton() {
    if (document.getElementById('lf-trigger-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'lf-trigger-btn';
    btn.title = 'Закладки';
    
    // Иконка закладки с молнией (без внешнего оранжевого квадрата, только сама закладка)
    btn.innerHTML = `<svg viewBox="550 450 850 1020"><path fill="#ffffff" d="${BOOKMARK_SVG_PATH}" /></svg>`;
    
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      state.settings.sidebarOpen = !state.settings.sidebarOpen;
      const sidebar = document.getElementById('lf-sidebar');
      if (sidebar) {
        if (state.settings.sidebarOpen) {
          sidebar.classList.add('lf-open');
          // Автоматически определяем текущую тему Boosty при открытии
          detectAndApplyTheme();
        } else {
          sidebar.classList.remove('lf-open');
        }
      }
      saveStateToStorage();
    });
    
    document.body.appendChild(btn);
  }

  // Создание контейнера боковой панели
  function createSidebar() {
    if (document.getElementById('lf-sidebar')) return;
    
    const sidebar = document.createElement('div');
    sidebar.id = 'lf-sidebar';
    sidebar.className = 'lf-dark'; // По умолчанию темная
    
    if (state.settings.sidebarOpen) {
      sidebar.classList.add('lf-open');
    }
    
    // Применяем масштаб из настроек через CSS-переменную
    if (state.settings.zoom) {
      sidebar.style.setProperty('--lf-zoom', state.settings.zoom);
    }
    
    // Предотвращаем закрытие панели при кликах внутри неё, но закрываем дропдаун при клике мимо него
    sidebar.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!event.target.closest('.lf-dropdown')) {
        const dropdown = document.getElementById('lf-archive-dropdown');
        if (dropdown) {
          dropdown.classList.remove('lf-show');
        }
        const sortDropdown = document.getElementById('lf-sort-dropdown');
        if (sortDropdown) {
          sortDropdown.classList.remove('lf-show');
        }
      }
    });
    
    document.body.appendChild(sidebar);
    detectAndApplyTheme();
  }

  // Определение и применение текущей темы Boosty
  function detectAndApplyTheme() {
    const sidebar = document.getElementById('lf-sidebar');
    if (!sidebar) return;
    
    // Проверяем цвет фона страницы Boosty для выбора темы
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    // Преобразуем rgb(r, g, b) в яркость
    const rgb = bodyBg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const r = parseInt(rgb[0]);
      const g = parseInt(rgb[1]);
      const b = parseInt(rgb[2]);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      
      if (brightness > 128) {
        // Светлая тема
        sidebar.classList.remove('lf-dark');
        sidebar.classList.add('lf-light');
      } else {
        // Темная тема
        sidebar.classList.remove('lf-light');
        sidebar.classList.add('lf-dark');
      }
    }
  }

  // Вспомогательная функция для всплывающих уведомлений
  function showNotification(text) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background-color: #333;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 100000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-left: 4px solid var(--lf-primary, #ff5722);
      transition: opacity 0.3s, transform 0.3s;
      transform: translateY(10px);
      opacity: 0;
    `;
    toast.textContent = text;
    document.body.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);
    
    // Анимация скрытия и удаление
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Дебаунс для автосохранения заметок
  let saveTimeout;
  function debounceSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveStateToStorage();
    }, 500);
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА СОДЕРЖИМОГО (ОСНОВНОЙ РЕНДЕР)
  // -------------------------------------------------------------
  function render() {
    const sidebar = document.getElementById('lf-sidebar');
    if (!sidebar) return;

    const bodyContent = document.getElementById('lf-body-content');
    const savedScrollTop = bodyContent ? bodyContent.scrollTop : 0;
    const savedTab = state.ui.activeTab;
    const savedTitle = state.ui.activeTitle;

    // Сохраняем временное состояние UI в sessionStorage текущей вкладки (для сохранения при перезагрузках)
    try {
      sessionStorage.setItem('lf_active_title', state.ui.activeTitle || '');
      sessionStorage.setItem('lf_active_tab', state.ui.activeTab || 'favorite');
    } catch (e) {
      // Игнорируем ошибки доступа к sessionStorage
    }
    
    // Если идет синхронизация
    if (state.ui.isSyncing) {
      sidebar.innerHTML = `
        <div class="lf-loading-overlay">
          <div class="lf-spinner"></div>
          <div class="lf-loading-text">Загрузка базы постов...<br>Страница ${Math.round(state.ui.syncProgress / 7)}</div>
          <div class="lf-loading-progress">
            <div class="lf-loading-progress-bar" style="width: ${state.ui.syncProgress}%"></div>
          </div>
          <div style="font-size: 11px; color: var(--lf-text-muted);">Это нужно сделать только один раз.</div>
        </div>
      `;
      return;
    }
    
    // Вычисляем количество уникальных тайтлов до шаблона
    const uniqueTagCount = new Set(state.posts.flatMap(p =>
      p.tags.map(t => t.title).filter(t => !TAGS_BLACKLIST.includes(t.toLowerCase()))
    )).size;

    // Общая верстка каркаса
    sidebar.innerHTML = `
      <div class="lf-header">
        <div class="lf-header-top">
          <div class="lf-title-container">
            <svg class="lf-logo" viewBox="550 450 850 1020">
              <defs>
                <linearGradient id="boostyGradient" gradientUnits="userSpaceOnUse" x1="1379" y1="266" x2="538" y2="2653">
                  <stop offset="0" style="stop-color:#EE7829"/>
                  <stop offset="0.2792" style="stop-color:#EF692A"/>
                  <stop offset="0.6279" style="stop-color:#F05E2C"/>
                  <stop offset="1" style="stop-color:#F05A2C"/>
                </linearGradient>
              </defs>
              <!-- оранжевая подложка под молнию -->
              <rect class="lf-logo-rect" x="700" y="500" width="450" height="630" fill="url(#boostyGradient)" />
              <!-- белая закладка с вырезанной молнией -->
              <path class="lf-logo-path" fill="#ffffff" d="${BOOKMARK_SVG_PATH}" />
            </svg>
            <h1 class="lf-title">Boosty Bookmark</h1>
          </div>
          <div class="lf-header-buttons">
            <!-- Кнопка настроек -->
            <button id="lf-settings-btn" class="lf-btn-icon ${state.ui.activeTab === 'settings' ? 'lf-active' : ''}" title="Настройки">
              <svg viewBox="0 0 24 24">
                <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.34 14.86,5.08L14.47,2.42C14.43,2.18 14.22,2 13.97,2H9.97C9.72,2 9.51,2.18 9.47,2.42L9.08,5.08C8.47,5.34 7.9,5.66 7.38,6.05L4.89,5.05C4.67,4.96 4.4,5.05 4.28,5.27L2.28,8.73C2.16,8.95 2.21,9.22 2.4,9.37L4.51,11C4.47,11.34 4.45,11.67 4.45,12C4.45,12.33 4.47,12.65 4.51,12.97L2.4,14.63C2.21,14.78 2.16,15.05 2.28,15.27L4.28,18.73C4.4,18.95 4.67,19.04 4.89,18.95L7.38,17.95C7.9,18.34 8.47,18.66 9.08,18.92L9.47,21.58C9.51,21.82 9.72,22 9.97,22H13.97C14.22,22 14.43,21.82 14.47,21.58L14.86,18.92C15.47,18.66 16.04,18.34 16.56,17.95L19.05,18.95C19.27,19.04 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
              </svg>
            </button>
            <!-- Кнопка синхронизации -->
            <button id="lf-sync-btn" class="lf-btn-icon" title="Синхронизировать новые посты">
              <svg viewBox="0 0 24 24">
                <path d="M19,8L15,12H18A6,6 0 0,1 12,18C11,18 10.1,17.65 9.35,17L7.9,18.45C9,19.45 10.45,20 12,20A8,8 0 0,0 20,12H23L19,8M6,12A6,6 0 0,1 12,6C13,6 13.9,6.35 14.65,7L16.1,5.55C15,4.55 13.55,4 12,4A8,8 0 0,0 4,12H1L5,16L9,12H6Z" />
              </svg>
            </button>
            <!-- Кнопка закрытия -->
            <button id="lf-close-btn" class="lf-btn-icon" title="Свернуть панель">
              <svg viewBox="0 0 24 24">
                <path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="lf-stats">Тайтлов: ${uniqueTagCount} | Записей: ${state.posts.length}</div>
        
        <!-- Строка поиска (отображается только в списке и не на вкладке настроек) -->
        ${(!state.ui.activeTitle && state.ui.activeTab !== 'settings') ? `
          <div class="lf-search-row">
            <div class="lf-search-container">
              <svg class="lf-search-icon" viewBox="0 0 24 24">
                <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
              </svg>
              <input type="text" id="lf-search" class="lf-search-input" placeholder="Поиск тайтла..." value="${escapeHtml(state.ui.searchQuery)}">
              <button id="lf-search-clear" class="lf-search-clear-btn" style="${state.ui.searchQuery ? 'display: flex;' : 'display: none;'}" title="Очистить поиск">
                <svg viewBox="0 0 24 24">
                  <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                </svg>
              </button>
            </div>
            
            <!-- Сортировка тайтлов -->
            <div class="lf-dropdown" id="lf-sort-dropdown-container">
              <button id="lf-sort-btn" class="lf-btn-icon" title="Сортировка тайтлов">
                <svg viewBox="0 0 24 24">
                  <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
                </svg>
              </button>
              <div class="lf-dropdown-content" id="lf-sort-dropdown" style="right: 0; min-width: 190px;">
                <button class="lf-dropdown-item ${state.settings.titleSort === 'name_asc' ? 'lf-active' : ''}" data-sort="name_asc">По названию: А → Я</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'name_desc' ? 'lf-active' : ''}" data-sort="name_desc">По названию: Я → А</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'new_desc' ? 'lf-active' : ''}" data-sort="new_desc">Сначала новые</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'new_asc' ? 'lf-active' : ''}" data-sort="new_asc">Сначала старые</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'chapters_desc' ? 'lf-active' : ''}" data-sort="chapters_desc">Больше глав</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'chapters_asc' ? 'lf-active' : ''}" data-sort="chapters_asc">Меньше глав</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'progress_desc' ? 'lf-active' : ''}" data-sort="progress_desc">Прогресс выше</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'progress_asc' ? 'lf-active' : ''}" data-sort="progress_asc">Прогресс ниже</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Вкладки (только в списке) -->
      ${!state.ui.activeTitle ? `
        <div class="lf-tabs">
          ${state.settings.tabOrder.filter(tabKey => tabKey !== 'completed' && tabKey !== 'dropped').map(tabKey => `
            <button class="lf-tab-btn ${state.ui.activeTab === tabKey ? 'lf-active' : ''}" data-tab="${tabKey}">${TAB_NAMES[tabKey] || tabKey}</button>
          `).join('')}
          <div class="lf-dropdown">
            <button id="lf-archive-btn" class="lf-tab-btn lf-dropdown-trigger ${['completed', 'dropped'].includes(state.ui.activeTab) ? 'lf-active' : ''}">
              ${state.ui.activeTab === 'dropped' ? 'Брошено' : (state.ui.activeTab === 'completed' ? 'Завершено' : 'Архив')} <span class="lf-arrow">▼</span>
            </button>
            <div class="lf-dropdown-content" id="lf-archive-dropdown">
              <button class="lf-dropdown-item ${state.ui.activeTab === 'completed' ? 'lf-active' : ''}" data-tab="completed">Завершено</button>
              <button class="lf-dropdown-item ${state.ui.activeTab === 'dropped' ? 'lf-active' : ''}" data-tab="dropped">Брошено</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="lf-body-content" id="lf-body-content">
        <!-- Сюда рендерится динамическое содержимое -->
      </div>
    `;

    // Подключаем события хедера
    document.getElementById('lf-sync-btn').addEventListener('click', performIncrementalSync);
    
    const settingsBtn = document.getElementById('lf-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        state.ui.activeTitle = null;
        if (state.ui.activeTab === 'settings') {
          state.ui.activeTab = state.ui.previousTab || 'favorite';
        } else {
          state.ui.previousTab = state.ui.activeTab;
          state.ui.activeTab = 'settings';
        }
        render();
      });
    }

    const closeBtn = document.getElementById('lf-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.settings.sidebarOpen = false;
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.classList.remove('lf-open');
        }
        saveStateToStorage();
      });
    }
    
    if (!state.ui.activeTitle) {
      const searchInput = document.getElementById('lf-search');
      const searchClear = document.getElementById('lf-search-clear');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          state.ui.searchQuery = e.target.value;
          if (searchClear) {
            searchClear.style.display = e.target.value ? 'flex' : 'none';
          }
          renderListContent();
        });
      }
      
      if (searchClear && searchInput) {
        searchClear.addEventListener('click', () => {
          state.ui.searchQuery = '';
          searchInput.value = '';
          searchClear.style.display = 'none';
          searchInput.focus();
          renderListContent();
        });
      }
      
      // Вкладки (только обычные)
      const tabButtons = sidebar.querySelectorAll('.lf-tab-btn:not(.lf-dropdown-trigger)');
      tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          state.ui.activeTab = e.target.dataset.tab;
          render();
        });
      });

      // Дропдаун архива
      const archiveBtn = document.getElementById('lf-archive-btn');
      const archiveDropdown = document.getElementById('lf-archive-dropdown');
      
      // Дропдаун сортировки
      const sortBtn = document.getElementById('lf-sort-btn');
      const sortDropdown = document.getElementById('lf-sort-dropdown');

      if (archiveBtn && archiveDropdown) {
        archiveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          archiveDropdown.classList.toggle('lf-show');
          if (sortDropdown) {
            sortDropdown.classList.remove('lf-show');
          }
        });
      }

      if (sortBtn && sortDropdown) {
        sortBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sortDropdown.classList.toggle('lf-show');
          if (archiveDropdown) {
            archiveDropdown.classList.remove('lf-show');
          }
        });

        // Клик по элементам сортировки
        const sortItems = sortDropdown.querySelectorAll('.lf-dropdown-item');
        sortItems.forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            state.settings.titleSort = e.currentTarget.dataset.sort;
            saveStateToStorage();
            sortDropdown.classList.remove('lf-show');
            
            // Обновляем активный класс
            sortItems.forEach(si => si.classList.remove('lf-active'));
            e.currentTarget.classList.add('lf-active');
            
            renderListContent();
          });
        });
      }

      // Элементы дропдауна архива
      const archiveItems = archiveDropdown ? archiveDropdown.querySelectorAll('.lf-dropdown-item') : [];
      archiveItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          state.ui.activeTab = e.currentTarget.dataset.tab;
          if (archiveDropdown) {
            archiveDropdown.classList.remove('lf-show');
          }
          render();
        });
      });
      
      renderListContent();
    } else {
      renderDetailContent();
    }

    // Восстанавливаем позицию прокрутки, если вкладка и тайтл не изменились
    if (state.ui.activeTab === savedTab && state.ui.activeTitle === savedTitle) {
      const newBodyContent = document.getElementById('lf-body-content');
      if (newBodyContent && savedScrollTop > 0) {
        newBodyContent.scrollTop = savedScrollTop;
      }
    }
  }

  // Отрисовка вкладки настроек
  function renderSettingsContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="lf-settings-container">
        <!-- Резервное копирование -->
        <div class="lf-settings-section">
          <h3 class="lf-settings-title">Синхронизация и бэкап</h3>
          <div class="lf-settings-desc" style="margin-bottom: 12px;">
            Экспортируйте ваш прогресс в JSON-файл для резервного копирования или переноса на другое устройство.
          </div>
          <div class="lf-settings-buttons" style="margin-bottom: 16px;">
            <button id="lf-export-btn" class="lf-btn-secondary">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
                <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
              </svg>
              Экспорт
            </button>
            
            <button id="lf-import-btn" class="lf-btn-primary">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
                <path d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z" />
              </svg>
              Импорт
            </button>
            <input type="file" id="lf-import-input" accept=".json" style="display: none;">
          </div>
          
          <div class="lf-settings-desc" style="margin-bottom: 12px;">
            Если база отображается некорректно или вы хотите полностью обновить все посты автора с самого начала, запустите полную принудительную синхронизацию.
          </div>
          <div class="lf-settings-buttons">
            <button id="lf-full-sync-btn" class="lf-btn-secondary" style="width: 100%; display: flex; justify-content: center; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                <path d="M19,8L15,12H18A6,6 0 0,1 12,18C11,18 10.1,17.65 9.35,17L7.9,18.45C9,19.45 10.45,20 12,20A8,8 0 0,0 20,12H23L19,8M6,12A6,6 0 0,1 12,6C13,6 13.9,6.35 14.65,7L16.1,5.55C15,4.55 13.55,4 12,4A8,8 0 0,0 4,12H1L5,16L9,12H6Z" />
              </svg>
              Полная принудительная синхронизация
            </button>
          </div>
        </div>

        <!-- Параметры отслеживания -->
        <div class="lf-settings-section">
          <h3 class="lf-settings-title">Настройки отслеживания</h3>
          
          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-sync-likes">
              Синхронизация по лайкам
              <div class="lf-settings-desc">Считать лайкнутые посты на Boosty просмотренными главами.</div>
            </label>
            <input type="checkbox" id="lf-setting-sync-likes" class="lf-settings-checkbox" ${state.settings.syncLikes ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-open-tags">
              Открывать теги в текущей вкладке
              <div class="lf-settings-desc">Если отключено, теги будут открываться в новой вкладке браузера.</div>
            </label>
            <input type="checkbox" id="lf-setting-open-tags" class="lf-settings-checkbox" ${state.settings.openTagsInCurrentTab ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-open-chapters-in-feed">
              Искать главы в ленте тайтла
              <div class="lf-settings-desc">При клике на главу переходить на страницу тайтла и скроллить к посту в ленте вместо открытия отдельной страницы.</div>
            </label>
            <input type="checkbox" id="lf-setting-open-chapters-in-feed" class="lf-settings-checkbox" ${state.settings.openChaptersInFeed ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-auto-mark">
              Автоотметка при открытии
              <div class="lf-settings-desc">Автоматически помечать главу как просмотренную при переходе по ссылке.</div>
            </label>
            <input type="checkbox" id="lf-setting-auto-mark" class="lf-settings-checkbox" ${state.settings.autoMarkOpen ? 'checked' : ''}>
          </div>
        </div>

        <!-- Внешний вид -->
        <div class="lf-settings-section">
          <h3 class="lf-settings-title">Интерфейс</h3>
          
          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-zoom">
              Масштаб боковой панели
              <div class="lf-settings-desc">Настройте удобный размер текста и элементов интерфейса.</div>
            </label>
            <select id="lf-setting-zoom" class="lf-settings-select">
              <option value="1.0" ${state.settings.zoom === 1.0 ? 'selected' : ''}>80%</option>
              <option value="1.125" ${state.settings.zoom === 1.125 ? 'selected' : ''}>90%</option>
              <option value="1.25" ${state.settings.zoom === 1.25 ? 'selected' : ''}>100%</option>
              <option value="1.375" ${state.settings.zoom === 1.375 ? 'selected' : ''}>110%</option>
              <option value="1.5" ${state.settings.zoom === 1.5 ? 'selected' : ''}>120%</option>
              <option value="1.625" ${state.settings.zoom === 1.625 ? 'selected' : ''}>130%</option>
              <option value="1.75" ${state.settings.zoom === 1.75 ? 'selected' : ''}>140%</option>
              <option value="1.875" ${state.settings.zoom === 1.875 ? 'selected' : ''}>150%</option>
            </select>
          </div>
        </div>

        <!-- Порядок вкладок -->
        <div class="lf-settings-section lf-collapsible ${state.ui.tabOrderExpanded ? 'lf-expanded' : ''}">
          <div class="lf-settings-section-header" id="lf-toggle-tab-order">
            <h3 class="lf-settings-title" style="margin: 0;">Порядок вкладок</h3>
            <svg class="lf-collapse-arrow" viewBox="0 0 24 24">
              <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
            </svg>
          </div>
          <div class="lf-settings-section-body">
            <div class="lf-settings-desc" style="margin-bottom: 12px;">
              Настройте расположение вкладок категорий в боковой панели с помощью перетаскивания (Drag & Drop) за иконку или стрелок.
            </div>
            <div class="lf-tab-order-list">
              ${state.settings.tabOrder.map((tabKey, idx) => `
                <div class="lf-tab-order-item" data-index="${idx}">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="lf-drag-handle" title="Перетащить">
                      <svg viewBox="0 0 24 24">
                        <path d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z" />
                      </svg>
                    </div>
                    <span class="lf-tab-order-name">${TAB_NAMES[tabKey] || tabKey}</span>
                  </div>
                  <div class="lf-tab-order-btns">
                    <button class="lf-tab-order-btn lf-tab-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Вверх">▲</button>
                    <button class="lf-tab-order-btn lf-tab-down" data-index="${idx}" ${idx === state.settings.tabOrder.length - 1 ? 'disabled' : ''} title="Вниз">▼</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Инфо о расширении -->
        <div class="lf-settings-section" style="font-size: 11px; color: var(--lf-text-muted); line-height: 1.5;">
          <div><strong>Название:</strong> Boosty Bookmark</div>
          <div><strong>Версия:</strong> 1.0</div>
          <div style="margin-top: 8px;">Разработано для быстрого и удобного отслеживания глав на странице автора lightfoxmanga.</div>
        </div>

        <div id="lf-delete-container" style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
          <button id="lf-delete-data-btn" class="lf-btn-secondary" style="width: 100%; border-color: rgba(211, 47, 47, 0.2); color: rgba(211, 47, 47, 0.7); font-size: 11px; padding: 6px 10px; margin: 0;">
            Удалить сохранённые данные
          </button>
        </div>
      </div>
    `;

    // Подключение событий кнопок экспорта/импорта
    document.getElementById('lf-export-btn').addEventListener('click', exportUserData);
    
    const importBtn = document.getElementById('lf-import-btn');
    const importInput = document.getElementById('lf-import-input');
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', importUserData);

    // Кнопка удаления данных (двухэтапное подтверждение)
    const deleteDataBtn = document.getElementById('lf-delete-data-btn');
    const deleteContainer = document.getElementById('lf-delete-container');
    let deleteTimeout = null;

    if (deleteDataBtn && deleteContainer) {
      deleteDataBtn.addEventListener('click', () => {
        const isConfirming = deleteDataBtn.getAttribute('data-confirming') === 'true';

        if (!isConfirming) {
          // Переводим в состояние подтверждения
          deleteDataBtn.setAttribute('data-confirming', 'true');
          deleteDataBtn.textContent = 'Вы точно уверены? Нажмите для удаления';
          deleteDataBtn.style.backgroundColor = '#d32f2f';
          deleteDataBtn.style.color = '#ffffff';
          deleteDataBtn.style.borderColor = '#d32f2f';

          // Создаем кнопку отмены
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'lf-delete-cancel-btn';
          cancelBtn.className = 'lf-btn-secondary';
          cancelBtn.style.width = '100%';
          cancelBtn.style.fontSize = '11px';
          cancelBtn.style.padding = '6px 10px';
          cancelBtn.textContent = 'Отмена';
          
          cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetDeleteButton();
          });

          deleteContainer.appendChild(cancelBtn);

          // Таймер автоотмены через 5 секунд
          deleteTimeout = setTimeout(() => {
            resetDeleteButton();
          }, 5000);

        } else {
          // Второе нажатие — выполняем удаление
          if (deleteTimeout) clearTimeout(deleteTimeout);
          
          chrome.storage.local.clear(() => {
            showNotification('Все данные успешно удалены');
            
            // Сбрасываем локальное состояние
            state.posts = [];
            state.user_data = {};
            state.lastVisit = 0;
            state.collapsedGroups = {};
            state.blogDescriptionLinks = [];
            state.settings = {
              syncLikes: true,
              autoMarkOpen: false,
              tabOrder: ['favorite', 'all', 'watching', 'new', 'completed', 'dropped'],
              zoom: 1.25,
              zoomMigrated: true,
              sidebarOpen: true,
              openTagsInCurrentTab: true,
              openChaptersInFeed: true
            };
            
            // Сбрасываем временные UI-параметры
            state.ui.activeTitle = null;
            state.ui.activeTab = 'favorite';
            try {
              sessionStorage.removeItem('lf_active_title');
              sessionStorage.removeItem('lf_active_tab');
            } catch(e) {}
            
            // Восстанавливаем дефолтный масштаб в DOM
            const sidebar = document.getElementById('lf-sidebar');
            if (sidebar) {
              sidebar.style.setProperty('--lf-zoom', 1.25);
            }
            
            // Перерисовываем интерфейс (появится экран первой синхронизации)
            render();
          });
        }
      });

      function resetDeleteButton() {
        if (deleteTimeout) clearTimeout(deleteTimeout);
        deleteDataBtn.removeAttribute('data-confirming');
        deleteDataBtn.textContent = 'Удалить сохранённые данные';
        deleteDataBtn.style.backgroundColor = '';
        deleteDataBtn.style.color = '';
        deleteDataBtn.style.borderColor = '';
        
        const cancelBtn = document.getElementById('lf-delete-cancel-btn');
        if (cancelBtn) {
          cancelBtn.remove();
        }
      }
    }

    // Подключение полной принудительной синхронизации
    const fullSyncBtn = document.getElementById('lf-full-sync-btn');
    if (fullSyncBtn) {
      fullSyncBtn.addEventListener('click', () => {
        state.ui.activeTab = 'favorite'; // Переключаем на вкладку списков, чтобы пользователь сразу видел прогресс
        performFullSync();
      });
    }

    // Подключение событий чекбоксов
    const syncLikesCheckbox = document.getElementById('lf-setting-sync-likes');
    syncLikesCheckbox.addEventListener('change', (e) => {
      state.settings.syncLikes = e.target.checked;
      saveStateToStorage();
      showNotification(e.target.checked ? 'Синхронизация по лайкам включена' : 'Синхронизация по лайкам отключена');
    });

    const autoMarkCheckbox = document.getElementById('lf-setting-auto-mark');
    autoMarkCheckbox.addEventListener('change', (e) => {
      state.settings.autoMarkOpen = e.target.checked;
      saveStateToStorage();
      showNotification(e.target.checked ? 'Автоотметка включена' : 'Автоотметка отключена');
    });

    const openTagsCheckbox = document.getElementById('lf-setting-open-tags');
    if (openTagsCheckbox) {
      openTagsCheckbox.addEventListener('change', (e) => {
        state.settings.openTagsInCurrentTab = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? 'Теги открываются в текущей вкладке' : 'Теги открываются в новой вкладке');
      });
    }

    const openChaptersCheckbox = document.getElementById('lf-setting-open-chapters-in-feed');
    if (openChaptersCheckbox) {
      openChaptersCheckbox.addEventListener('change', (e) => {
        state.settings.openChaptersInFeed = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? 'Включен переход к главам в ленте' : 'Включено открытие отдельных страниц глав');
      });
    }

    // Подключение событий выбора масштаба
    const zoomSelect = document.getElementById('lf-setting-zoom');
    if (zoomSelect) {
      zoomSelect.addEventListener('change', (e) => {
        const newZoom = parseFloat(e.target.value);
        state.settings.zoom = newZoom;
        saveStateToStorage();
        
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.style.setProperty('--lf-zoom', newZoom);
        }
        
        showNotification(`Масштаб изменен на ${Math.round(newZoom * 80)}%`);
        render();
      });
    }

    // Подключение событий изменения порядка вкладок
    container.querySelectorAll('.lf-tab-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        moveTab(idx, -1);
      });
    });

    container.querySelectorAll('.lf-tab-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        moveTab(idx, 1);
      });
    });

    // Подключение Drag and Drop для порядка вкладок
    let draggedIndex = null;
    const dragItems = container.querySelectorAll('.lf-tab-order-item');
    
    dragItems.forEach(item => {
      const handle = item.querySelector('.lf-drag-handle');
      
      // Делаем элемент перетаскиваемым только при зажатии ручки
      handle.addEventListener('mousedown', () => {
        item.draggable = true;
      });
      
      handle.addEventListener('mouseup', () => {
        item.draggable = false;
      });
      
      item.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(item.dataset.index);
        item.classList.add('lf-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedIndex);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('lf-dragging');
        item.draggable = false;
        dragItems.forEach(i => i.classList.remove('lf-drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
      });

      item.addEventListener('dragenter', () => {
        item.classList.add('lf-drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('lf-drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.stopPropagation();
        const targetIndex = parseInt(item.dataset.index);
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
          dragAndDropReorder(draggedIndex, targetIndex);
        }
        return false;
      });
    });

    // Переключатель сворачивания порядка вкладок
    const toggleHeader = document.getElementById('lf-toggle-tab-order');
    if (toggleHeader) {
      toggleHeader.addEventListener('click', () => {
        state.ui.tabOrderExpanded = !state.ui.tabOrderExpanded;
        render();
      });
    }
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА СПИСКА ТАЙТЛОВ
  // -------------------------------------------------------------
  function renderListContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    if (state.ui.activeTab === 'settings') {
      renderSettingsContent();
      return;
    }
    
    if (state.posts.length === 0) {
      container.innerHTML = `
        <div class="lf-empty-state">
          <svg class="lf-logo-large" viewBox="550 450 850 1020" style="width: 64px; height: 64px; margin-bottom: 8px;">
            <defs>
              <linearGradient id="boostyGradientLarge" gradientUnits="userSpaceOnUse" x1="1379" y1="266" x2="538" y2="2653">
                <stop offset="0" style="stop-color:#EE7829"/>
                <stop offset="0.2792" style="stop-color:#EF692A"/>
                <stop offset="0.6279" style="stop-color:#F05E2C"/>
                <stop offset="1" style="stop-color:#F05A2C"/>
              </linearGradient>
            </defs>
            <!-- оранжевая подложка под молнию -->
            <rect class="lf-logo-rect" x="700" y="500" width="450" height="630" fill="url(#boostyGradientLarge)" />
            <!-- белая закладка с вырезанной молнией -->
            <path class="lf-logo-path" fill="#ffffff" d="${BOOKMARK_SVG_PATH}" />
          </svg>
          <div>База пуста. Пожалуйста, запустите синхронизацию, нажав на кнопку со стрелками вверху.</div>
          <button id="lf-empty-sync-btn" style="padding: 8px 16px; background-color: var(--lf-primary); border: none; border-radius: var(--lf-border-radius); color: #fff; cursor: pointer; font-weight: 600;">Запустить</button>
        </div>
      `;
      document.getElementById('lf-empty-sync-btn').addEventListener('click', performFullSync);
      return;
    }
    
    const allTitles = getGroupedTitles();
    const query = state.ui.searchQuery.toLowerCase().trim();
    
    // Фильтруем тайтлы по вкладке и поисковому запросу
    let filtered = allTitles.filter(t => {
      // Фильтр поиска
      if (query && !t.name.toLowerCase().includes(query)) return false;
      
      // Фильтр вкладки
      switch (state.ui.activeTab) {
        case 'watching':
          return t.status === 'watching';
        case 'favorite':
          return t.status === 'favorite';
        case 'completed':
          return t.status === 'completed';
        case 'dropped':
          return t.status === 'dropped';
        case 'new':
          return t.isNewTitle || t.hasNewChapters;
        case 'all':
        default:
          return t.status !== 'dropped'; // На вкладке «Все» не показываем брошенные
      }
    });
    
    // Сортировка тайтлов на основе выбранного режима
    const sortType = state.settings.titleSort || 'name_asc';
    filtered.sort((a, b) => {
      switch (sortType) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'new_desc': {
          const aTime = a.posts.length > 0 ? a.posts[a.posts.length - 1].publishTime : 0;
          const bTime = b.posts.length > 0 ? b.posts[b.posts.length - 1].publishTime : 0;
          return bTime - aTime;
        }
        case 'new_asc': {
          const aTime = a.posts.length > 0 ? a.posts[a.posts.length - 1].publishTime : 0;
          const bTime = b.posts.length > 0 ? b.posts[b.posts.length - 1].publishTime : 0;
          return aTime - bTime;
        }
        case 'chapters_desc':
          return b.posts.length - a.posts.length;
        case 'chapters_asc':
          return a.posts.length - b.posts.length;
        case 'progress_desc': {
          if (b.readCount !== a.readCount) {
            return b.readCount - a.readCount;
          }
          const aPercent = a.posts.length > 0 ? a.readCount / a.posts.length : 0;
          const bPercent = b.posts.length > 0 ? b.readCount / b.posts.length : 0;
          if (bPercent !== aPercent) {
            return bPercent - aPercent;
          }
          return a.name.localeCompare(b.name);
        }
        case 'progress_asc': {
          if (a.readCount !== b.readCount) {
            return a.readCount - b.readCount;
          }
          const aPercent = a.posts.length > 0 ? a.readCount / a.posts.length : 0;
          const bPercent = b.posts.length > 0 ? b.readCount / b.posts.length : 0;
          if (aPercent !== bPercent) {
            return aPercent - bPercent;
          }
          return a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="lf-empty-state">
          <svg viewBox="0 0 24 24">
            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
          </svg>
          <div>Ничего не найдено в этой категории.</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    
    // Если мы на вкладке «Новые», выведем разделение: «Новые тайтлы» и «Новые главы»
    if (state.ui.activeTab === 'new') {
      const newTitles = filtered.filter(t => t.isNewTitle);
      const newChapters = filtered.filter(t => t.hasNewChapters && !t.isNewTitle);
      
      if (newTitles.length > 0) {
        renderGroup(container, 'Новые тайтлы (впервые выложены)', newTitles);
      }
      if (newChapters.length > 0) {
        renderGroup(container, 'Новые главы (в подписках)', newChapters);
      }
      return;
    }
    
    // Для вкладок «Смотрю», «Избранное», «Завершено», «Брошено» выводим простым списком
    if (['watching', 'favorite', 'completed', 'dropped'].includes(state.ui.activeTab)) {
      const listDiv = document.createElement('div');
      listDiv.className = 'lf-group-container';
      listDiv.style.backgroundColor = 'transparent';
      listDiv.style.border = 'none';
      
      const listContent = document.createElement('div');
      listContent.className = 'lf-group-list';
      
      filtered.forEach(manga => {
        listContent.appendChild(createMangaRow(manga));
      });
      
      listDiv.appendChild(listContent);
      container.appendChild(listDiv);
      return;
    }
    
    // Для вкладки «Все» группируем по уровням подписки (категориям)
    const categories = [
      'Все',
      'Полностью озвучено',
      'Завершен том',
      'Любителям ютуба',
      'Любителям манги',
      'Только для девушек',
      'Любителям пика',
      'Для шейхов',
      'Лисямбы мои',
      'Бесплатные',
      'Объявления'
    ];
    
    categories.forEach(catName => {
      let catTitles = [];
      if (catName === 'Все') {
        catTitles = filtered;
      } else if (catName === 'Полностью озвучено') {
        catTitles = filtered.filter(t => t.isFullyFinished);
      } else if (catName === 'Завершен том') {
        catTitles = filtered.filter(t => t.isVolumeFinished);
      } else {
        catTitles = filtered.filter(t => t.category === catName);
      }
      
      if (catTitles.length > 0) {
        renderGroup(container, catName, catTitles);
      }
    });
  }

  // Отрисовка одной группы тайтлов (выпадающий список)
  function renderGroup(parent, groupName, titles) {
    const groupContainer = document.createElement('div');
    const query = state.ui.searchQuery.toLowerCase().trim();
    // При наличии поискового запроса принудительно раскрываем категорию
    const isCollapsed = query ? false : (state.collapsedGroups[groupName] !== false);
    groupContainer.className = `lf-group-container ${isCollapsed ? 'lf-collapsed' : ''}`;
    
    const header = document.createElement('div');
    header.className = 'lf-group-header';
    
    let countHtml = `<span class="lf-group-count">${titles.length}</span>`;
    if (groupName === 'Объявления' && titles.length > 0) {
      countHtml = `<span class="lf-group-count">${titles[0].readCount}/${titles[0].posts.length}</span>`;
    }
    
    header.innerHTML = `
      <div class="lf-group-header-left">
        <svg class="lf-group-arrow" viewBox="0 0 24 24">
          <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
        </svg>
        <span>${groupName}</span>
      </div>
      ${countHtml}
    `;
    
    header.addEventListener('click', () => {
      const collapsed = !groupContainer.classList.contains('lf-collapsed');
      if (collapsed) {
        groupContainer.classList.add('lf-collapsed');
        state.collapsedGroups[groupName] = true;
      } else {
        groupContainer.classList.remove('lf-collapsed');
        state.collapsedGroups[groupName] = false;
      }
      saveStateToStorage();
    });
    
    const list = document.createElement('div');
    list.className = 'lf-group-list';
    
    if (groupName === 'Объявления' && titles.length > 0) {
      const manga = titles[0];
      const sortedPosts = [...manga.posts];
      const readSet = new Set((manga.readPosts || []).map(String));
      
      const sortType = state.settings.titleSort || 'name_asc';
      sortedPosts.sort((a, b) => {
        const isReadA = readSet.has(String(a.id)) || (state.settings.syncLikes && a.isLiked);
        const isReadB = readSet.has(String(b.id)) || (state.settings.syncLikes && b.isLiked);
        
        switch (sortType) {
          case 'name_asc':
            return a.title.localeCompare(b.title);
          case 'name_desc':
            return b.title.localeCompare(a.title);
          case 'new_desc':
            return b.publishTime - a.publishTime;
          case 'new_asc':
            return a.publishTime - b.publishTime;
          case 'progress_desc':
            if (isReadA !== isReadB) {
              return (isReadB ? 1 : 0) - (isReadA ? 1 : 0);
            }
            return b.publishTime - a.publishTime;
          case 'progress_asc':
            if (isReadA !== isReadB) {
              return (isReadA ? 1 : 0) - (isReadB ? 1 : 0);
            }
            return b.publishTime - a.publishTime;
          default:
            return b.publishTime - a.publishTime;
        }
      });
      const tagUrl = manga.tagId 
        ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
        : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
        
      sortedPosts.forEach(post => {
        const row = document.createElement('div');
        row.className = 'lf-chapter-row';
        
        const isLiked = state.settings.syncLikes && post.isLiked;
        const isChecked = readSet.has(String(post.id)) || isLiked;
        const dateStr = formatDate(post.publishTime);
        
        const chapterUrl = `https://boosty.to/lightfoxmanga/posts/${post.id}`;
        const targetAttr = state.settings.openTagsInCurrentTab ? '' : 'target="_blank"';
        
        row.innerHTML = `
          <input type="checkbox" class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? 'title="Этот пост лайкнут на Boosty"' : ''}>
          <a class="lf-chapter-title-link" href="${chapterUrl}" ${targetAttr} title="${escapeHtml(post.title)}">
            ${escapeHtml(post.title)}
          </a>
          <span class="lf-chapter-date">${dateStr}</span>
        `;
        
        const checkbox = row.querySelector('.lf-chapter-checkbox');
        checkbox.addEventListener('change', (e) => {
          if (e.target.classList.contains('lf-liked-checkbox') && !e.target.checked) {
            e.target.classList.remove('lf-liked-checkbox');
          } else if (e.target.checked) {
            e.target.classList.add('lf-liked-checkbox');
          }
          
          const userData = ensureUserData(manga.name);
          const postId = String(e.target.dataset.postId);
          const readPosts = userData.readPosts || [];
          
          if (e.target.checked) {
            if (!readPosts.includes(postId)) readPosts.push(postId);
          } else {
            const index = readPosts.indexOf(postId);
            if (index > -1) readPosts.splice(index, 1);
          }
          
          userData.readPosts = readPosts;
          saveStateToStorage();
          
          if (e.target.checked) {
            sendBoostyReaction(postId);
            window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: true }, '*');
          } else {
            removeBoostyReaction(postId);
            window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: false }, '*');
          }
          
          const updatedManga = getGroupedTitles().find(t => t.name === manga.name);
          if (updatedManga) {
            const groupCountSpan = header.querySelector('.lf-group-count');
            if (groupCountSpan) {
              groupCountSpan.textContent = `${updatedManga.readCount}/${updatedManga.posts.length}`;
            }
          }
        });
        
        const link = row.querySelector('.lf-chapter-title-link');
        link.addEventListener('click', (e) => {
          if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.classList.contains('lf-liked-checkbox')) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
          }
          
          if (state.settings.openTagsInCurrentTab) {
            if (e.ctrlKey || e.metaKey || e.button === 1) {
              return;
            }
            e.preventDefault();
            const relativeUrl = chapterUrl.replace('https://boosty.to', '');
            try {
              history.pushState({}, '', relativeUrl);
              window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            } catch (err) {
              window.location.href = chapterUrl;
            }
          }
        });
        
        list.appendChild(row);
      });
    } else {
      titles.forEach(manga => {
        list.appendChild(createMangaRow(manga));
      });
    }
    
    groupContainer.appendChild(header);
    groupContainer.appendChild(list);
    parent.appendChild(groupContainer);
  }

  // Создание строки тайтла
  function createMangaRow(manga) {
    const row = document.createElement('div');
    row.className = 'lf-manga-row';
    
    row.innerHTML = `
      <div class="lf-manga-info">
        <div class="lf-status-dot lf-${manga.statusColor}" title="${getStatusTooltip(manga.statusColor)}"></div>
        <span class="lf-manga-title" title="${escapeHtml(manga.name)}">${escapeHtml(manga.name)}</span>
      </div>
      <div class="lf-manga-meta">
        <span class="lf-manga-progress">${manga.readCount}/${manga.posts.length}</span>
      </div>
    `;
    
    row.addEventListener('click', () => {
      state.ui.activeTitle = manga.name;
      if (manga.name === 'Объявления') {
        state.ui.sortAsc = false;
      }
      render();
    });
    
    return row;
  }

  function getStatusTooltip(color) {
    switch (color) {
      case 'green': return 'Просмотрено полностью';
      case 'yellow': return 'Есть непросмотренные главы';
      case 'red': return 'Брошено';
      case 'grey':
      default: return 'Просмотр не начат';
    }
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА ДЕТАЛЬНОГО ВИДА ТАЙТЛА
  // -------------------------------------------------------------
  function renderDetailContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    const manga = getGroupedTitles().find(t => t.name === state.ui.activeTitle);
    if (!manga) {
      state.ui.activeTitle = null;
      render();
      return;
    }
    
    // Формируем правильную ссылку на тег (используя ID тега, если он есть)
    const tagUrl = manga.tagId 
      ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
      : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
      
    const targetAttr = state.settings.openTagsInCurrentTab ? '' : 'target="_blank"';
    const isAnnouncements = manga.name === 'Объявления';
    
    container.innerHTML = `
      <div class="lf-detail">
        <!-- Кнопка Назад -->
        <div class="lf-detail-back" id="lf-detail-back">
          <svg viewBox="0 0 24 24">
            <path d="M20,11H7.83L13.41,5.41L12,4L4,12L12,20L13.41,18.59L7.83,13H20V11Z" />
          </svg>
          Назад к списку
        </div>
        
        <!-- Заголовок -->
        <h2 class="lf-detail-title">
          ${isAnnouncements 
            ? `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(manga.name)}</span>`
            : `<a class="lf-detail-title-link" href="${tagUrl}" ${targetAttr} title="Открыть тег на Boosty">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(manga.name)}</span>
                <svg viewBox="0 0 24 24">
                  <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                </svg>
              </a>`
          }
        </h2>
        
        <div class="lf-detail-category">${manga.category ? escapeHtml(manga.category) : 'Категория не определена'}</div>
        
        <!-- Статус -->
        ${isAnnouncements ? '' : `
          <div class="lf-status-container">
            <span class="lf-field-label">Статус отслеживания</span>
            <select class="lf-status-select" id="lf-status-select">
              <option value="favorite" ${manga.status === 'favorite' ? 'selected' : ''}>⭐ Избранное</option>
              <option value="watching" ${manga.status === 'watching' ? 'selected' : ''}>🟡 Смотрю</option>
              <option value="completed" ${manga.status === 'completed' ? 'selected' : ''}>🟢 Завершено</option>
              <option value="dropped" ${manga.status === 'dropped' ? 'selected' : ''}>🔴 Брошено</option>
              <option value="none" ${manga.status === 'none' ? 'selected' : ''}>⚪ Не отслеживаю</option>
            </select>
          </div>
        `}
        
        <!-- Блокнот -->
        <div class="lf-notes-container">
          <span class="lf-field-label">Блокнот (Заметки)</span>
          <textarea class="lf-notes-textarea" id="lf-notes-textarea" placeholder="Напишите здесь важные заметки... (сохраняется автоматически)">${escapeHtml(manga.notes)}</textarea>
        </div>
        
        <!-- Раздел глав -->
        <div>
          <div class="lf-chapters-header">
            <span class="lf-field-label">Список глав (${manga.readCount}/${manga.posts.length})</span>
            <button class="lf-sort-btn" id="lf-sort-btn">
              <svg viewBox="0 0 24 24" style="transform: ${state.ui.sortAsc ? 'none' : 'rotate(180deg)'}">
                <path d="M10,18H14V16H10V18M3,6V8H21V6H3M6,13H18V11H6V13Z" />
              </svg>
              ${state.ui.sortAsc ? 'Старые вверху' : 'Новые вверху'}
            </button>
          </div>
          
          <div class="lf-chapters-list" id="lf-chapters-list" style="margin-top: 10px;">
            <!-- Список постов рендерится ниже -->
          </div>
        </div>
      </div>
    `;

    // Подключение событий
    document.getElementById('lf-detail-back').addEventListener('click', () => {
      state.ui.activeTitle = null;
      render();
    });
    
    // Изменение статуса
    const statusSelect = document.getElementById('lf-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        ensureUserData(manga.name).status = newStatus;
        saveStateToStorage();
        
        // Показываем уведомление о переносе тайтла
        if (newStatus !== 'none') {
          const statusesRu = { watching: 'Смотрю', favorite: 'Избранное', completed: 'Завершено', dropped: 'Брошено' };
          showNotification(`Тайтл перенесен в раздел «${statusesRu[newStatus]}»`);
        }
      });
    }
    
    // Блокнот
    const notesTextarea = document.getElementById('lf-notes-textarea');
    notesTextarea.addEventListener('input', (e) => {
      ensureUserData(manga.name).notes = e.target.value;
      debounceSave();
    });
    
    // Сортировка глав
    const sortChaptersBtn = document.getElementById('lf-sort-btn');
    if (sortChaptersBtn) {
      sortChaptersBtn.addEventListener('click', () => {
        state.ui.sortAsc = !state.ui.sortAsc;
        renderDetailContent(); // Перерисовываем полностью
      });
    }

    // SPA-переход при клике на тег в текущей вкладке (без перезагрузки страницы)
    const titleLink = container.querySelector('.lf-detail-title-link');
    if (titleLink) {
      titleLink.addEventListener('click', (e) => {
        // Если открываем в новой вкладке (зажата клавиша Ctrl/Cmd, или средняя кнопка мыши, или настройка "открывать в текущей" выключена)
        if (!state.settings.openTagsInCurrentTab || e.ctrlKey || e.metaKey || e.button === 1) {
          // Позволяем браузеру выполнить стандартное поведение (открыть в новой вкладке)
          return;
        }
        
        // Отменяем стандартную перезагрузку страницы
        e.preventDefault();
        
        // Получаем путь относительно домена
        const relativeUrl = tagUrl.replace('https://boosty.to', '');
        
        // Делаем плавный SPA-переход
        try {
          history.pushState({}, '', relativeUrl);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        } catch (err) {
          // Если что-то пошло не так, переходим с перезагрузкой
          window.location.href = tagUrl;
        }
      });
    }
    
    // Рендер самих глав
    renderChaptersList(manga);
  }

  // Отрисовка списка глав
  function renderChaptersList(manga) {
    const container = document.getElementById('lf-chapters-list');
    if (!container) return;
    
    // Формируем правильную ссылку на тег (используя ID тега, если он есть)
    const tagUrl = manga.tagId 
      ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
      : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
      
    // Копируем посты для сортировки
    const sortedPosts = [...manga.posts];
    if (!state.ui.sortAsc) {
      sortedPosts.reverse();
    }
    
    container.innerHTML = '';
    const readSet = new Set((manga.readPosts || []).map(String));
    const isAnnouncements = manga.name === 'Объявления';
    
    sortedPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'lf-chapter-row';
      
      const isLiked = state.settings.syncLikes && post.isLiked;
      const isChecked = readSet.has(String(post.id)) || isLiked;
      
      const dateStr = formatDate(post.publishTime);
      
      let chapterUrl;
      let targetAttr;

      if (state.settings.openChaptersInFeed && !isAnnouncements) {
        chapterUrl = `${tagUrl}#post-${post.id}`;
        targetAttr = state.settings.openTagsInCurrentTab ? '' : 'target="_blank"';
      } else {
        chapterUrl = `https://boosty.to/lightfoxmanga/posts/${post.id}`;
        targetAttr = state.settings.openTagsInCurrentTab ? '' : 'target="_blank"';
      }

      row.innerHTML = `
        <input type="checkbox" class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? 'title="Этот пост лайкнут на Boosty"' : ''}>
        <a class="lf-chapter-title-link" href="${chapterUrl}" ${targetAttr} title="${escapeHtml(post.title)}">
          ${escapeHtml(post.title)}
        </a>
        <span class="lf-chapter-date">${dateStr}</span>
      `;
      
      // Клик по чекбоксу
      const checkbox = row.querySelector('.lf-chapter-checkbox');
      checkbox.addEventListener('change', (e) => {
        // Мы больше не блокируем снятие галочки для пролайканных постов
        if (e.target.classList.contains('lf-liked-checkbox') && !e.target.checked) {
          e.target.classList.remove('lf-liked-checkbox');
        } else if (e.target.checked) {
          e.target.classList.add('lf-liked-checkbox');
        }
        
        const userData = ensureUserData(manga.name);
        
        const postId = String(e.target.dataset.postId);
        const readPosts = userData.readPosts || [];
        
        if (e.target.checked) {
          if (!readPosts.includes(postId)) readPosts.push(postId);
        } else {
          const index = readPosts.indexOf(postId);
          if (index > -1) readPosts.splice(index, 1);
        }
        
        userData.readPosts = readPosts;
        saveStateToStorage();
        
        // Отправляем прямой запрос на обновление лайка на сервере Boosty
        if (e.target.checked) {
          sendBoostyReaction(postId);
          // Дополнительно отправляем запрос в page_script.js для визуального обновления DOM
          window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: true }, '*');
        } else {
          removeBoostyReaction(postId);
          // Дополнительно отправляем запрос в page_script.js для визуального обновления DOM
          window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: false }, '*');
        }
        
        // Обновляем циферки прогресса в заголовке
        const updatedManga = getGroupedTitles().find(t => t.name === manga.name);
        if (updatedManga) {
          const headerLabel = document.querySelector('.lf-chapters-header .lf-field-label');
          if (headerLabel) {
            headerLabel.textContent = `Список глав (${updatedManga.readCount}/${updatedManga.posts.length})`;
          }
        }
      });
      
      // Клик по ссылке на главу
      const link = row.querySelector('.lf-chapter-title-link');
      link.addEventListener('click', (e) => {
        // Автоматическое помечание как просмотренного при переходе по ссылке
        if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.classList.contains('lf-liked-checkbox')) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change'));
        }

        // SPA-переход, если включен openTagsInCurrentTab (для обычных глав — при openChaptersInFeed, для Объявлений — всегда)
        const shouldSpa = state.settings.openTagsInCurrentTab && (state.settings.openChaptersInFeed || isAnnouncements);
        if (shouldSpa) {
          // Исключаем открытие в новой вкладке (Ctrl/Cmd/средний клик)
          if (e.ctrlKey || e.metaKey || e.button === 1) {
            return;
          }
          e.preventDefault();
          
          const relativeUrl = chapterUrl.replace('https://boosty.to', '');
          try {
            history.pushState({}, '', relativeUrl);
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
          } catch (err) {
            window.location.href = chapterUrl;
          }
        }
      });
      
      container.appendChild(row);
    });
  }

  // Красивое форматирование даты (например, "15 мая 2026")
  function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const months = [
      'янв', 'фев', 'мар', 'апр', 'май', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  // Запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Экспорт для среды тестирования (Node.js/Vitest)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      state,
      ensureUserData,
      formatDate,
      arePostsEqual,
      getGroupedTitles,
      BLOG_SLUG,
      TAGS_BLACKLIST,
      TAB_NAMES
    };
  }
})();
