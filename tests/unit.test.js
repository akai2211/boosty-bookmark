import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import manifest from '../manifest.json';


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
    getManifest: vi.fn(() => ({ version: manifest.version }))
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

// Импортируем тестируемый модуль (ESM). Динамический импорт — чтобы моки chrome/sessionStorage
// были установлены до выполнения init() при загрузке модуля.
const content = await import('../src/content.js');
const utils = await import('../src/utils.js');

describe('base64 <-> ArrayBuffer (передача тела WebDAV)', () => {
  it('round-trip сохраняет байты без потерь', () => {
    const src = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 80, 75, 3, 4]); // в т.ч. PK-сигнатура zip
    const b64 = utils.arrayBufferToBase64(src.buffer);
    expect(typeof b64).toBe('string');
    const back = new Uint8Array(utils.base64ToArrayBuffer(b64));
    expect(Array.from(back)).toEqual(Array.from(src));
  });

  it('round-trip на большом буфере (чанковое кодирование)', () => {
    const big = new Uint8Array(200000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    const back = new Uint8Array(utils.base64ToArrayBuffer(utils.arrayBufferToBase64(big.buffer)));
    expect(back.length).toBe(big.length);
    expect(back[0]).toBe(0);
    expect(back[199999]).toBe(199999 % 256);
  });
});

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
      expect(result).toEqual({ granted: true, pageOpened: false });
    });

    it('должен возвращать true и не запрашивать, если права уже есть', async () => {
      global.chrome.permissions.contains = vi.fn((query, cb) => cb(true));
      
      const origin = 'https://nextcloud.example.com/*';
      const result = await content.requestWebDavPermission(origin);

      expect(global.chrome.permissions.contains).toHaveBeenCalledWith({ origins: [origin] }, expect.any(Function));
      expect(global.chrome.permissions.request).not.toHaveBeenCalled();
      expect(result).toEqual({ granted: true, pageOpened: false });
    });
  });

  describe('syncActiveTitleFromUrl', () => {
    let originalWindow;

    beforeEach(() => {
      originalWindow = global.window;
      // Сброс модульного состояния навигации, чтобы тесты не зависели от порядка
      // (lastProcessedTagParam / lastProcessedPostIdParam утекают между тестами).
      content.resetProcessedTagParam();
      content.state.ui = { activeTitle: null };
      content.state.blogDescriptionLinks = [];
      content.state.settings = { syncTitleFromUrl: true };
      content.state.posts = [
        { id: '1', title: 'Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it('не должен переключать activeTitle, если опция syncTitleFromUrl отключена в настройках', () => {
      content.state.settings.syncTitleFromUrl = false;
      global.window = {
        location: {
          pathname: '/lightfoxmanga',
          search: '?postsTagsIds=tag-1'
        }
      };

      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBeNull();
    });

    it('должен переключать activeTitle на название тайтла, если в URL есть postsTagsIds, соответствующий tagId', () => {
      global.window = {
        location: {
          pathname: '/lightfoxmanga',
          search: '?postsTagsIds=tag-1'
        }
      };

      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lf_active_title', 'Реинкарнация');
    });

    it('должен переключать activeTitle на название тайтла по имени (декодированному из URL), если tagId не найден', () => {
      global.window = {
        location: {
          pathname: '/lightfoxmanga',
          search: '?tag=%D0%A0%D0%B5%D0%B8%D0%BD%D0%BA%D0%B0%D1%80%D0%BD%D0%B0%D1%86%D0%B8%D1%8F' // "Реинкарнация"
        }
      };

      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');
    });

    it('должен сбрасывать activeTitle на null при переходе с тега на общую ленту (когда tagParam становится null, а до этого был не null)', () => {
      global.window = {
        location: {
          pathname: '/lightfoxmanga',
          search: '?postsTagsIds=tag-1'
        }
      };
      content.state.ui.activeTitle = 'Реинкарнация';
      content.syncActiveTitleFromUrl(); // Установит lastProcessedTagParam = 'tag-1'

      // Теперь переходим на общую ленту без параметров тегов
      global.window.location.search = '';
      content.syncActiveTitleFromUrl();

      expect(content.state.ui.activeTitle).toBeNull();
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lf_active_title', '');
    });

    it('не должен менять activeTitle при ручной навигации в сайдбаре, если URL не менялся', () => {
      global.window = {
        location: {
          pathname: '/lightfoxmanga',
          search: '?postsTagsIds=tag-1'
        }
      };
      
      content.syncActiveTitleFromUrl(); // Установит activeTitle = 'Реинкарнация' и lastProcessedTagParam = 'tag-1'
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');

      // Симулируем ручной выход пользователя на главный экран в сайдбаре (activeTitle = null)
      content.state.ui.activeTitle = null;

      // Вызов syncActiveTitleFromUrl не должен вернуть "Реинкарнация", так как tagParam не изменился
      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBeNull();
    });

    it('должен переключать activeTitle на название тайтла по ID поста, если этот пост есть в state.posts', () => {
      content.state.posts = [
        { id: 'post-123', title: 'Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      global.window = {
        location: {
          pathname: '/lightfoxmanga/posts/post-123',
          search: ''
        }
      };

      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lf_active_title', 'Реинкарнация');
    });

    it('должен сбрасывать activeTitle на null при переходе с конкретного поста на общую ленту', () => {
      content.state.posts = [
        { id: 'post-123', title: 'Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      global.window = {
        location: {
          pathname: '/lightfoxmanga/posts/post-123',
          search: ''
        }
      };
      
      content.syncActiveTitleFromUrl(); // Установит activeTitle = 'Реинкарнация' и lastProcessedPostIdParam = 'post-123'
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');

      // Переходим на общую ленту
      global.window.location.pathname = '/lightfoxmanga';
      content.syncActiveTitleFromUrl();

      expect(content.state.ui.activeTitle).toBeNull();
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lf_active_title', '');
    });

    it('не должен фиксировать lastProcessedPostIdParam, если пост не найден, чтобы повторить попытку при следующем тике', () => {
      content.state.posts = []; // Поста еще нет в базе
      global.window = {
        location: {
          pathname: '/lightfoxmanga/posts/post-123',
          search: ''
        }
      };

      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBeNull();

      // Теперь пост загрузился в базу
      content.state.posts = [
        { id: 'post-123', title: 'Глава 1', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];

      // Должен успешно переключить, так как lastProcessedPostIdParam был сброшен в null
      content.syncActiveTitleFromUrl();
      expect(content.state.ui.activeTitle).toBe('Реинкарнация');
    });
  });

  describe('analyzeNewContent — новизна по стабильному tagId (регресс)', () => {
    beforeEach(() => {
      content.state.newTitles = [];
      content.state.newChapters = [];
      content.state.lastVisit = 0;
      content.state.blogDescriptionLinks = [];
      content.state.user_data = {};
      content.state.settings = { syncLikes: false };
    });

    it('должен регистрировать новый тайтл по tagId, а не по отображаемому имени', () => {
      const oldPosts = [
        { id: 'old-1', title: 'Старый', publishTime: 50, tags: [{ id: 'tag-0', title: 'Старый' }], subscriptionLevel: 'free', isLiked: false }
      ];
      const freshPosts = [
        ...oldPosts,
        { id: 'new-1', title: 'Дебют', publishTime: 200, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      content.state.posts = freshPosts;

      content.analyzeNewContent(oldPosts, freshPosts);

      // Ключ — стабильный tagId, а не имя
      expect(content.state.newTitles).toContain('tag-1');
      expect(content.state.newTitles).not.toContain('Реинкарнация');
    });

    it('новый тайтл НЕ должен пропадать с вкладки «Новые» после переименования (красивые имена)', () => {
      const oldPosts = [
        { id: 'old-1', title: 'Старый', publishTime: 50, tags: [{ id: 'tag-0', title: 'Старый' }], subscriptionLevel: 'free', isLiked: false }
      ];
      const freshPosts = [
        ...oldPosts,
        { id: 'new-1', title: 'Дебют', publishTime: 200, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      content.state.posts = freshPosts;
      content.analyzeNewContent(oldPosts, freshPosts);

      // Автор позже задал «красивое имя» для тега — отображаемое имя тайтла меняется
      content.state.blogDescriptionLinks = [
        { url: 'https://boosty.to/slug/posts?postsTagsIds=tag-1', title: 'Реинкарнация бездельника' }
      ];

      const renamed = content.getGroupedTitles().find(g => g.name === 'Реинкарнация бездельника');
      expect(renamed).toBeDefined();
      // Несмотря на смену имени, тайтл остаётся новым (матч по tagId)
      expect(renamed.isNewTitle).toBe(true);
      // И именно по tagId, а не по новому имени (старый баг хранил по имени и здесь бы потерял запись)
      expect(content.state.newTitles).toContain('tag-1');
      expect(content.state.newTitles).not.toContain('Реинкарнация бездельника');
    });

    it('новые главы отслеживаемого тайтла переживают переименование', () => {
      const oldPosts = [
        { id: 'c1', title: 'Глава 1', publishTime: 50, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      content.state.user_data['Реинкарнация'] = { status: 'watching', notes: '', readPosts: [], updatedAt: 0 };
      const freshPosts = [
        ...oldPosts,
        { id: 'c2', title: 'Глава 2', publishTime: 100, tags: [{ id: 'tag-1', title: 'Реинкарнация' }], subscriptionLevel: 'free', isLiked: false }
      ];
      content.state.posts = freshPosts;

      content.analyzeNewContent(oldPosts, freshPosts);
      expect(content.state.newChapters).toContain('tag-1');

      // Переименование
      content.state.blogDescriptionLinks = [
        { url: 'https://boosty.to/slug/posts?postsTagsIds=tag-1', title: 'Реинкарнация бездельника' }
      ];
      const renamed = content.getGroupedTitles().find(g => g.name === 'Реинкарнация бездельника');
      expect(renamed).toBeDefined();
      expect(renamed.hasNewChapters).toBe(true);
    });
  });
});
