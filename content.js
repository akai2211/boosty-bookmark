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

  // SVG-путь иконки лисы (используется в нескольких местах интерфейса)
  const FOX_SVG_PATH = 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12C20,13.72 19.46,15.31 18.55,16.62L17.06,14.65C17.38,13.82 17.2,12.87 16.54,12.21C15.8,11.47 14.65,11.41 13.84,12.03L12,10.19V6H11V10.19L9.16,12.03C8.35,11.41 7.2,11.47 6.46,12.21C5.8,12.87 5.62,13.82 5.94,14.65L4.45,16.62C3.54,15.31 3,13.72 3,12A8,8 0 0,1 12,4M12,12.5A1.5,1.5 0 0,0 10.5,14A1.5,1.5 0 0,0 12,15.5A1.5,1.5 0 0,0 13.5,14A1.5,1.5 0 0,0 12,12.5Z';

  // Экранирование HTML-спецсимволов для безопасной вставки в шаблоны
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Глобальное состояние
  let state = {
    posts: [],          // Кэш постов с API [{id, title, publishTime, tags, subscriptionLevel, isLiked}]
    user_data: {},      // Прогресс пользователя { "Название тайтла": { status, notes, readPosts: [] } }
    lastVisit: 0,       // Время предыдущего визита
    collapsedGroups: {},// Свернутые категории { "Любителям манги": true }
    settings: {
      syncLikes: true,   // Учитывать лайки как просмотренное
      autoMarkOpen: true // Автоматически помечать главу как прочитанную при открытии
    },
    
    // Временное состояние интерфейса (не сохраняется в БД)
    ui: {
      open: false,
      activeTab: 'watching', // 'watching', 'favorite', 'new', 'all', 'completed', 'dropped'
      searchQuery: '',
      activeTitle: null,     // Название тайтла, открытого в детальном виде (null = список)
      sortAsc: true,         // Сортировка глав: true - сначала старые (1-10, 11-20), false - новые
      isSyncing: false,      // Флаг активного процесса загрузки всей базы
      syncProgress: 0
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
        createTriggerButton();
        createSidebar();
        
        // Запускаем фоновую синхронизацию (проверка новых постов)
        if (state.posts.length > 0) {
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
        sidebar.classList.remove('lf-open');
        state.ui.open = false;
      }
    }
  }

  // Перехват истории переходов SPA (React Router / HTML5 History API)
  function patchHistory() {
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    
    history.pushState = function () {
      const result = pushState.apply(this, arguments);
      window.dispatchEvent(new Event('lf_locationchange'));
      return result;
    };
    
    history.replaceState = function () {
      const result = replaceState.apply(this, arguments);
      window.dispatchEvent(new Event('lf_locationchange'));
      return result;
    };
    
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('lf_locationchange'));
    });
    
    window.addEventListener('hashchange', () => {
      window.dispatchEvent(new Event('lf_locationchange'));
    });
    
    window.addEventListener('lf_locationchange', checkUrlAndToggleVisibility);
  }

  // Инициализация расширения
  async function init() {
    await loadStateFromStorage();
    
    // Обновляем время визита
    const now = Date.now();
    if (!state.lastVisit) {
      state.lastVisit = now - 24 * 60 * 60 * 1000; // Если первый раз, считаем что последний визит был день назад
    }
    
    // Настраиваем перехват навигации SPA
    patchHistory();
    
    // Запускаем периодическую проверку URL
    setInterval(checkUrlAndToggleVisibility, 500);
    
    // Первичная проверка текущей страницы
    await checkUrlAndToggleVisibility();
    
    // Слушаем закрытие страницы, чтобы обновить время последнего визита
    window.addEventListener('beforeunload', () => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const data = res[STORAGE_KEY] || {};
        data.lastVisit = Date.now();
        const update = {};
        update[STORAGE_KEY] = data;
        chrome.storage.local.set(update);
      });
    });

    // Слушаем клики по всему документу для автозакрытия панели при клике снаружи
    document.addEventListener('click', (event) => {
      const sidebar = document.getElementById('lf-sidebar');
      const btn = document.getElementById('lf-trigger-btn');
      
      if (state.ui.open && sidebar && btn) {
        // Если клик мимо боковой панели и мимо кнопки-триггера
        if (!sidebar.contains(event.target) && !btn.contains(event.target)) {
          state.ui.open = false;
          sidebar.classList.remove('lf-open');
        }
      }
    });
  }

  // Загрузка состояния из chrome.storage.local
  function loadStateFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const saved = res[STORAGE_KEY] || {};
        state.posts = saved.posts || [];
        state.user_data = saved.user_data || {};
        state.lastVisit = saved.lastVisit || 0;
        state.collapsedGroups = saved.collapsedGroups || {};
        if (saved.settings) {
          state.settings = { ...state.settings, ...saved.settings };
        }
        resolve();
      });
    });
  }

  // Сохранение состояния в chrome.storage.local
  function saveStateToStorage() {
    return new Promise((resolve) => {
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
        resolve();
      });
    });
  }

  // -------------------------------------------------------------
  // ЛОГИКА СИНХРОНИЗАЦИИ И АНАЛИЗА API
  // -------------------------------------------------------------

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
        const response = await fetch(url);
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
      const response = await fetch(url);
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
    
    btn.addEventListener('click', () => {
      state.ui.open = !state.ui.open;
      const sidebar = document.getElementById('lf-sidebar');
      if (sidebar) {
        if (state.ui.open) {
          sidebar.classList.add('lf-open');
          // Автоматически определяем текущую тему Boosty при открытии
          detectAndApplyTheme();
        } else {
          sidebar.classList.remove('lf-open');
        }
      }
    });
    
    document.body.appendChild(btn);
  }

  // Создание контейнера боковой панели
  function createSidebar() {
    if (document.getElementById('lf-sidebar')) return;
    
    const sidebar = document.createElement('div');
    sidebar.id = 'lf-sidebar';
    sidebar.className = 'lf-dark'; // По умолчанию темная
    
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
            <!-- Кнопка синхронизации -->
            <button id="lf-sync-btn" class="lf-btn-icon" title="Синхронизировать базу постов">
              <svg viewBox="0 0 24 24">
                <path d="M19,8L15,12H18A6,6 0 0,1 12,18C11,18 10.1,17.65 9.35,17L7.9,18.45C9,19.45 10.45,20 12,20A8,8 0 0,0 20,12H23L19,8M6,12A6,6 0 0,1 12,6C13,6 13.9,6.35 14.65,7L16.1,5.55C15,4.55 13.55,4 12,4A8,8 0 0,0 4,12H1L5,16L9,12H6Z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="lf-stats">Тайтлов: ${uniqueTagCount} | Записей: ${state.posts.length}</div>
        
        <!-- Строка поиска (отображается только в списке) -->
        ${!state.ui.activeTitle ? `
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
          <button class="lf-tab-btn ${state.ui.activeTab === 'watching' ? 'lf-active' : ''}" data-tab="watching">Смотрю</button>
          <button class="lf-tab-btn ${state.ui.activeTab === 'favorite' ? 'lf-active' : ''}" data-tab="favorite">Избранное</button>
          <button class="lf-tab-btn ${state.ui.activeTab === 'new' ? 'lf-active' : ''}" data-tab="new">Новые</button>
          <button class="lf-tab-btn ${state.ui.activeTab === 'all' ? 'lf-active' : ''}" data-tab="all">Все</button>
          <button class="lf-tab-btn ${state.ui.activeTab === 'completed' ? 'lf-active' : ''}" data-tab="completed">Пройдено</button>
          <button class="lf-tab-btn ${state.ui.activeTab === 'dropped' ? 'lf-active' : ''}" data-tab="dropped">Брошено</button>
        </div>
      ` : ''}

      <div class="lf-body-content" id="lf-body-content">
        <!-- Сюда рендерится динамическое содержимое -->
      </div>
    `;

    // Подключаем события хедера
    document.getElementById('lf-sync-btn').addEventListener('click', performFullSync);
    
    if (!state.ui.activeTitle) {
      const searchInput = document.getElementById('lf-search');
      searchInput.addEventListener('input', (e) => {
        state.ui.searchQuery = e.target.value;
        renderListContent();
      });
      
      // Вкладки
      const tabButtons = sidebar.querySelectorAll('.lf-tab-btn');
      tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          state.ui.activeTab = e.target.dataset.tab;
          tabButtons.forEach(b => b.classList.remove('lf-active'));
          e.target.classList.add('lf-active');
          renderListContent();
        });
      });
      
      renderListContent();
    } else {
      renderDetailContent();
    }
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА СПИСКА ТАЙТЛОВ
  // -------------------------------------------------------------
  function renderListContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
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
    const isCollapsed = !!state.collapsedGroups[groupName];
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
        delete state.collapsedGroups[groupName];
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
            <option value="none" ${manga.status === 'none' ? 'selected' : ''}>Не отслеживаю</option>
            <option value="watching" ${manga.status === 'watching' ? 'selected' : ''}>Смотрю/Читаю</option>
            <option value="favorite" ${manga.status === 'favorite' ? 'selected' : ''}>Избранное</option>
            <option value="completed" ${manga.status === 'completed' ? 'selected' : ''}>Завершено</option>
            <option value="dropped" ${manga.status === 'dropped' ? 'selected' : ''}>Брошено</option>
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
        <input type="checkbox" class="lf-chapter-checkbox" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? 'disabled title="Этот пост лайкнут на Boosty"' : ''}>
        <a class="lf-chapter-title-link" href="https://boosty.to/lightfoxmanga/posts/${post.id}" target="_blank" title="${escapeHtml(post.title)}">
          ${escapeHtml(post.title)}
        </a>
        <span class="lf-chapter-date">${dateStr}</span>
      `;
      
      // Клик по чекбоксу
      const checkbox = row.querySelector('.lf-chapter-checkbox');
      checkbox.addEventListener('change', (e) => {
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
        if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.disabled) {
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
