import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


// 1. Настройка моков для глобальных объектов Chrome
global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn((data, cb) => cb && cb()),
    }
  },
  runtime: {
    id: 'test-extension-id',
    lastError: null,
    getManifest: vi.fn(() => {
      try {
        const manifest = require('../manifest.json');
        return { version: manifest.version };
      } catch (e) {
        return { version: '0.9.0' };
      }
    })
  }
};

// Мок sessionStorage
const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
global.sessionStorage = sessionStorageMock;

// Импортируем локализацию и тестируемый модуль
require('../locales.js');
const content = require('../content.js');

describe('Юнит-тесты расширения Boosty Bookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Сбрасываем состояние
    content.state.posts = [];
    content.state.user_data = {};
  });

  describe('formatDate', () => {
    it('должен корректно форматировать timestamp в дату на русском языке', () => {
      const timestamp = 1779921600; // 2026-05-15 09:20:00 UTC
      const formatted = content.formatDate(timestamp);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('май');
    });
  });

  describe('arePostsEqual', () => {
    it('должен возвращать true, если посты идентичны по ключевым полям', () => {
      const p1 = { id: '1', title: 'Глава 1', publishTime: 123, tags: ['тег1'], subscriptionLevel: 'free', isLiked: true };
      const p2 = { id: '1', title: 'Глава 1', publishTime: 123, tags: ['тег1'], subscriptionLevel: 'free', isLiked: true };
      expect(content.arePostsEqual(p1, p2)).toBe(true);
    });

    it('должен возвращать false, если у постов отличаются ключевые поля', () => {
      const p1 = { id: '1', title: 'Глава 1', publishTime: 123, tags: ['тег1'], subscriptionLevel: 'free', isLiked: true };
      const p2 = { id: '1', title: 'Глава 1', publishTime: 123, tags: ['тег1'], subscriptionLevel: 'free', isLiked: false };
      expect(content.arePostsEqual(p1, p2)).toBe(false);
    });
  });

  describe('ensureUserData', () => {
    it('должен инициализировать дефолтные данные для нового тайтла', () => {
      const titleName = 'Крутой Тайтл';
      const data = content.ensureUserData(titleName);
      expect(data).toEqual({ status: 'none', notes: '', readPosts: [], updatedAt: 0 });
      expect(content.state.user_data[titleName]).toBeDefined();
    });

    it('должен возвращать существующие данные, если они уже есть в state', () => {
      const titleName = 'Существующий Тайтл';
      content.state.user_data[titleName] = { status: 'watching', notes: 'Заметка', readPosts: ['123'] };
      const data = content.ensureUserData(titleName);
      expect(data.status).toBe('watching');
      expect(data.notes).toBe('Заметка');
    });
  });

  describe('getGroupedTitles', () => {
    it('должен группировать посты по тайтлам на основе тегов', () => {
      content.state.posts = [
        { id: '1', title: 'Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false },
        { id: '2', title: 'Глава 2', publishTime: 105, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true },
        { id: '3', title: 'Пост объявлений', publishTime: 90, tags: [{ id: 'tag-2', title: 'объявление' }], subscriptionLevel: 'free', isLiked: false },
      ];

      const grouped = content.getGroupedTitles();
      
      // Должен найти группу 'Реинкарнация'
      const reincarnation = grouped.find(g => g.name === 'Реинкарнация');
      expect(reincarnation).toBeDefined();
      expect(reincarnation.posts.length).toBe(2);
      expect(reincarnation.readCount).toBe(1); // 1 лайкнутый пост
      
      // Объявление отфильтровано из обычных групп, но должно быть в группе 'Объявления'
      const announcements = grouped.find(g => g.name === 'Объявления');
      expect(announcements).toBeDefined();
      expect(announcements.posts.length).toBe(1);
    });

    it('должен автоматически переносить полностью озвученный и полностью просмотренный тайтл в статус completed', () => {
      content.state.posts = [
        { id: 'post-1', title: 'Реинкарнация бездельника — Конец', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true }
      ];

      const grouped = content.getGroupedTitles();
      const reincarnation = grouped.find(g => g.name === 'Реинкарнация');
      expect(reincarnation).toBeDefined();
      expect(reincarnation.status).toBe('completed');
    });

    it('должен устанавливать updatedAt = 0 при автоматическом присвоении статуса и не менять его, если запись существовала', () => {
      content.state.posts = [
        { id: 'post-1', title: 'Реинкарнация Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true },
        { id: 'post-2', title: 'Реинкарнация Глава 2', publishTime: 105, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true }
      ];

      // Случай 1: записи нет в user_data, она создается автоматически
      content.getGroupedTitles();
      expect(content.state.user_data['Реинкарнация']).toBeDefined();
      expect(content.state.user_data['Реинкарнация'].status).toBe('watching');
      expect(content.state.user_data['Реинкарнация'].updatedAt).toBe(0);

      // Случай 2: запись существовала с определенным updatedAt, статус меняется автоматически (например, на completed)
      content.state.user_data['Реинкарнация'] = { status: 'watching', notes: '', readPosts: [], updatedAt: 12345 };
      content.state.posts.push(
        { id: 'post-3', title: 'Реинкарнация Глава 3 — Конец', publishTime: 110, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true }
      );
      
      content.getGroupedTitles();
      expect(content.state.user_data['Реинкарнация'].status).toBe('completed');
      expect(content.state.user_data['Реинкарнация'].updatedAt).toBe(12345); // updatedAt не изменился!
    });

    it('должен сливать дублирующиеся ключи (defaultName и titleName) при миграции на основе таймстампов', () => {
      // Имитируем красивое имя
      content.state.blogDescriptionLinks = [
        { url: 'https://boosty.to/slug/posts?postsTagsIds=tag-1', title: 'Реинкарнация бездельника' }
      ];

      // Два поста с одним и тем же тегом
      content.state.posts = [
        { id: 'post-1', title: 'Реинкарнация Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: true }
      ];

      // В user_data лежат оба ключа: старый (Реинкарнация) с более старым таймстампом, новый (Реинкарнация бездельника) с более новым
      content.state.user_data['Реинкарнация'] = { status: 'favorite', notes: 'пример 1', readPosts: ['post-1'], updatedAt: 100 };
      content.state.user_data['Реинкарнация бездельника'] = { status: 'favorite', notes: 'пример 2', readPosts: ['post-1'], updatedAt: 200 };

      content.getGroupedTitles();

      // Старый ключ должен быть удален
      expect(content.state.user_data['Реинкарнация']).toBeUndefined();
      
      // Новый ключ должен содержать заметку с более свежим таймстампом
      expect(content.state.user_data['Реинкарнация бездельника']).toBeDefined();
      expect(content.state.user_data['Реинкарнация бездельника'].notes).toBe('пример 2');
      expect(content.state.user_data['Реинкарнация бездельника'].updatedAt).toBe(200);
    });
  });

  describe('checkAndTriggerOpenChat', () => {
    let originalWindow;
    let originalDocument;

    beforeEach(() => {
      originalWindow = global.window;
      originalDocument = global.document;
      vi.useFakeTimers();
    });

    afterEach(() => {
      global.window = originalWindow;
      global.document = originalDocument;
      vi.useRealTimers();
    });

    it('должен проигнорировать вызов, если в URL нет параметра openChat', () => {
      global.window = {
        location: {
          href: 'https://boosty.to/akai2211',
          pathname: '/akai2211'
        },
        history: {
          replaceState: vi.fn()
        }
      };
      
      const querySelectorSpy = vi.fn();
      global.document = {
        querySelector: querySelectorSpy,
        querySelectorAll: vi.fn(() => [])
      };

      content.checkAndTriggerOpenChat();
      expect(querySelectorSpy).not.toHaveBeenCalled();
    });

    it('должен запустить интервал поиска и кликнуть по кнопке чата при наличии openChat в URL', () => {
      const replaceStateSpy = vi.fn();
      global.window = {
        location: {
          href: 'https://boosty.to/akai2211?openChat=true',
          pathname: '/akai2211',
          search: '?openChat=true',
          hash: ''
        },
        history: {
          replaceState: replaceStateSpy
        }
      };

      const mockButton = { click: vi.fn() };
      global.document = {
        querySelector: vi.fn((selector) => {
          if (selector === 'button[data-test-id="AUTHORCARDBLOCK:messageButton"]') {
            return mockButton;
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => [])
      };

      content.checkAndTriggerOpenChat();

      // Должен очистить URL от параметра openChat
      expect(replaceStateSpy).toHaveBeenCalled();

      // Прокручиваем таймер вперед
      vi.advanceTimersByTime(500);

      // Кнопка должна быть найдена и кликнута
      expect(mockButton.click).toHaveBeenCalled();
    });
  });

  describe('getWebDavOrigin', () => {
    it('должен возвращать yandex origin, если провайдер yandex', () => {
      content.webdavConfig.provider = 'yandex';
      content.webdavConfig.baseUrl = '';
      const origin = content.getWebDavOrigin();
      expect(origin).toBe('https://webdav.yandex.ru/*');
    });

    it('должен возвращать кастомный origin, если провайдер другой WebDAV', () => {
      content.webdavConfig.provider = 'webdav';
      content.webdavConfig.baseUrl = 'https://nextcloud.example.com/remote.php/dav/files/user/';
      const origin = content.getWebDavOrigin();
      expect(origin).toBe('https://nextcloud.example.com/*');
    });

    it('должен возвращать null, если baseUrl пустой при кастомном WebDAV', () => {
      content.webdavConfig.provider = 'webdav';
      content.webdavConfig.baseUrl = '';
      const origin = content.getWebDavOrigin();
      expect(origin).toBeNull();
    });
  });

  describe('requestWebDavPermission', () => {
    beforeEach(() => {
      global.chrome.permissions = {
        contains: vi.fn((query, cb) => cb(false)),
        request: vi.fn((query, cb) => cb(true))
      };
    });

    it('должен проверять и запрашивать права через chrome.permissions', async () => {
      const origin = 'https://nextcloud.example.com/*';
      const result = await content.requestWebDavPermission(origin);
      
      expect(global.chrome.permissions.contains).toHaveBeenCalledWith({ origins: [origin] }, expect.any(Function));
      expect(global.chrome.permissions.request).toHaveBeenCalledWith({ origins: [origin] }, expect.any(Function));
      expect(result).toBe(true);
    });

    it('должен возвращать true и не запрашивать, если права уже есть', async () => {
      global.chrome.permissions.contains = vi.fn((query, cb) => cb(true));
      
      const origin = 'https://nextcloud.example.com/*';
      const result = await content.requestWebDavPermission(origin);
      
      expect(global.chrome.permissions.contains).toHaveBeenCalledWith({ origins: [origin] }, expect.any(Function));
      expect(global.chrome.permissions.request).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
