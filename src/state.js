/* state.js — Глобальное состояние, конфигурация WebDAV и работа с chrome.storage. */

import { t } from './locales.js';
import { BLOG_SLUG, STORAGE_KEY, WEBDAV_CONFIG_KEY, isExtensionContextValid } from './utils.js';
import { mergeChannelBackupData } from './webdav-sync.js';

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
  newListsUpdatedAt: 0, // Таймстамп последнего изменения списков «Новое» (для LWW-слияния с WebDAV)
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
    previousTitle: null,   // Запоминает открытую карточку тайтла перед переходом в настройки
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

// Отметить/снять пост как прочитанный с tombstone-метками времени.
// readMarks[id]=ts — время отметки прочтения; unreadMarks[id]=ts — время снятия.
// Метки нужны для синхронизации СНЯТИЯ отметки между устройствами (см. mergeReadState).
function setPostReadState(titleName, postId, isRead) {
  const ud = ensureUserData(titleName);
  const id = String(postId);
  const now = Date.now();
  if (!ud.readMarks) ud.readMarks = {};
  if (!ud.unreadMarks) ud.unreadMarks = {};
  const list = ud.readPosts || [];
  const idx = list.findIndex((p) => String(p) === id);

  if (isRead) {
    if (idx === -1) list.push(id);
    ud.readMarks[id] = now;
    delete ud.unreadMarks[id];
  } else {
    if (idx > -1) list.splice(idx, 1);
    ud.unreadMarks[id] = now;
    delete ud.readMarks[id];
  }

  ud.readPosts = list;
  ud.updatedAt = now;
  return ud;
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
        state.newListsUpdatedAt = saved.newListsUpdatedAt || 0;
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
        // Базовый снимок настроек/новинок после загрузки/миграций — чтобы первое же
        // изменение в сессии корректно бампило соответствующий таймстамп.
        lastSettingsSnapshot = settingsFingerprint(state.settings);
        lastNewListsSnapshot = newListsFingerprint(state);
        updateExtensionBadge();
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

// Отпечаток настроек для определения их реального изменения (без эфемерных полей).
// settings.updatedAt должен бампиться только при смене пользовательских настроек,
// а не на каждом сохранении прогресса — иначе LWW-слияние настроек с WebDAV ломается
// (на той стороне настройки всегда выглядели бы «свежее»).
function settingsFingerprint(s) {
  const { updatedAt, sidebarOpen, ...rest } = s || {};
  return JSON.stringify(rest);
}
let lastSettingsSnapshot = null;

// Аналогично для списков «Новое»: newListsUpdatedAt бампится только при их реальном
// изменении, чтобы LWW-слияние с WebDAV пропагандировало в т.ч. очистку новинок.
function newListsFingerprint(s) {
  return JSON.stringify([s.newTitles || [], s.newChapters || []]);
}
let lastNewListsSnapshot = null;

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
      // Бампим settings.updatedAt только если пользовательские настройки реально изменились
      const fp = settingsFingerprint(state.settings);
      if (lastSettingsSnapshot !== null && fp !== lastSettingsSnapshot) {
        state.settings.updatedAt = Date.now();
      }
      lastSettingsSnapshot = fp;

      // Бампим newListsUpdatedAt только при реальном изменении списков «Новое»
      const nlFp = newListsFingerprint(state);
      if (lastNewListsSnapshot !== null && nlFp !== lastNewListsSnapshot) {
        state.newListsUpdatedAt = Date.now();
      }
      lastNewListsSnapshot = nlFp;

      const data = {
        posts: state.posts,
        user_data: state.user_data,
        lastVisit: state.lastVisit,
        collapsedGroups: state.collapsedGroups,
        blogDescriptionLinks: state.blogDescriptionLinks,
        playerTimestamps: state.playerTimestamps,
        newTitles: state.newTitles,
        newChapters: state.newChapters,
        newListsUpdatedAt: state.newListsUpdatedAt || 0,
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
              newListsUpdatedAt: state.newListsUpdatedAt || 0,
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
          newListsUpdatedAt: state.newListsUpdatedAt || 0,
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

// Нормализация одного канала из импортируемого progress.json в каноничную форму.
// Возвращает null, если структура невалидна (нет осмысленного user_data).
function normalizeImportedChannel(importedData) {
  if (!importedData || typeof importedData !== 'object') return null;
  if (!importedData.user_data || typeof importedData.user_data !== 'object') return null;
  return {
    posts: Array.isArray(importedData.posts) ? importedData.posts : [],
    user_data: importedData.user_data,
    lastVisit: Number(importedData.lastVisit) || 0,
    collapsedGroups: (importedData.collapsedGroups && typeof importedData.collapsedGroups === 'object') ? importedData.collapsedGroups : {},
    blogDescriptionLinks: Array.isArray(importedData.blogDescriptionLinks) ? importedData.blogDescriptionLinks : [],
    playerTimestamps: (importedData.playerTimestamps && typeof importedData.playerTimestamps === 'object') ? importedData.playerTimestamps : {},
    newTitles: Array.isArray(importedData.newTitles) ? importedData.newTitles : [],
    newChapters: Array.isArray(importedData.newChapters) ? importedData.newChapters : [],
    newListsUpdatedAt: Number(importedData.newListsUpdatedAt) || 0,
    settings: (importedData.settings && typeof importedData.settings === 'object') ? importedData.settings : {},
    version: importedData.version,
    exportDate: importedData.exportDate
  };
}

// Импорт прогресса из ZIP-файла.
// mode: 'merge' (по умолчанию) — слияние с текущими данными тем же движком, что и WebDAV
//       (последнее изменение побеждает, ничего не теряется);
//       'replace' — каналы из архива полностью перезаписывают текущие.
async function importBackupFile(file, mode = 'merge') {
  if (!file) return;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Разбираем архив в карту каналов { slug: normalizedChannel }
    const importedMap = {};
    for (const [relativePath, fileEntry] of Object.entries(zip.files)) {
      if (fileEntry.dir) continue;
      const pathParts = relativePath.split('/');
      if (pathParts.length !== 2 || pathParts[1] !== 'progress.json') continue;

      const slug = pathParts[0];
      let parsed = null;
      try {
        parsed = JSON.parse(await fileEntry.async('text'));
      } catch (e) {
        continue; // битый JSON конкретного канала — пропускаем
      }
      const channel = normalizeImportedChannel(parsed);
      if (channel) importedMap[slug] = channel;
    }

    const slugs = Object.keys(importedMap);
    if (slugs.length === 0) {
      throw new Error('В архиве не найдено корректных файлов progress.json');
    }

    // Текущая локальная карта каналов (для режима слияния)
    let localMap = {};
    if (mode === 'merge') {
      const storageResult = await new Promise((resolve) => {
        chrome.storage.local.get(null, (result) => resolve(result || {}));
      });
      localMap = buildLocalChannelsMapFromStorage(storageResult);
    }

    const storageUpdates = {};
    for (const slug of slugs) {
      const channelData = mode === 'merge'
        ? mergeChannelBackupData(localMap[slug], importedMap[slug])
        : importedMap[slug];
      // applyMergedChannelToState приводит к каноничной форме хранения и,
      // для текущего канала, накатывает в активный state + сбрасывает снимки.
      storageUpdates[`lf_state_${slug}`] = applyMergedChannelToState(slug, channelData);
    }

    await new Promise((resolve, reject) => {
      chrome.storage.local.set(storageUpdates, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    updateExtensionBadge();
    deps.showNotification(t(mode === 'merge' ? 'notify_import_merged' : 'notify_import_success', slugs.length));
    deps.render();
  } catch (err) {
    console.error('Ошибка при импорте бэкапа:', err);
    deps.showNotification(t('notify_import_invalid_format'));
  }
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
        blogDescriptionLinks: state.blogDescriptionLinks,
        newTitles: state.newTitles,
        newChapters: state.newChapters,
        newListsUpdatedAt: state.newListsUpdatedAt || 0
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
      blogDescriptionLinks: state.blogDescriptionLinks,
      newTitles: state.newTitles,
      newChapters: state.newChapters
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
    blogDescriptionLinks: channelData.blogDescriptionLinks || [],
    newTitles: channelData.newTitles || [],
    newChapters: channelData.newChapters || [],
    newListsUpdatedAt: channelData.newListsUpdatedAt || 0
  };

  if (slug === BLOG_SLUG) {
    state.posts = mergedChannel.posts;
    state.settings = { ...state.settings, ...mergedChannel.settings };
    state.user_data = mergedChannel.user_data;
    state.playerTimestamps = mergedChannel.playerTimestamps;
    state.lastVisit = mergedChannel.lastVisit;
    state.collapsedGroups = mergedChannel.collapsedGroups;
    state.blogDescriptionLinks = mergedChannel.blogDescriptionLinks;
    state.newTitles = mergedChannel.newTitles;
    state.newChapters = mergedChannel.newChapters;
    state.newListsUpdatedAt = mergedChannel.newListsUpdatedAt;
    // Настройки/новинки заменены слиянием — обновляем снимки, чтобы следующее
    // сохранение не приняло это за «локальное изменение» и не сбило таймстампы.
    lastSettingsSnapshot = settingsFingerprint(state.settings);
    lastNewListsSnapshot = newListsFingerprint(state);
  }

  return mergedChannel;
}

export {
  state,
  webdavConfig,
  setStateDeps,
  ensureUserData,
  setPostReadState,
  updateExtensionBadge,
  loadStateFromStorage,
  saveStateToStorage,
  debouncedWebDavUpload,
  exportUserData,
  importBackupFile,
  loadWebDavConfig,
  saveWebDavConfig,
  buildLocalChannelsMapFromStorage,
  applyMergedChannelToState
};
