/**
 * WebDAV-синхронизация для Boosty Bookmark.
 * Провайдер, слияние бэкапов и REST-клиент (Nextcloud, Owncloud, NAS и др.).
 * Формат файла в облаке — ZIP-архив, идентичный ручному экспорту ({slug}/progress.json).
 */
(function (global) {
  'use strict';

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

  function parseExportDate(entry) {
    if (entry?.exportDate) {
      const ts = Date.parse(entry.exportDate);
      if (!Number.isNaN(ts)) return ts;
    }
    return entry?.updatedAt || 0;
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

      const readPosts = [...new Set([...(l.readPosts || []), ...(r.readPosts || [])])];
      
      // Выбираем статус и заметки по таймстампу изменения
      const status = lTime >= rTime ? l.status : r.status;
      const notes = lTime >= rTime ? (l.notes || '') : (r.notes || '');
      const updatedAt = Math.max(lTime, rTime);

      result[title] = { status, notes, readPosts, updatedAt };
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

    const localTs = parseExportDate(local);
    const remoteTs = parseExportDate(remote);
    const settings = remoteTs > localTs ? remote.settings : local.settings;

    return {
      version: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      posts: mergePosts(local.posts, remote.posts),
      settings: settings || {},
      user_data: mergeUserData(local.user_data, remote.user_data),
      playerTimestamps: mergePlayerTimestamps(local.playerTimestamps, remote.playerTimestamps),
      lastVisit: Math.max(local.lastVisit || 0, remote.lastVisit || 0),
      collapsedGroups: { ...(local.collapsedGroups || {}), ...(remote.collapsedGroups || {}) },
      blogDescriptionLinks: mergeBlogDescriptionLinks(local.blogDescriptionLinks, remote.blogDescriptionLinks)
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
          return null;
        }
        if (!response.ok) {
          throw new Error(t('error_webdav_download', response.status));
        }
        return response.arrayBuffer();
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
            return resolve(null);
          }
          if (!response.ok) {
            return reject(new Error(t('error_webdav_download', response.status)));
          }
          const buffer = new Uint8Array(response.bodyArray).buffer;
          resolve(buffer);
        });
      });
    }

    async upload(arrayBuffer) {
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!isExtension) {
        await this.ensureFolder();
        const response = await fetch(this.fileUrl, {
          method: 'PUT',
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/zip'
          },
          body: arrayBuffer
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(t('error_webdav_auth'));
        }
        if (!response.ok) {
          throw new Error(t('error_webdav_upload', response.status));
        }
        return true;
      }

      await this.ensureFolder();
      const bodyArray = Array.from(new Uint8Array(arrayBuffer));

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'WEBDAV_REQUEST',
          url: this.fileUrl,
          method: 'PUT',
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/zip'
          },
          bodyArray: bodyArray
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
          if (!response.ok) {
            return reject(new Error(t('error_webdav_upload', response.status)));
          }
          resolve(true);
        });
      });
    }
  }

  const api = {
    BACKUP_VERSION,
    SYNC_FILE_NAME,
    SYNC_FOLDER,
    WebDavProvider,
    basicAuthHeader,
    mergeUserData,
    mergePlayerTimestamps,
    mergePosts,
    mergeChannelBackupData,
    mergeChannelsMaps
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BoostyBookmarkSync = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
