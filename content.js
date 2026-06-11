/* content.js - Помощник по отслеживанию озвучек на Boosty (LightFox Manga Assistant) */

(function () {
  'use strict';

  const BLOG_SLUG = 'lightfoxmanga';
  const STORAGE_KEY = `lf_state_${BLOG_SLUG}`;
  
  // Черный список служебных тегов (будут отфильтрованы, чтобы оставить только названия манги)
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
    completed: 'Пройдено',
    dropped: 'Брошено'
  };

  // SVG-путь иконки лисы (используется в нескольких местах интерфейса)
  const FOX_SVG_PATH = 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12C20,13.72 19.46,15.31 18.55,16.62L17.06,14.65C17.38,13.82 17.2,12.87 16.54,12.21C15.8,11.47 14.65,11.41 13.84,12.03L12,10.19V6H11V10.19L9.16,12.03C8.35,11.41 7.2,11.47 6.46,12.21C5.8,12.87 5.62,13.82 5.94,14.65L4.45,16.62C3.54,15.31 3,13.72 3,12A8,8 0 0,1 12,4M12,12.5A1.5,1.5 0 0,0 10.5,14A1.5,1.5 0 0,0 12,15.5A1.5,1.5 0 0,0 13.5,14A1.5,1.5 0 0,0 12,12.5Z';

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
  }

  // Глобальное состояние
  let state = {
    posts: [],          // Кэш постов с API [{id, title, publishTime, tags, subscriptionLevel, isLiked}]
    user_data: {},      // Прогресс пользователя { "Название тайтла": { status, notes, readPosts: [] } }
    lastVisit: 0,       // Время предыдущего визита
    collapsedGroups: {},// Свернутые категории { "Любителям манги": true }
    settings: {
      syncLikes: true,   // Учитывать лайки как просмотренное
      autoMarkOpen: false, // Автоматически помечать главу как прочитанную при открытии
      tabOrder: ['favorite', 'watching', 'new', 'all', 'completed', 'dropped'],
      zoom: 125,         // Масштаб боковой панели (100%, 110%, 120%, 125%, 130%, 140%, 150%)
      sidebarOpen: false  // Состояние открытости панели (сохраняется)
    },
    
    // Временное состояние интерфейса (не сохраняется в БД)
    ui: {
      activeTab: 'favorite', // 'favorite', 'watching', 'new', 'all', 'completed', 'dropped'
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

  // Управление видимостью интерфейса в зависимости от URL
  async function checkUrlAndToggleVisibility() {
    const isTarget = isTargetPage();
    const btn = document.getElementById('lf-trigger-btn');
    const sidebar = document.getElementById('lf-sidebar');
    
    if (isTarget) {
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
        console.log(`[LightFox content.js] Получено сообщение от page_script: пост ${postId}, isLiked=${isLiked}`);
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
      
      console.log(`[LightFox] Перехвачен лайк на Boosty: пост ${postId} — кэш обновлён`);
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
          if (saved.settings) {
            state.settings = { ...state.settings, ...saved.settings };
          }
          if (!state.settings.tabOrder || !Array.isArray(state.settings.tabOrder) || state.settings.tabOrder.length === 0) {
            state.settings.tabOrder = ['favorite', 'watching', 'new', 'all', 'completed', 'dropped'];
          }
          if (!state.settings.zoom) {
            state.settings.zoom = 125;
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
      link.download = `lightfox_progress_${dateStr}.json`;
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
      const allLinks = document.querySelectorAll(`a[href*="/posts/${postId}"]`);
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
          console.log(`[LightFox] DOM-клик лайка для поста ${postId}`);
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

  // Удаление лайка (реакции) с поста на Boosty (на Boosty это работает как toggle - отправляем тот же POST)
  async function removeBoostyReaction(postId) {
    const token = getBoostyAuthToken();
    if (!token) {
      console.warn('Не удалось снять лайк на Boosty: токен авторизации отсутствует.');
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
    
    state.posts.forEach(post => {
      // Находим все чистые теги поста (исключая технические из черного списка)
      const cleanTags = post.tags
        .map(t => t.title)
        .filter(title => !TAGS_BLACKLIST.includes(title.toLowerCase()));
      
      // Если после фильтрации тегов не осталось, относим к категории "Разное"
      if (cleanTags.length === 0) {
        cleanTags.push('Разное');
      }
      
      // Добавляем пост во все соответствующие группы тегов
      cleanTags.forEach(tagTitle => {
        const normalizedTag = tagTitle.charAt(0).toUpperCase() + tagTitle.slice(1);
        if (!titlesMap[normalizedTag]) {
          titlesMap[normalizedTag] = {
            name: normalizedTag,
            posts: [],
            subscriptionLevels: new Set()
          };
        }
        titlesMap[normalizedTag].posts.push(post);
        if (post.subscriptionLevel && post.subscriptionLevel.name) {
          titlesMap[normalizedTag].subscriptionLevels.add(post.subscriptionLevel.name);
        }
      });
    });
    
    // Формируем финальный массив тайтлов с подсчетом прогресса и метаданных
    return Object.values(titlesMap).map(title => {
      // Сортируем посты внутри тайтла по времени публикации (по умолчанию по возрастанию для хронологии глав)
      title.posts.sort((a, b) => a.publishTime - b.publishTime);
      
      const userTitleData = state.user_data[title.name] || { status: 'none', notes: '', readPosts: [] };
      
      // Подсчет количества прослушанных постов
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
      let category = 'Все';
      const lowercaseName = title.name.toLowerCase();
      
      if (lowercaseName.includes('только для девушек') || lowercaseName.includes('охотник на охотника')) {
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
      
      return {
        ...title,
        status: userTitleData.status || 'none',
        notes: userTitleData.notes || '',
        readPosts: userTitleData.readPosts || [],
        readCount,
        statusColor,
        isNewTitle,
        hasNewChapters,
        category
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
    btn.title = 'Помощник LightFox';
    
    // Иконка лисы (Fox SVG)
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${FOX_SVG_PATH}" /></svg>`;
    
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
      sidebar.style.setProperty('--lf-zoom', state.settings.zoom / 100);
    }
    
    // Предотвращаем закрытие панели при кликах внутри неё
    sidebar.addEventListener('click', (event) => {
      event.stopPropagation();
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
            <svg class="lf-logo" viewBox="0 0 24 24"><path d="${FOX_SVG_PATH}" /></svg>
            <h1 class="lf-title">LightFox Boosty Bookmark</h1>
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
          <div class="lf-search-container">
            <svg class="lf-search-icon" viewBox="0 0 24 24">
              <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
            </svg>
            <input type="text" id="lf-search" class="lf-search-input" placeholder="Поиск манги..." value="${escapeHtml(state.ui.searchQuery)}">
          </div>
        ` : ''}
      </div>

      <!-- Вкладки (только в списке) -->
      ${!state.ui.activeTitle ? `
        <div class="lf-tabs">
          ${state.settings.tabOrder.map(tabKey => `
            <button class="lf-tab-btn ${state.ui.activeTab === tabKey ? 'lf-active' : ''}" data-tab="${tabKey}">${TAB_NAMES[tabKey] || tabKey}</button>
          `).join('')}
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
        state.ui.activeTab = 'settings';
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
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          state.ui.searchQuery = e.target.value;
          renderListContent();
        });
      }
      
      // Вкладки
      const tabButtons = sidebar.querySelectorAll('.lf-tab-btn');
      tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          state.ui.activeTab = e.target.dataset.tab;
          render();
        });
      });
      
      renderListContent();
    } else {
      renderDetailContent();
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
              <div class="lf-settings-desc">Считать лайкнутые посты на Boosty прослушанными главами.</div>
            </label>
            <input type="checkbox" id="lf-setting-sync-likes" class="lf-settings-checkbox" ${state.settings.syncLikes ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-auto-mark">
              Автоотметка при открытии
              <div class="lf-settings-desc">Автоматически помечать главу как прочитанную при переходе по ссылке.</div>
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
              <option value="100" ${state.settings.zoom === 100 ? 'selected' : ''}>100%</option>
              <option value="110" ${state.settings.zoom === 110 ? 'selected' : ''}>110%</option>
              <option value="120" ${state.settings.zoom === 120 ? 'selected' : ''}>120%</option>
              <option value="125" ${state.settings.zoom === 125 ? 'selected' : ''}>125%</option>
              <option value="130" ${state.settings.zoom === 130 ? 'selected' : ''}>130%</option>
              <option value="140" ${state.settings.zoom === 140 ? 'selected' : ''}>140%</option>
              <option value="150" ${state.settings.zoom === 150 ? 'selected' : ''}>150%</option>
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
          <div><strong>Название:</strong> LightFox Boosty Bookmark</div>
          <div><strong>Версия:</strong> 1.0</div>
          <div style="margin-top: 8px;">Разработано для быстрого и удобного отслеживания глав на странице автора lightfoxmanga.</div>
        </div>
      </div>
    `;

    // Подключение событий кнопок экспорта/импорта
    document.getElementById('lf-export-btn').addEventListener('click', exportUserData);
    
    const importBtn = document.getElementById('lf-import-btn');
    const importInput = document.getElementById('lf-import-input');
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', importUserData);

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

    // Подключение событий выбора масштаба
    const zoomSelect = document.getElementById('lf-setting-zoom');
    if (zoomSelect) {
      zoomSelect.addEventListener('change', (e) => {
        const newZoom = parseInt(e.target.value);
        state.settings.zoom = newZoom;
        saveStateToStorage();
        
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.style.setProperty('--lf-zoom', newZoom / 100);
        }
        
        showNotification(`Масштаб изменен на ${newZoom}%`);
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
          <svg viewBox="0 0 24 24"><path d="${FOX_SVG_PATH}" /></svg>
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
    
    // Сортировка по алфавиту
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
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
    
    // Для вкладок «Смотрю», «Избранное», «Пройдено», «Брошено» выводим простым списком
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
      'Любителям ютуба',
      'Любителям манги',
      'Только для девушек',
      'Любителям пика',
      'Для шейхов',
      'Лисямбы мои',
      'Все'
    ];
    
    categories.forEach(catName => {
      const catTitles = filtered.filter(t => t.category === catName);
      if (catTitles.length > 0) {
        renderGroup(container, catName, catTitles);
      }
    });
  }

  // Отрисовка одной группы тайтлов (выпадающий список)
  function renderGroup(parent, groupName, titles) {
    const groupContainer = document.createElement('div');
    const isCollapsed = state.collapsedGroups[groupName] !== false;
    groupContainer.className = `lf-group-container ${isCollapsed ? 'lf-collapsed' : ''}`;
    
    const header = document.createElement('div');
    header.className = 'lf-group-header';
    header.innerHTML = `
      <div class="lf-group-header-left">
        <svg class="lf-group-arrow" viewBox="0 0 24 24">
          <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
        </svg>
        <span>${groupName}</span>
      </div>
      <span class="lf-group-count">${titles.length}</span>
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
    
    titles.forEach(manga => {
      list.appendChild(createMangaRow(manga));
    });
    
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
      render();
    });
    
    return row;
  }

  function getStatusTooltip(color) {
    switch (color) {
      case 'green': return 'Прослушано полностью';
      case 'yellow': return 'Есть непрослушанные главы';
      case 'red': return 'Брошено';
      case 'grey':
      default: return 'Прослушивание не начато';
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
    
    const tagQuery = encodeURIComponent(manga.name);
    
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
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(manga.name)}">${escapeHtml(manga.name)}</span>
          <a class="lf-detail-link" href="https://boosty.to/lightfoxmanga?media=all&tag=${tagQuery}" target="_blank" title="Открыть тег на Boosty">
            <svg viewBox="0 0 24 24">
              <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
            </svg>
          </a>
        </h2>
        
        <!-- Статус -->
        <div class="lf-status-container">
          <span class="lf-field-label">Статус отслеживания</span>
          <select class="lf-status-select" id="lf-status-select">
            <option value="none" ${manga.status === 'none' ? 'selected' : ''}>⚪ Не отслеживаю</option>
            <option value="favorite" ${manga.status === 'favorite' ? 'selected' : ''}>⭐ Избранное</option>
            <option value="watching" ${manga.status === 'watching' ? 'selected' : ''}>🟡 Смотрю</option>
            <option value="completed" ${manga.status === 'completed' ? 'selected' : ''}>🟢 Завершено</option>
            <option value="dropped" ${manga.status === 'dropped' ? 'selected' : ''}>🔴 Брошено</option>
          </select>
        </div>
        
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
    statusSelect.addEventListener('change', (e) => {
      const newStatus = e.target.value;
      ensureUserData(manga.name).status = newStatus;
      saveStateToStorage();
      
      // Показываем уведомление о переносе тайтла
      if (newStatus !== 'none') {
        const statusesRu = { watching: 'Смотрю', favorite: 'Избранное', completed: 'Завершенное', dropped: 'Брошенное' };
        showNotification(`Тайтл перенесен в раздел «${statusesRu[newStatus]}»`);
      }
    });
    
    // Блокнот
    const notesTextarea = document.getElementById('lf-notes-textarea');
    notesTextarea.addEventListener('input', (e) => {
      ensureUserData(manga.name).notes = e.target.value;
      debounceSave();
    });
    
    // Сортировка глав
    document.getElementById('lf-sort-btn').addEventListener('click', () => {
      state.ui.sortAsc = !state.ui.sortAsc;
      renderDetailContent(); // Перерисовываем полностью
    });
    
    // Рендер самих глав
    renderChaptersList(manga);
  }

  // Отрисовка списка глав
  function renderChaptersList(manga) {
    const container = document.getElementById('lf-chapters-list');
    if (!container) return;
    
    // Копируем посты для сортировки
    const sortedPosts = [...manga.posts];
    if (!state.ui.sortAsc) {
      sortedPosts.reverse();
    }
    
    container.innerHTML = '';
    const readSet = new Set((manga.readPosts || []).map(String));
    
    sortedPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'lf-chapter-row';
      
      const isLiked = state.settings.syncLikes && post.isLiked;
      const isChecked = readSet.has(String(post.id)) || isLiked;
      
      const dateStr = formatDate(post.publishTime);
      
      row.innerHTML = `
        <input type="checkbox" class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? 'title="Этот пост лайкнут на Boosty"' : ''}>
        <a class="lf-chapter-title-link" href="https://boosty.to/lightfoxmanga/posts/${post.id}" target="_blank" title="${escapeHtml(post.title)}">
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
      
      // Автоматическое помечание как прочитанного при переходе по ссылке
      const link = row.querySelector('.lf-chapter-title-link');
      link.addEventListener('click', () => {
        if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.classList.contains('lf-liked-checkbox')) {
          checkbox.checked = true;
          // Инициируем событие change вручную
          checkbox.dispatchEvent(new Event('change'));
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
})();
