/**
 * WebDAV-синхронизация для Boosty Bookmark.
 * Провайдер, слияние бэкапов и REST-клиент (Nextcloud, Owncloud, NAS и др.).
 * Формат файла в облаке — ZIP-архив, идентичный ручному экспорту ({slug}/progress.json).
 */
import { t } from './locales.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils.js';

  const BACKUP_VERSION = '2.0';
  const SYNC_FILE_NAME = 'boosty_bookmark_sync.zip';
  const SYNC_FOLDER = 'boosty-bookmark';

  const STATUS_PRIORITY = {
    none: 0,
    dropped: 1,
    watching: 2,
    favorite: 3,
    completed: 4
  };

  function basicAuthHeader(username, accessCode) {
    return 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + accessCode)));
  }

  function encodeWebDavPath(baseUrl, ...segments) {
    const base = baseUrl.replace(/\/+$/, '');
    const path = segments
      .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join('/');
    return path ? `${base}/${path}` : base;
  }

  // Время отметки «прочитано» для поста id в записи тайтла.
  // Явная метка readMarks[id] приоритетна; для legacy-данных (только readPosts,
  // без меток) считаем, что пост прочитан со времени updatedAt записи.
  function readTsForId(entry, id) {
    if (entry.readMarks && entry.readMarks[id] != null) return Number(entry.readMarks[id]) || 0;
    const inList = (entry.readPosts || []).some((p) => String(p) === id);
    // Legacy-прочтение (только readPosts, без меток) считаем прочитанным со времени
    // updatedAt; базовое значение 1 — чтобы оно «победило» при отсутствии tombstone,
    // но проиграло любому реальному снятию отметки (ts = Date.now()).
    return inList ? (Number(entry.updatedAt) || 1) : 0;
  }

  function unreadTsForId(entry, id) {
    if (entry.unreadMarks && entry.unreadMarks[id] != null) return Number(entry.unreadMarks[id]) || 0;
    return 0;
  }

  // Слияние состояния «прочитано» по тайтлу с tombstone-логикой (LWW per-post).
  // Каждый пост имеет время отметки прочитанным и время снятия (tombstone);
  // итог — то событие, что произошло позже. Это позволяет синхронизировать
  // СНЯТИЕ отметки между устройствами (чистый union этого не умел).
  function mergeReadState(l, r) {
    const left = l || {};
    const right = r || {};
    const ids = new Set([
      ...((left.readPosts || []).map(String)),
      ...((right.readPosts || []).map(String)),
      ...Object.keys(left.readMarks || {}),
      ...Object.keys(right.readMarks || {}),
      ...Object.keys(left.unreadMarks || {}),
      ...Object.keys(right.unreadMarks || {})
    ]);

    const readPosts = [];
    const readMarks = {};
    const unreadMarks = {};

    for (const id of ids) {
      const readTs = Math.max(readTsForId(left, id), readTsForId(right, id));
      const unreadTs = Math.max(unreadTsForId(left, id), unreadTsForId(right, id));

      // Явную метку прочтения храним, только если она была хотя бы с одной стороны
      // (legacy-прочтения остаются представлены массивом readPosts — без раздувания).
      const hasExplicitRead = (left.readMarks && left.readMarks[id] != null) ||
                              (right.readMarks && right.readMarks[id] != null);

      if (unreadTs > 0) unreadMarks[id] = unreadTs;

      if (readTs > unreadTs && readTs > 0) {
        readPosts.push(id);
        if (hasExplicitRead) readMarks[id] = readTs;
      }
    }

    return { readPosts, readMarks, unreadMarks };
  }

  function mergeUserData(local, remote) {
    const result = {};
    const allTitles = new Set([
      ...Object.keys(local || {}),
      ...Object.keys(remote || {})
    ]);

    for (const title of allTitles) {
      const l = local?.[title] || { status: 'none', notes: '', readPosts: [], updatedAt: 0 };
      const r = remote?.[title] || { status: 'none', notes: '', readPosts: [], updatedAt: 0 };

      const lTime = l.updatedAt || 0;
      const rTime = r.updatedAt || 0;

      const { readPosts, readMarks, unreadMarks } = mergeReadState(l, r);

      // Выбираем статус и заметки по таймстампу изменения
      const status = lTime >= rTime ? l.status : r.status;
      const notes = lTime >= rTime ? (l.notes || '') : (r.notes || '');
      const updatedAt = Math.max(lTime, rTime);

      const entry = { status, notes, readPosts, updatedAt };
      if (Object.keys(readMarks).length) entry.readMarks = readMarks;
      if (Object.keys(unreadMarks).length) entry.unreadMarks = unreadMarks;

      result[title] = entry;
    }

    return result;
  }

  function mergePlayerTimestamps(local, remote) {
    const result = { ...(local || {}) };
    for (const [key, val] of Object.entries(remote || {})) {
      const numVal = Number(val);
      if (!(key in result) || numVal > Number(result[key])) {
        result[key] = numVal;
      }
    }
    return result;
  }

  function mergeBlogDescriptionLinks(local, remote) {
    const map = new Map();
    for (const link of [...(local || []), ...(remote || [])]) {
      if (link && link.url) {
        map.set(link.url, link);
      }
    }
    return [...map.values()];
  }

  function mergePosts(localPosts, remotePosts) {
    const map = new Map();

    for (const post of [...(localPosts || []), ...(remotePosts || [])]) {
      if (!post?.id) continue;

      const existing = map.get(post.id);
      if (!existing) {
        map.set(post.id, { ...post });
        continue;
      }

      const publishTime = Math.max(existing.publishTime || 0, post.publishTime || 0);
      const base = (existing.publishTime || 0) >= (post.publishTime || 0) ? existing : post;
      const other = base === existing ? post : existing;

      map.set(post.id, {
        ...other,
        ...base,
        publishTime,
        isLiked: !!(existing.isLiked || post.isLiked)
      });
    }

    return [...map.values()].sort((a, b) => (a.publishTime || 0) - (b.publishTime || 0));
  }

  function mergeChannelBackupData(local, remote) {
    if (!local) {
      return {
        ...remote,
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString()
      };
    }
    if (!remote) {
      return {
        ...local,
        version: BACKUP_VERSION,
        exportDate: new Date().toISOString()
      };
    }

    // Настройки сливаем по собственному таймстампу settings.updatedAt (LWW),
    // а не по channel-level exportDate: exportDate генерируется заново при каждом
    // экспорте, поэтому он не отражает, на какой стороне настройки реально менялись.
    const localSettingsTs = Number(local.settings?.updatedAt || 0);
    const remoteSettingsTs = Number(remote.settings?.updatedAt || 0);
    const settings = remoteSettingsTs > localSettingsTs ? remote.settings : local.settings;

    // Списки «Новое» сливаем целиком по newListsUpdatedAt (LWW): это пропагандирует
    // и появление новинок, и их очистку. Per-item tombstone здесь избыточен —
    // новинки эфемерны и пересчитываются при каждой синхронизации постов.
    const localNewTs = Number(local.newListsUpdatedAt || 0);
    const remoteNewTs = Number(remote.newListsUpdatedAt || 0);
    const newSource = remoteNewTs > localNewTs ? remote : local;

    return {
      version: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      posts: mergePosts(local.posts, remote.posts),
      settings: settings || {},
      user_data: mergeUserData(local.user_data, remote.user_data),
      playerTimestamps: mergePlayerTimestamps(local.playerTimestamps, remote.playerTimestamps),
      lastVisit: Math.max(local.lastVisit || 0, remote.lastVisit || 0),
      collapsedGroups: { ...(local.collapsedGroups || {}), ...(remote.collapsedGroups || {}) },
      blogDescriptionLinks: mergeBlogDescriptionLinks(local.blogDescriptionLinks, remote.blogDescriptionLinks),
      newTitles: [...(newSource.newTitles || [])],
      newChapters: [...(newSource.newChapters || [])],
      newListsUpdatedAt: Math.max(localNewTs, remoteNewTs)
    };
  }

  /**
   * Слияние локального и удалённого набора каналов (ключ — slug).
   */
  function mergeChannelsMaps(localMap, remoteMap) {
    const local = localMap || {};
    const remote = remoteMap || {};
    const merged = {};
    const allSlugs = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const slug of allSlugs) {
      merged[slug] = mergeChannelBackupData(local[slug], remote[slug]);
    }

    return merged;
  }

  class WebDavProvider {
    constructor(config) {
      if (!config.baseUrl) {
        throw new Error(t('error_webdav_no_url'));
      }
      this.baseUrl = config.baseUrl.replace(/\/+$/, '');
      this.username = config.username || '';
      this.accessCode = config.accessCode || '';
      this.folder = config.folder || SYNC_FOLDER;
      this.authHeader = basicAuthHeader(this.username, this.accessCode);
    }

    get folderUrl() {
      return encodeWebDavPath(this.baseUrl, this.folder);
    }

    get fileUrl() {
      return encodeWebDavPath(this.baseUrl, this.folder, SYNC_FILE_NAME);
    }

    async checkConnection() {
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!isExtension) {
        const response = await fetch(this.baseUrl + '/', {
          method: 'PROPFIND',
          headers: {
            Authorization: this.authHeader,
            Depth: '0'
          }
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(t('error_webdav_auth'));
        }
        if (!response.ok && response.status !== 404) {
          throw new Error(t('error_webdav_propfind', response.status));
        }
        return true;
      }

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'WEBDAV_REQUEST',
          url: this.baseUrl + '/',
          method: 'PROPFIND',
          headers: {
            Authorization: this.authHeader,
            Depth: '0'
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response ? response.error : t('error_webdav_no_background_response')));
          }
          if (response.status === 401 || response.status === 403) {
            return reject(new Error(t('error_webdav_auth')));
          }
          if (!response.ok && response.status !== 404) {
            return reject(new Error(t('error_webdav_propfind', response.status)));
          }
          resolve(true);
        });
      });
    }

    async ensureFolder() {
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!isExtension) {
        const response = await fetch(this.folderUrl, {
          method: 'MKCOL',
          headers: { Authorization: this.authHeader }
        });
        if (response.ok || response.status === 405 || response.status === 301 || response.status === 302 || response.status === 409) {
          return true;
        }
        throw new Error(t('error_webdav_mkcol', response.status));
      }

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'WEBDAV_REQUEST',
          url: this.folderUrl,
          method: 'MKCOL',
          headers: { Authorization: this.authHeader }
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response ? response.error : t('error_webdav_no_background_response')));
          }
          if (response.ok || response.status === 405 || response.status === 301 || response.status === 302 || response.status === 409) {
            return resolve(true);
          }
          reject(new Error(t('error_webdav_mkcol', response.status)));
        });
      });
    }

    // Возвращает { buffer, etag }. buffer === null, если файла ещё нет (404).
    // etag нужен для условной записи (If-Match) — защита от перезаписи чужих правок.
    async download() {
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!isExtension) {
        const response = await fetch(this.fileUrl, {
          method: 'GET',
          headers: { Authorization: this.authHeader }
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(t('error_webdav_auth'));
        }
        if (response.status === 404) {
          return { buffer: null, etag: null };
        }
        if (!response.ok) {
          throw new Error(t('error_webdav_download', response.status));
        }
        return { buffer: await response.arrayBuffer(), etag: response.headers.get('etag') || null };
      }

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'WEBDAV_REQUEST',
          url: this.fileUrl,
          method: 'GET',
          headers: { Authorization: this.authHeader }
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response ? response.error : t('error_webdav_no_background_response')));
          }
          if (response.status === 401 || response.status === 403) {
            return reject(new Error(t('error_webdav_auth')));
          }
          if (response.status === 404) {
            return resolve({ buffer: null, etag: null });
          }
          if (!response.ok) {
            return reject(new Error(t('error_webdav_download', response.status)));
          }
          const buffer = response.bodyBase64 ? base64ToArrayBuffer(response.bodyBase64) : new ArrayBuffer(0);
          resolve({ buffer, etag: response.etag || null });
        });
      });
    }

    // options.etag — если задан, запись условная (If-Match): сервер отклонит её (412),
    // если файл в облаке изменился с момента нашего download. На 412 бросаем ошибку
    // с флагом preconditionFailed, чтобы вызывающий перечитал и слил заново.
    // Если etag нет (сервер его не отдаёт / файла не было) — пишем безусловно (как раньше),
    // чтобы не сломать серверы без поддержки ETag.
    async upload(arrayBuffer, options = {}) {
      const etag = options.etag || null;
      const headers = {
        Authorization: this.authHeader,
        'Content-Type': 'application/zip'
      };
      if (etag) headers['If-Match'] = etag;

      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!isExtension) {
        await this.ensureFolder();
        const response = await fetch(this.fileUrl, {
          method: 'PUT',
          headers,
          body: arrayBuffer
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(t('error_webdav_auth'));
        }
        if (response.status === 412) {
          const err = new Error(t('error_webdav_conflict'));
          err.preconditionFailed = true;
          throw err;
        }
        if (!response.ok) {
          throw new Error(t('error_webdav_upload', response.status));
        }
        return true;
      }

      await this.ensureFolder();
      const bodyBase64 = arrayBufferToBase64(arrayBuffer);

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'WEBDAV_REQUEST',
          url: this.fileUrl,
          method: 'PUT',
          headers,
          bodyBase64: bodyBase64
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response ? response.error : t('error_webdav_no_background_response')));
          }
          if (response.status === 401 || response.status === 403) {
            return reject(new Error(t('error_webdav_auth')));
          }
          if (response.status === 412) {
            const err = new Error(t('error_webdav_conflict'));
            err.preconditionFailed = true;
            return reject(err);
          }
          if (!response.ok) {
            return reject(new Error(t('error_webdav_upload', response.status)));
          }
          resolve(true);
        });
      });
    }
  }

  export {
    BACKUP_VERSION,
    SYNC_FILE_NAME,
    SYNC_FOLDER,
    WebDavProvider,
    basicAuthHeader,
    mergeUserData,
    mergeReadState,
    mergePlayerTimestamps,
    mergePosts,
    mergeChannelBackupData,
    mergeChannelsMaps
  };
