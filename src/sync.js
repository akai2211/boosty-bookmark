/* sync.js — Синхронизация с API Boosty, перехват лайков и облачная синхронизация (WebDAV). */

import { t } from './locales.js';
import { BLOG_SLUG, WEBDAV_AUTO_SYNC_MIN_INTERVAL_MS, isExtensionContextValid, arePostsEqual } from './utils.js';
import {
  state,
  webdavConfig,
  saveStateToStorage,
  saveWebDavConfig,
  buildLocalChannelsMapFromStorage,
  applyMergedChannelToState
} from './state.js';
import * as BoostyBookmarkSync from './webdav-sync.js';
import { getGroupedTitles, getGroupedTitlesInternal } from './grouping.js';

// Внешние зависимости (UI-рендер, уведомления, dev-настройки, общий объект
// обработчиков событий), внедряются из content.js через setSyncDeps().
// Разрывает цикл sync ↔ sidebar: render/showNotification живут в ui/sidebar.js.
let render = () => {};
let renderListContent = () => {};
let renderSettingsContent = () => {};
let showNotification = () => {};
let devSettings = { enabled: false, cutoffDate: '', alwaysShowReactions: true, showAllNewChapters: false };
let eventHandlers = {};

function setSyncDeps(d) {
  if (d.render) render = d.render;
  if (d.renderListContent) renderListContent = d.renderListContent;
  if (d.renderSettingsContent) renderSettingsContent = d.renderSettingsContent;
  if (d.showNotification) showNotification = d.showNotification;
  if (d.devSettings) devSettings = d.devSettings;
  if (d.eventHandlers) eventHandlers = d.eventHandlers;
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
            headerLabel.textContent = t('detail_chapters_count_label', updatedManga.readCount, updatedManga.posts.length);
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

  // ==========================================================================
  // Направление 2: двусторонняя проверка рассинхрона при действии пользователя.
  // Срабатывает только при реальном лайке/дизлайке (пользователь нажал на лайк).
  // Покрывает случай: расширение было выключено в момент лайка — кэш устарел.
  // ==========================================================================
  const postIdStr = String(postId);
  const syncCheckbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postIdStr}"]`);
  if (!syncCheckbox) return; // Чекбокс не в DOM — нечего синхронизировать

  if (!isLiked) {
    // Пользователь снял лайк → убираем класс lf-liked-checkbox
    if (syncCheckbox.classList.contains('lf-liked-checkbox')) {
      syncCheckbox.classList.remove('lf-liked-checkbox');
    }
    // Если чекбокс checked, но пост НЕ в readPosts — он был checked только через isLiked.
    // Снимаем чекбокс (лайк снят → не просмотрено).
    if (syncCheckbox.checked) {
      const allGrouped = getGroupedTitles();
      const parentTitle = allGrouped.find(manga => manga.posts.some(p => String(p.id) === postIdStr));
      if (parentTitle) {
        const userData = state.user_data[parentTitle.name];
        const readPosts = (userData && userData.readPosts) || [];
        if (!readPosts.includes(postIdStr)) {
          syncCheckbox.checked = false;
          console.log(`[BoostyBookmark] Рассинхрон (Направление 2, дизлайк): чекбокс снят для поста ${postId} (не был в readPosts)`);
          const updatedManga = getGroupedTitles().find(t => t.name === parentTitle.name);
          if (updatedManga) {
            const headerLabel = document.querySelector('.lf-chapters-header .lf-field-label');
            if (headerLabel) {
              headerLabel.textContent = t('detail_chapters_count_label', updatedManga.readCount, updatedManga.posts.length);
            }
          }
        }
      }
    }
  } else {
    // Пользователь поставил лайк → чекбокс должен быть checked
    if (!syncCheckbox.checked) {
      console.log(`[BoostyBookmark] Рассинхрон (Направление 2, лайк): ставим чекбокс для поста ${postId}`);
      syncCheckbox.checked = true;
      syncCheckbox.classList.add('lf-liked-checkbox');
      const activeTitleName = state.ui.activeTitle;
      if (activeTitleName) {
        const updatedManga = getGroupedTitles().find(t => t.name === activeTitleName);
        if (updatedManga) {
          const headerLabel = document.querySelector('.lf-chapters-header .lf-field-label');
          if (headerLabel) {
            headerLabel.textContent = t('detail_chapters_count_label', updatedManga.readCount, updatedManga.posts.length);
          }
        }
      }
    }
  }
}

// -------------------------------------------------------------
// ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (WebDAV)
// -------------------------------------------------------------

function getWebDavSyncApi() {
  if (typeof BoostyBookmarkSync !== 'undefined') {
    return BoostyBookmarkSync;
  }
  if (typeof require !== 'undefined') {
    return require('./webdav-sync.js');
  }
  return null;
}

async function parseBackupZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const channelsMap = {};

  for (const [relativePath, fileEntry] of Object.entries(zip.files)) {
    if (fileEntry.dir) continue;

    const pathParts = relativePath.split('/');
    if (pathParts.length !== 2 || pathParts[1] !== 'progress.json') continue;

    const slug = pathParts[0];
    const importedData = JSON.parse(await fileEntry.async('text'));

    if (importedData && typeof importedData === 'object' && importedData.user_data) {
      channelsMap[slug] = {
        posts: importedData.posts || [],
        user_data: importedData.user_data,
        lastVisit: importedData.lastVisit || 0,
        collapsedGroups: importedData.collapsedGroups || {},
        blogDescriptionLinks: importedData.blogDescriptionLinks || [],
        playerTimestamps: importedData.playerTimestamps || {},
        newTitles: importedData.newTitles || [],
        newChapters: importedData.newChapters || [],
        newListsUpdatedAt: importedData.newListsUpdatedAt || 0,
        settings: importedData.settings || {},
        version: importedData.version,
        exportDate: importedData.exportDate
      };
    }
  }

  if (Object.keys(channelsMap).length === 0) {
    throw new Error('В архиве не найдено корректных файлов progress.json');
  }

  return channelsMap;
}

async function buildBackupZipBuffer(channelsMap) {
  const zip = new JSZip();

  for (const [slug, channelData] of Object.entries(channelsMap)) {
    const dataToExport = {
      version: '2.0',
      exportDate: channelData.exportDate || new Date().toISOString(),
      posts: channelData.posts || [],
      user_data: channelData.user_data || {},
      lastVisit: channelData.lastVisit || 0,
      collapsedGroups: channelData.collapsedGroups || {},
      blogDescriptionLinks: channelData.blogDescriptionLinks || [],
      playerTimestamps: channelData.playerTimestamps || {},
      newTitles: channelData.newTitles || [],
      newChapters: channelData.newChapters || [],
      newListsUpdatedAt: channelData.newListsUpdatedAt || 0,
      settings: channelData.settings || {}
    };

    zip.file(`${slug}/progress.json`, JSON.stringify(dataToExport, null, 2));
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

async function applyMergedChannelsToStorage(channelsMap) {
  const storageUpdates = {};

  for (const [slug, channelData] of Object.entries(channelsMap)) {
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
}

async function collectLocalChannelsMap() {
  const storageResult = await new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => {
      resolve(result || {});
    });
  });

  return buildLocalChannelsMapFromStorage(storageResult);
}

function normalizeWebDavBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error(t('error_webdav_no_url'));
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(t('error_webdav_invalid_protocol'));
  }
  return parsed.href.replace(/\/+$/, '');
}

function createWebDavProvider() {
  const syncApi = getWebDavSyncApi();
  if (!syncApi) {
    throw new Error(t('error_webdav_module_not_loaded'));
  }
  const isYandex = webdavConfig.provider === 'yandex';
  const baseUrl = isYandex ? 'https://webdav.yandex.ru' : webdavConfig.baseUrl;

  if (!baseUrl?.trim()) {
    throw new Error(t('error_webdav_no_url'));
  }
  if (!webdavConfig.username?.trim()) {
    throw new Error(t('error_webdav_no_username'));
  }
  if (!webdavConfig.accessCode) {
    throw new Error(t('error_webdav_no_access_code'));
  }
  const cleanedUsername = isYandex
    ? webdavConfig.username.trim().replace(/@(yandex\.(ru|by|kz|ua|com)|ya\.ru)$/i, '')
    : webdavConfig.username.trim();

  return new syncApi.WebDavProvider({
    baseUrl: normalizeWebDavBaseUrl(baseUrl),
    username: cleanedUsername,
    accessCode: webdavConfig.accessCode
  });
}

function getWebDavOrigin() {
  const isYandex = webdavConfig.provider === 'yandex';
  const baseUrl = isYandex ? 'https://webdav.yandex.ru' : webdavConfig.baseUrl;
  if (!baseUrl || !baseUrl.trim()) return null;
  try {
    const normalized = normalizeWebDavBaseUrl(baseUrl);
    const url = new URL(normalized);
    return `${url.protocol}//${url.host}/*`;
  } catch (e) {
    console.warn('[BoostyBookmark] Ошибка при разборе URL для прав:', e);
    return null;
  }
}

function requestWebDavPermission(origin) {
  return new Promise((resolve) => {
    if (!origin) { resolve(true); return; }
    if (typeof chrome === 'undefined' || !chrome.permissions) { resolve(true); return; }
    chrome.permissions.contains({ origins: [origin] }, (hasPermission) => {
      if (hasPermission) {
        resolve(true);
      } else {
        chrome.permissions.request({ origins: [origin] }, (granted) => {
          resolve(!!granted);
        });
      }
    });
  });
}

async function prepareWebDavConnection() {
  await saveWebDavSettingsFromForm();
  return createWebDavProvider();
}

function isWebDavConfigured() {
  const isYandex = webdavConfig.provider === 'yandex';
  const hasUrl = isYandex || !!webdavConfig.baseUrl?.trim();
  return !!(
    webdavConfig.enabled &&
    hasUrl &&
    webdavConfig.username?.trim() &&
    webdavConfig.accessCode
  );
}

function isWebDavFieldsFilled() {
  const isYandex = webdavConfig.provider === 'yandex';
  const hasUrl = isYandex || !!webdavConfig.baseUrl?.trim();
  return !!(
    hasUrl &&
    webdavConfig.username?.trim() &&
    webdavConfig.accessCode
  );
}

function triggerAutoWebDavSync() {
  if (!isWebDavConfigured()) return;
  if (state.ui.webdavSyncing || state.ui.webdavTesting) return;

  const now = Date.now();
  if (webdavConfig.lastSyncAt && (now - webdavConfig.lastSyncAt) < WEBDAV_AUTO_SYNC_MIN_INTERVAL_MS) {
    return;
  }

  performWebDavSync({ silent: true });
}

async function performWebDavSync(options = {}) {
  const silent = options.silent === true;

  if (state.ui.webdavSyncing || state.ui.webdavTesting) return;

  if (silent && !isWebDavConfigured()) return;

  if (!silent && !isWebDavFieldsFilled()) {
    showNotification(t('notify_webdav_fill_fields'));
    return;
  }

  // Проверяем / запрашиваем права для WebDAV origin
  const origin = getWebDavOrigin();
  if (origin) {
    if (silent) {
      // При автосинке (без User Gesture) просто проверяем наличие прав
      const hasPerm = await new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.permissions) { resolve(true); return; }
        chrome.permissions.contains({ origins: [origin] }, resolve);
      });
      if (!hasPerm) {
        console.warn('[BoostyBookmark] Автосинк отменен: нет разрешения для хоста', origin);
        return;
      }
    } else {
      // При ручной синхронизации (клик) запрашиваем права
      const granted = await requestWebDavPermission(origin);
      if (!granted) {
        webdavConfig.lastSyncStatus = t('error_webdav_no_permission');
        await saveWebDavConfig();
        showNotification(t('error_webdav_no_permission'));
        if (state.ui.activeTab === 'settings') {
          renderSettingsContent();
        }
        return;
      }
    }
  }

  state.ui.webdavSyncing = true;
  if (state.ui.activeTab === 'settings') {
    renderSettingsContent();
  }

  try {
    const syncApi = getWebDavSyncApi();
    const provider = await prepareWebDavConnection();

    const localChannels = await collectLocalChannelsMap();

    // Цикл download → merge → условный upload (If-Match по ETag). Если облако успели
    // изменить между нашим чтением и записью (412), перечитываем и сливаем заново —
    // защита от потери чужих правок при одновременной синхронизации с двух устройств.
    const MAX_CONFLICT_RETRIES = 3;
    let mergedChannels = null;
    for (let attempt = 1; ; attempt++) {
      const { buffer: remoteBuffer, etag } = await provider.download();

      let remoteChannels = {};
      if (remoteBuffer) {
        remoteChannels = await parseBackupZip(remoteBuffer);
      }

      mergedChannels = syncApi.mergeChannelsMaps(localChannels, remoteChannels);
      const zipBuffer = await buildBackupZipBuffer(mergedChannels);

      try {
        await provider.upload(zipBuffer, { etag });
        break;
      } catch (e) {
        if (e && e.preconditionFailed && attempt < MAX_CONFLICT_RETRIES) {
          continue; // облако изменилось — повторяем слияние с новым содержимым
        }
        throw e;
      }
    }

    // В локальное хранилище и state записываем только после успешной выгрузки
    await applyMergedChannelsToStorage(mergedChannels);

    webdavConfig.lastSyncAt = Date.now();
    webdavConfig.lastSyncStatus = silent ? t('status_webdav_auto_sync_success') : t('status_webdav_sync_success');

    if (!silent && !webdavConfig.enabled) {
      webdavConfig.enabled = true;
    }
    await saveWebDavConfig();

    if (!silent) {
      showNotification(t('notify_webdav_sync_success'));
    }
  } catch (err) {
    console.error('WebDAV sync error:', err);
    webdavConfig.lastSyncStatus = err.message || t('status_webdav_sync_error');
    await saveWebDavConfig();
    if (!silent) {
      showNotification(webdavConfig.lastSyncStatus);
    }
  } finally {
    state.ui.webdavSyncing = false;
    if (state.ui.activeTab === 'settings') {
      renderSettingsContent();
    } else {
      render();
    }
  }
}

async function saveWebDavSettingsFromForm() {
  const baseUrlInput = document.getElementById('lf-webdav-base-url');
  const usernameInput = document.getElementById('lf-webdav-username');
  const accessCodeInput = document.getElementById('lf-webdav-access-code');
  const enabledInput = document.getElementById('lf-webdav-enabled');

  if (baseUrlInput) webdavConfig.baseUrl = baseUrlInput.value.trim();
  if (usernameInput) webdavConfig.username = usernameInput.value.trim();
  if (accessCodeInput) {
    const val = accessCodeInput.value;
    if (val === '') {
      webdavConfig.accessCode = '';
    } else if (val !== '••••••••') {
      webdavConfig.accessCode = val;
    }
  }
  if (enabledInput) webdavConfig.enabled = enabledInput.checked;

  await saveWebDavConfig();
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Преобразование поста из API Boosty в компактный формат для хранения
function toCompactPost(p) {
  return {
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
}

// Запрос одной страницы постов с ретраями и экспоненциальным backoff.
// Лечит обрывы из-за rate-limit Boosty: при серии быстрых запросов API
// отвечает 429/5xx (часто без CORS-заголовков → fetch реджектится), что
// раньше роняло весь цикл синхронизации. Здесь такие ответы пережидаются.
async function fetchPostsPage(offset, limit, maxAttempts = 4) {
  const url = `https://api.boosty.to/v1/blog/${BLOG_SLUG}/post/?limit=${limit}` + (offset ? `&offset=${offset}` : '');
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers = {};
      const token = getBoostyAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, { headers, credentials: 'include' });

      if (response.ok) {
        return await response.json();
      }

      // 4xx (кроме 429) — повтор не поможет (нет прав / неверный запрос), выходим сразу
      if (response.status !== 429 && response.status < 500) {
        const err = new Error(`HTTP error! status: ${response.status}`);
        err.nonRetryable = true;
        throw err;
      }

      // 429 / 5xx — перегрузка или rate-limit: подождать и повторить
      lastErr = new Error(`HTTP error! status: ${response.status}`);
      if (attempt < maxAttempts) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt - 1); // 1с, 2с, 4с…
        await sleep(waitMs);
      }
    } catch (e) {
      if (e && e.nonRetryable) throw e;
      // Сетевой сбой / CORS на ошибочном ответе (fetch реджектится) — повторяем
      lastErr = e;
      if (attempt < maxAttempts) await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr || new Error('fetchPostsPage: превышено число попыток');
}

// Чекпоинт незавершённой полной синхронизации (для докачки после обрыва).
// Хранится отдельным ключом, НЕ внутри lf_state_* — поэтому не попадает в
// ручной бэкап и WebDAV (они фильтруют ключи по префиксу lf_state_).
const FULL_SYNC_RESUME_KEY = `lf_full_sync_resume_${BLOG_SLUG}`;

function loadFullSyncResume() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) { resolve(null); return; }
    try {
      chrome.storage.local.get([FULL_SYNC_RESUME_KEY], (res) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const cp = res[FULL_SYNC_RESUME_KEY];
        resolve(cp && Array.isArray(cp.posts) ? cp : null);
      });
    } catch (e) { resolve(null); }
  });
}

function saveFullSyncResume(offset, posts) {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) { resolve(); return; }
    try {
      chrome.storage.local.set({ [FULL_SYNC_RESUME_KEY]: { offset, posts, ts: Date.now() } }, () => {
        void chrome.runtime.lastError; // игнорируем ошибку записи чекпоинта
        resolve();
      });
    } catch (e) { resolve(); }
  });
}

function clearFullSyncResume() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) { resolve(); return; }
    try {
      chrome.storage.local.remove(FULL_SYNC_RESUME_KEY, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (e) { resolve(); }
  });
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

      // Запрос страницы с ретраями/backoff — переживает rate-limit Boosty
      const result = await fetchPostsPage(offset, limit);
      const pagePosts = result.data || [];

      if (!pagePosts.length) {
        break;
      }

      for (const p of pagePosts) {
        if (DEV) {
          if (devSettings.enabled && devSettings.cutoffDate) {
            const cutoffTime = new Date(devSettings.cutoffDate).getTime() / 1000;
            if (p.publishTime > cutoffTime) {
              continue;
            }
          }
        }
        const fresh = toCompactPost(p);

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

    const oldPosts = [...state.posts];
    state.posts = updatedPosts;
    state.ui.syncProgress = 100;

    analyzeNewContent(oldPosts, state.posts);

    const hasNewContent = state.newTitles.length > 0 || state.newChapters.length > 0;
    if (hasNewContent) {
      state.ui.activeTab = 'new';
      try {
        sessionStorage.setItem('lf_active_tab', 'new');
      } catch(e) {}
    }

    await saveStateToStorage();

    // Сбрасываем свернутые группы, чтобы отразить новые/обновленные посты
    state.collapsedGroups = {};

    showNotification(t('notify_sync_success'));

  } catch (e) {
    console.error('Ошибка инкрементальной синхронизации Boosty:', e);
    showNotification(t('notify_sync_error'));
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

  const limit = 100;

  // Докачка: если прошлая полная синхронизация оборвалась (rate-limit и т.п.),
  // продолжаем с сохранённого места, а не скачиваем все посты заново.
  const resume = await loadFullSyncResume();
  let allPosts = resume ? resume.posts : [];
  let offset = resume ? (resume.offset || '') : '';
  let page = 0;

  try {
    await syncBlogDescription();
    while (true) {
      page++;
      // Обновляем прогресс для пользователя
      state.ui.syncProgress = Math.min(95, page * 7);
      render();

      // Запрос страницы с ретраями/backoff — переживает rate-limit Boosty
      const result = await fetchPostsPage(offset, limit);
      const pagePosts = result.data || [];

      let filteredPagePosts = pagePosts;
      if (DEV) {
        if (devSettings.enabled && devSettings.cutoffDate) {
          const cutoffTime = new Date(devSettings.cutoffDate).getTime() / 1000;
          filteredPagePosts = pagePosts.filter(p => p.publishTime <= cutoffTime);
        }
      }

      allPosts.push(...filteredPagePosts.map(toCompactPost));

      const extra = result.extra || {};
      if (extra.isLast || !pagePosts.length) {
        break;
      }
      offset = extra.offset || '';

      // Сохраняем чекпоинт после каждой страницы — при обрыве докачаем с этого места
      await saveFullSyncResume(offset, allPosts);

      // Небольшая задержка, чтобы не спамить сервер
      await sleep(250);
    }

    // Дедуп по id (на случай докачки с перекрытием) и сортировка «новые сверху»
    const dedup = new Map();
    for (const p of allPosts) dedup.set(String(p.id), p);
    const finalPosts = Array.from(dedup.values());
    finalPosts.sort((a, b) => b.publishTime - a.publishTime);

    const oldPosts = [...state.posts];
    state.posts = finalPosts;
    state.collapsedGroups = {};
    state.ui.syncProgress = 100;

    analyzeNewContent(oldPosts, state.posts);

    const hasNewContent = state.newTitles.length > 0 || state.newChapters.length > 0;
    if (hasNewContent) {
      state.ui.activeTab = 'new';
      try {
        sessionStorage.setItem('lf_active_tab', 'new');
      } catch(e) {}
    }

    await saveStateToStorage();
    await clearFullSyncResume(); // успешно докачали — чекпоинт больше не нужен

    // Оповещение об успешной синхронизации
    showNotification(t('notify_sync_success'));

  } catch (e) {
    // Чекпоинт уже сохранён по последней успешной странице — следующий запуск
    // («Попробуйте ещё раз») продолжит докачку, а не начнёт с нуля.
    console.error('Ошибка синхронизации Boosty (прогресс сохранён для докачки):', e);
    showNotification(t('notify_sync_posts_error'));
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

    let filteredPagePosts = pagePosts;
    if (DEV) {
      if (devSettings.enabled && devSettings.cutoffDate) {
        const cutoffTime = new Date(devSettings.cutoffDate).getTime() / 1000;
        filteredPagePosts = pagePosts.filter(p => p.publishTime <= cutoffTime);
      }
    }

    const oldPosts = [...state.posts];
    let hasUpdates = false;
    const postMap = new Map(state.posts.map(p => [p.id, p]));

    for (const p of filteredPagePosts) {
      const existing = postMap.get(p.id);

      // Обрабатываем свежие данные поста
      const fresh = toCompactPost(p);

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

      analyzeNewContent(oldPosts, state.posts);

      const hasNewContent = state.newTitles.length > 0 || state.newChapters.length > 0;
      if (hasNewContent) {
        state.ui.activeTab = 'new';
        try {
          sessionStorage.setItem('lf_active_tab', 'new');
        } catch(e) {}
      }

      await saveStateToStorage();
      render();
    }
  } catch (e) {
    console.warn('Фоновое обновление не удалось:', e);
  }
}

// Анализ новых постов и добавление тайтлов в списки Новые тайтлы / Новые главы
function analyzeNewContent(oldPosts, freshPosts) {
  // Ключ новизны — стабильный tagId тайтла (для «Объявлений» с пустым id — имя).
  // Так запись переживает переименование тайтла («красивые имена»), см. grouping.js.
  const keyOf = (manga) => manga.tagId || manga.name;

  // Дев-эмуляция: «Новые» пересчитываются целиком от границы lastVisit по текущей базе.
  // Так результат не зависит ни от порядка действий, ни от того, что было в базе раньше,
  // а переключатель showAllNewChapters применяется сразу при следующем сохранении.
  if (DEV && devSettings.enabled && devSettings.cutoffDate) {
    if (!state.lastVisit) {
      state.lastVisit = new Date(devSettings.cutoffDate).getTime();
    }
    state.newTitles = [];
    state.newChapters = [];
    getGroupedTitlesInternal(freshPosts).forEach(manga => {
      if (manga.posts.length === 0) return;
      const firstPostMs = manga.posts[0].publishTime * 1000;                      // самый ранний пост тайтла
      const lastPostMs = manga.posts[manga.posts.length - 1].publishTime * 1000;  // самый поздний пост тайтла
      if (firstPostMs > state.lastVisit) {
        // Тайтл дебютировал после границы — это новый тайтл.
        state.newTitles.push(keyOf(manga));
      } else {
        const userData = state.user_data[manga.name] || { status: 'none' };
        const isTracking = userData.status === 'watching' || userData.status === 'favorite';
        // По умолчанию «Новые главы» только для отслеживаемых; showAllNewChapters снимает ограничение.
        const includeChapters = devSettings.showAllNewChapters ? true : isTracking;
        if (includeChapters && lastPostMs > state.lastVisit && manga.readCount < manga.posts.length) {
          state.newChapters.push(keyOf(manga));
        }
      }
    });
    saveStateToStorage();
    return;
  }

  // Первая синхронизация (база пуста): новинок ещё нет, только фиксируем границу визита.
  if (!oldPosts || oldPosts.length === 0) {
    state.lastVisit = Date.now();
    saveStateToStorage();
    return;
  }

  // Обычный режим (в т.ч. после выключения эмуляции): новизна — по разнице составов
  // oldPosts → freshPosts. Списки «Новых» накапливаются, очищаются кнопкой «Очистить всё».

  const oldPostIds = new Set(oldPosts.map(p => p.id));
  const oldGrouped = getGroupedTitlesInternal(oldPosts);
  const oldTitleNames = new Set(oldGrouped.map(t => t.name));

  const newGrouped = getGroupedTitlesInternal(freshPosts);
  let updated = false;
  newGrouped.forEach(manga => {
    const hasNewPosts = manga.posts.some(post => !oldPostIds.has(post.id));
    if (hasNewPosts) {
      const key = keyOf(manga);
      if (!oldTitleNames.has(manga.name)) {
        if (!state.newTitles.includes(key) && !state.newTitles.includes(manga.name)) {
          state.newTitles.push(key);
          updated = true;
        }
      } else {
        const userData = state.user_data[manga.name] || { status: 'none' };
        const isTracking = userData.status === 'watching' || userData.status === 'favorite';
        // По умолчанию «Новые главы» только для отслеживаемых тайтлов. Дев-переключатель
        // showAllNewChapters снимает это ограничение (для проверки эмуляции).
        const includeChapters = (DEV && devSettings.showAllNewChapters) ? true : isTracking;
        if (includeChapters && manga.readCount < manga.posts.length) {
          if (!state.newChapters.includes(key) && !state.newChapters.includes(manga.name)) {
            state.newChapters.push(key);
            updated = true;
          }
        }
      }
    }
  });
  if (updated) {
    saveStateToStorage();
  }
}


// -------------------------------------------------------------
// РЕАКЦИИ BOOSTY (лайки)
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

export {
  setSyncDeps,
  patchFetch,
  handleInterceptedReaction,
  getWebDavSyncApi,
  parseBackupZip,
  buildBackupZipBuffer,
  applyMergedChannelsToStorage,
  collectLocalChannelsMap,
  normalizeWebDavBaseUrl,
  createWebDavProvider,
  getWebDavOrigin,
  requestWebDavPermission,
  prepareWebDavConnection,
  isWebDavConfigured,
  isWebDavFieldsFilled,
  triggerAutoWebDavSync,
  performWebDavSync,
  saveWebDavSettingsFromForm,
  syncDomLike,
  getBoostyAuthToken,
  syncBlogDescription,
  performIncrementalSync,
  performFullSync,
  backgroundSync,
  analyzeNewContent,
  sendBoostyReaction,
  removeBoostyReaction
};
