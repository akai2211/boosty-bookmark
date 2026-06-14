import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  });
});
