/* state.js — Глобальное состояние, конфигурация WebDAV и работа с chrome.storage. */

import { t } from './locales.js';
import { BLOG_SLUG, STORAGE_KEY, WEBDAV_CONFIG_KEY, isExtensionContextValid } from './utils.js';

// Внешние зависимости (рендер UI, уведомления, синхронизация), внедряются из content.js
// через setStateDeps() — разрывает цикл state ↔ sidebar/sync.
const deps = {
  render: () => {},
  showNotification: () => {},
  performWebDavSync: () => Promise.resolve(),
  isWebDavConfigured: () => false
};

function setStateDeps(overrides) {
  Object.assign(deps, overrides);
}

// Глобальное состояние
let state = {
  posts: [],          // Кэш постов с API [{id, title, publishTime, tags, subscriptionLevel, isLiked}]
  user_data: {},      // Прогресс пользователя { "Название тайтла": { status, notes, readPosts: [] } }
  lastVisit: 0,       // Время предыдущего визита
  collapsedGroups: {},// Свернутые категории { "Любителям манги": true }
  blogDescriptionLinks: [], // Ссылки из описания профиля [{url, title}]
  playerTimestamps: {}, // Сохраненные таймстампы плееров { [id]: timeInSeconds }
  newTitles: [],      // Имена новых тайтлов
  newChapters: [],     // Имена тайтлов с новыми главами
  settings: {
    syncLikes: true,   // Учитывать лайки как просмотренное
    syncTitleFromUrl: true, // Автоматический переход к тайтлу при выборе тега на Boosty
    autoMarkOpen: false, // Автоматически помечать главу как прочитанную при открытии
    savePlayerTime: true, // Сохранять и восстанавливать время видео/аудио
    forceVideoQuality: false, // Принудительное качество видео
    videoQuality: '1080p', // Предпочитаемое качество видео по умолчанию
    tabOrder: ['favorite', 'new', 'watching', 'all', 'completed', 'dropped'],
    zoom: 1.25,         // Коэффициент масштаба боковой панели (соответствует 100% в UI)
    zoomMigrated: true, // Флаг выполненной миграции масштаба
    sidebarOpen: false, // Состояние открытости панели (сохраняется)
    openTitlesInCurrentTab: true, // Открывать тайтлы в текущей вкладке
    openChaptersInFeed: true, // Искать и открывать главы в ленте тайтла
    groupAllViewed: true, // Выносить тайтлы с 100% прогрессом в группу «Просмотрены все главы»
    titleSort: 'name_asc' // Сортировка тайтлов: 'name_asc', 'name_desc', 'new_desc', 'new_asc', 'chapters_desc', 'chapters_asc', 'progress_desc', 'progress_asc'
  },

  // Временное состояние интерфейса (не сохраняется в БД)
  ui: {
    activeTab: 'favorite', // 'favorite', 'watching', 'new', 'all', 'completed', 'dropped'
    previousTab: 'favorite', // Запоминает предыдущую вкладку перед переходом в настройки
    searchQuery: '',
    activeTitle: null,     // Название тайтла, открытого в детальном виде (null = список)
    sortAsc: false,        // Сортировка глав: true - сначала старые (1-10, 11-20), false - новые
    isSyncing: false,      // Флаг активного процесса загрузки всей базы
    syncProgress: 0,
    tabOrderExpanded: false, // По умолчанию свернут порядок вкладок
    syncBackupExpanded: false, // По умолчанию свернута секция синхронизации и бэкапа
    webdavSyncing: false,
    webdavTesting: false,
    showAccessCode: false
  }
};

// Конфигурация WebDAV (хранится отдельно от прогресса каналов)
let webdavConfig = {
  provider: 'yandex', // 'yandex' или 'webdav'
  enabled: false,
  baseUrl: '',
  username: '',
  accessCode: '',
  lastSyncAt: 0,
  lastSyncStatus: ''
};

// Инициализация/получение данных пользователя для тайтла (устраняет дублирование)
function ensureUserData(titleName) {
  if (!state.user_data[titleName]) {
    state.user_data[titleName] = { status: 'none', notes: '', readPosts: [], updatedAt: 0 };
  }
  return state.user_data[titleName];
}

function updateExtensionBadge() {
  if (!isExtensionContextValid()) return;
  try {
    const newCount = (state.newTitles ? state.newTitles.length : 0) + (state.newChapters ? state.newChapters.length : 0);
    if (newCount > 0) {
      chrome.runtime.sendMessage({ action: 'updateBadge', text: String(newCount) });
    } else {
      chrome.runtime.sendMessage({ action: 'updateBadge', text: '' });
    }
  } catch (e) {
    // Игнорируем ошибки обмена сообщениями
  }
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
        state.playerTimestamps = saved.playerTimestamps || {};
        state.newTitles = saved.newTitles || [];
        state.newChapters = saved.newChapters || [];
        if (saved.settings) {
          state.settings = { ...state.settings, ...saved.settings };
          // Миграция openTagsInCurrentTab -> openTitlesInCurrentTab
          if (saved.settings.openTagsInCurrentTab !== undefined && saved.settings.openTitlesInCurrentTab === undefined) {
            state.settings.openTitlesInCurrentTab = saved.settings.openTagsInCurrentTab;
            delete state.settings.openTagsInCurrentTab;
            saveStateToStorage();
          }
          // Миграция openTagsInNewTab -> openTitlesInCurrentTab
          if (saved.settings.openTagsInNewTab !== undefined && saved.settings.openTitlesInCurrentTab === undefined) {
            state.settings.openTitlesInCurrentTab = !saved.settings.openTagsInNewTab;
            delete state.settings.openTagsInNewTab;
            saveStateToStorage();
          }
        }
        const oldDefaultOrder1 = ['favorite', 'watching', 'new', 'all', 'completed', 'dropped'];
        const oldDefaultOrder2 = ['favorite', 'all', 'new', 'watching', 'completed', 'dropped'];
        const oldDefaultOrder3 = ['favorite', 'all', 'watching', 'new', 'completed', 'dropped'];
        const newDefaultOrder = ['favorite', 'new', 'watching', 'all', 'completed', 'dropped'];
        if (!state.settings.tabOrder || !Array.isArray(state.settings.tabOrder) || state.settings.tabOrder.length === 0) {
          state.settings.tabOrder = newDefaultOrder;
        } else if (JSON.stringify(state.settings.tabOrder) === JSON.stringify(oldDefaultOrder1) ||
                   JSON.stringify(state.settings.tabOrder) === JSON.stringify(oldDefaultOrder2) ||
                   JSON.stringify(state.settings.tabOrder) === JSON.stringify(oldDefaultOrder3)) {
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
        updateExtensionBadge();
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

let webdavUploadTimeout;
function debouncedWebDavUpload() {
  if (!webdavConfig.enabled || !deps.isWebDavConfigured()) return;
  if (state.ui.webdavSyncing || state.ui.webdavTesting) return;

  clearTimeout(webdavUploadTimeout);
  webdavUploadTimeout = setTimeout(() => {
    if (state.ui.webdavSyncing || state.ui.webdavTesting) return;
    deps.performWebDavSync({ silent: true }).catch(() => {});
  }, 20000);
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
        playerTimestamps: state.playerTimestamps,
        newTitles: state.newTitles,
        newChapters: state.newChapters,
        settings: state.settings
      };
      const update = {};
      update[STORAGE_KEY] = data;
      chrome.storage.local.set(update, () => {
        if (chrome.runtime.lastError) { resolve(); return; }
        updateExtensionBadge();
        debouncedWebDavUpload();
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

// Экспорт прогресса пользователя в файл ZIP
function exportUserData() {
  try {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        deps.showNotification(t('notify_backup_read_error'));
        return;
      }

      const zip = new JSZip();
      let filesAdded = 0;

      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('lf_state_')) {
          const slug = key.replace('lf_state_', '');

          // Для текущего канала берем самое свежее состояние из памяти
          let channelData;
          if (slug === BLOG_SLUG) {
            channelData = {
              posts: state.posts,
              user_data: state.user_data,
              lastVisit: state.lastVisit,
              collapsedGroups: state.collapsedGroups,
              blogDescriptionLinks: state.blogDescriptionLinks,
              playerTimestamps: state.playerTimestamps,
              newTitles: state.newTitles,
              newChapters: state.newChapters,
              settings: state.settings
            };
          } else {
            channelData = value;
          }

          const dataToExport = {
            version: "2.0",
            exportDate: new Date().toISOString(),
            ...channelData
          };

          const jsonString = JSON.stringify(dataToExport, null, 2);
          zip.file(`${slug}/progress.json`, jsonString);
          filesAdded++;
        }
      }

      // Если в хранилище вдруг нет текущего канала (хотя мы его инициализировали), добавим его
      if (!result[`lf_state_${BLOG_SLUG}`]) {
        const currentChannelData = {
          version: "2.0",
          exportDate: new Date().toISOString(),
          posts: state.posts,
          user_data: state.user_data,
          lastVisit: state.lastVisit,
          collapsedGroups: state.collapsedGroups,
          blogDescriptionLinks: state.blogDescriptionLinks,
          playerTimestamps: state.playerTimestamps,
          newTitles: state.newTitles,
          newChapters: state.newChapters,
          settings: state.settings
        };
        const jsonString = JSON.stringify(currentChannelData, null, 2);
        zip.file(`${BLOG_SLUG}/progress.json`, jsonString);
        filesAdded++;
      }

      zip.generateAsync({ type: 'blob' })
        .then((content) => {
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().slice(0, 10);
          link.href = url;
          link.download = `boosty_bookmark_backup_${dateStr}.zip`;
          link.style.display = 'none';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          deps.showNotification(t('notify_export_success'));
        })
        .catch((err) => {
          console.error('Ошибка при генерации ZIP:', err);
          deps.showNotification(t('notify_zip_generate_error'));
        });
    });
  } catch (e) {
    console.error('Ошибка при экспорте прогресса:', e);
    deps.showNotification(t('notify_export_error'));
  }
}

// Импорт прогресса пользователя из файла ZIP
function importUserData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const arrayBuffer = e.target.result;
      // Загружаем ZIP с помощью библиотеки JSZip (которая внедрена через manifest)
      const zip = await JSZip.loadAsync(arrayBuffer);

      const storageUpdates = {};
      let importedChannelsCount = 0;

      // Обходим все файлы в ZIP-архиве
      for (const [relativePath, fileEntry] of Object.entries(zip.files)) {
        if (fileEntry.dir) continue;

        // Ищем структуру вида: "имя_канала/progress.json"
        const pathParts = relativePath.split('/');
        if (pathParts.length === 2 && pathParts[1] === 'progress.json') {
          const slug = pathParts[0];
          const contentText = await fileEntry.async('text');
          const importedData = JSON.parse(contentText);

          // Валидируем структуру импортированных данных (хотя бы user_data)
          if (importedData && typeof importedData === 'object' && importedData.user_data) {
            const channelState = {
              posts: importedData.posts || [],
              user_data: importedData.user_data,
              lastVisit: importedData.lastVisit || 0,
              collapsedGroups: importedData.collapsedGroups || {},
              blogDescriptionLinks: importedData.blogDescriptionLinks || [],
              playerTimestamps: importedData.playerTimestamps || {},
              newTitles: importedData.newTitles || [],
              newChapters: importedData.newChapters || [],
              settings: importedData.settings || {}
            };
            storageUpdates[`lf_state_${slug}`] = channelState;
            importedChannelsCount++;
          }
        }
      }

      if (importedChannelsCount === 0) {
        throw new Error('В архиве не найдено корректных файлов progress.json');
      }

      // Сохраняем все распакованные каналы в хранилище
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(storageUpdates, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // Если в импортированных данных был текущий канал, накатываем его в активный state
      const currentChannelKey = `lf_state_${BLOG_SLUG}`;
      if (storageUpdates[currentChannelKey]) {
        state.posts = storageUpdates[currentChannelKey].posts;
        state.user_data = storageUpdates[currentChannelKey].user_data;
        state.lastVisit = storageUpdates[currentChannelKey].lastVisit;
        state.collapsedGroups = storageUpdates[currentChannelKey].collapsedGroups;
        state.blogDescriptionLinks = storageUpdates[currentChannelKey].blogDescriptionLinks;
        state.playerTimestamps = storageUpdates[currentChannelKey].playerTimestamps;
        state.newTitles = storageUpdates[currentChannelKey].newTitles || [];
        state.newChapters = storageUpdates[currentChannelKey].newChapters || [];
        state.settings = { ...state.settings, ...storageUpdates[currentChannelKey].settings };
      }

      deps.showNotification(t('notify_import_success', importedChannelsCount));
      deps.render();
    } catch (err) {
      console.error('Ошибка при импорте бэкапа:', err);
      deps.showNotification(t('notify_import_invalid_format'));
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsArrayBuffer(file);
}

function loadWebDavConfig() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) { resolve(); return; }
    try {
      chrome.storage.local.get(WEBDAV_CONFIG_KEY, (result) => {
        if (chrome.runtime.lastError) { resolve(); return; }
        const saved = result[WEBDAV_CONFIG_KEY];
        if (saved && typeof saved === 'object') {
          webdavConfig = { ...webdavConfig, ...saved };
          // Миграция со старых полей (Яндекс / appPassword)
          if (saved.appPassword && !saved.accessCode) {
            webdavConfig.accessCode = saved.appPassword;
          }
          delete webdavConfig.appPassword;

          // Автоопределение провайдера для старых настроек
          if (!saved.provider) {
            if (webdavConfig.baseUrl && webdavConfig.baseUrl.includes('yandex')) {
              webdavConfig.provider = 'yandex';
            } else if (webdavConfig.baseUrl) {
              webdavConfig.provider = 'webdav';
            } else {
              webdavConfig.provider = 'yandex';
            }
          }
        }
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

function saveWebDavConfig() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) { resolve(); return; }
    try {
      const update = {};
      update[WEBDAV_CONFIG_KEY] = webdavConfig;
      chrome.storage.local.set(update, () => {
        if (chrome.runtime.lastError) { resolve(); return; }
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

function buildLocalChannelsMapFromStorage(storageResult) {
  const channelsMap = {};

  for (const [key, value] of Object.entries(storageResult || {})) {
    if (!key.startsWith('lf_state_')) continue;
    const slug = key.replace('lf_state_', '');

    if (slug === BLOG_SLUG) {
      channelsMap[slug] = {
        posts: state.posts,
        settings: state.settings,
        user_data: state.user_data,
        playerTimestamps: state.playerTimestamps,
        lastVisit: state.lastVisit,
        collapsedGroups: state.collapsedGroups,
        blogDescriptionLinks: state.blogDescriptionLinks
      };
    } else if (value && typeof value === 'object') {
      channelsMap[slug] = value;
    }
  }

  if (!channelsMap[BLOG_SLUG]) {
    channelsMap[BLOG_SLUG] = {
      posts: state.posts,
      settings: state.settings,
      user_data: state.user_data,
      playerTimestamps: state.playerTimestamps,
      lastVisit: state.lastVisit,
      collapsedGroups: state.collapsedGroups,
      blogDescriptionLinks: state.blogDescriptionLinks
    };
  }

  return channelsMap;
}

function applyMergedChannelToState(slug, channelData) {
  const mergedChannel = {
    posts: channelData.posts || [],
    settings: channelData.settings || {},
    user_data: channelData.user_data || {},
    playerTimestamps: channelData.playerTimestamps || {},
    lastVisit: channelData.lastVisit || 0,
    collapsedGroups: channelData.collapsedGroups || {},
    blogDescriptionLinks: channelData.blogDescriptionLinks || []
  };

  if (slug === BLOG_SLUG) {
    state.posts = mergedChannel.posts;
    state.settings = { ...state.settings, ...mergedChannel.settings };
    state.user_data = mergedChannel.user_data;
    state.playerTimestamps = mergedChannel.playerTimestamps;
    state.lastVisit = mergedChannel.lastVisit;
    state.collapsedGroups = mergedChannel.collapsedGroups;
    state.blogDescriptionLinks = mergedChannel.blogDescriptionLinks;
  }

  return mergedChannel;
}

export {
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
};
