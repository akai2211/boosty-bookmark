import { describe, it, expect } from 'vitest';
import * as sync from '../src/webdav-sync.js';

describe('WebDAV sync: слияние данных', () => {
  describe('mergeUserData', () => {
    it('объединяет readPosts из двух источников', () => {
      const local = {
        'Тайтл А': { status: 'watching', notes: '', readPosts: ['post-1', 'post-2'] }
      };
      const remote = {
        'Тайтл А': { status: 'none', notes: '', readPosts: ['post-2', 'post-3'] }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл А'].readPosts.sort()).toEqual(['post-1', 'post-2', 'post-3']);
    });

    it('tombstone: снятие отметки на одном устройстве побеждает устаревшее прочтение на другом', () => {
      // Локально пост снят (unreadMarks свежее), удалённо — всё ещё прочитан (legacy)
      const local = {
        'Тайтл': { status: 'watching', notes: '', readPosts: [], updatedAt: 5000, unreadMarks: { 'p1': 5000 } }
      };
      const remote = {
        'Тайтл': { status: 'watching', notes: '', readPosts: ['p1'], updatedAt: 1000 }
      };
      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл'].readPosts).toEqual([]); // снятие пропагандировано
      expect(merged['Тайтл'].unreadMarks.p1).toBe(5000);
    });

    it('tombstone: повторная отметка прочитанным новее снятия — пост снова прочитан', () => {
      const local = {
        'Тайтл': { status: 'watching', notes: '', readPosts: ['p1'], updatedAt: 9000, readMarks: { 'p1': 9000 } }
      };
      const remote = {
        'Тайтл': { status: 'watching', notes: '', readPosts: [], updatedAt: 5000, unreadMarks: { 'p1': 5000 } }
      };
      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл'].readPosts).toEqual(['p1']);
      expect(merged['Тайтл'].readMarks.p1).toBe(9000);
    });

    it('выбирает статус и заметки на основе таймстампа updatedAt', () => {
      const local = {
        'Тайтл Б': { status: 'watching', notes: 'Новая короткая заметка', readPosts: [], updatedAt: 200 }
      };
      const remote = {
        'Тайтл Б': { status: 'completed', notes: 'Старая длинная заметка в облаке', readPosts: [], updatedAt: 100 }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл Б'].status).toBe('watching');
      expect(merged['Тайтл Б'].notes).toBe('Новая короткая заметка');
    });

    it('выбирает статус и заметки из удаленного источника, если они новее', () => {
      const local = {
        'Тайтл Б': { status: 'watching', notes: 'Локальная заметка', readPosts: [], updatedAt: 100 }
      };
      const remote = {
        'Тайтл Б': { status: 'completed', notes: 'Более свежая удаленная заметка', readPosts: [], updatedAt: 200 }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл Б'].status).toBe('completed');
      expect(merged['Тайтл Б'].notes).toBe('Более свежая удаленная заметка');
    });

    it('корректно обрабатывает отсутствие таймстампов (выбирает локальные по умолчанию)', () => {
      const local = {
        'Тайтл Б': { status: 'watching', notes: 'Локальная', readPosts: [] }
      };
      const remote = {
        'Тайтл Б': { status: 'completed', notes: 'Удаленная', readPosts: [] }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл Б'].status).toBe('watching');
      expect(merged['Тайтл Б'].notes).toBe('Локальная');
    });

    it('сценарий Акая: локальный статус favorite c новой заметкой и свежим таймстампом побеждает удаленный статус favorite со старой заметкой', () => {
      const local = {
        'Тайтл А': { status: 'favorite', notes: 'пример 2', readPosts: [], updatedAt: 200 }
      };
      const remote = {
        'Тайтл А': { status: 'favorite', notes: 'пример 1', readPosts: [], updatedAt: 100 }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл А'].status).toBe('favorite');
      expect(merged['Тайтл А'].notes).toBe('пример 2');
      expect(merged['Тайтл А'].updatedAt).toBe(200);
    });
  });

  describe('mergePosts', () => {
    it('объединяет посты по id и сохраняет isLiked=true', () => {
      const local = [{ id: 'p1', title: 'A', publishTime: 100, isLiked: false }];
      const remote = [{ id: 'p1', title: 'A', publishTime: 100, isLiked: true }, { id: 'p2', title: 'B', publishTime: 200, isLiked: false }];

      const merged = sync.mergePosts(local, remote);
      expect(merged).toHaveLength(2);
      expect(merged.find((p) => p.id === 'p1').isLiked).toBe(true);
    });
  });

  describe('mergeChannelsMaps', () => {
    it('сливает ZIP-данные нескольких каналов с постами', () => {
      const local = {
        lightfoxmanga: {
          exportDate: '2026-01-01T00:00:00.000Z',
          settings: { syncLikes: true, updatedAt: 1000 },
          user_data: { 'Тайтл': { status: 'watching', notes: '', readPosts: ['a'] } },
          playerTimestamps: {},
          lastVisit: 100,
          collapsedGroups: {},
          blogDescriptionLinks: [],
          newTitles: ['Тайтл A'],
          newChapters: ['Тайтл B'],
          newListsUpdatedAt: 1000,
          posts: [{ id: 'p1', title: 'Глава 1', publishTime: 10, isLiked: false }]
        }
      };
      const remote = {
        lightfoxmanga: {
          exportDate: '2026-06-01T00:00:00.000Z',
          settings: { syncLikes: false, autoMarkOpen: true, updatedAt: 2000 },
          user_data: { 'Тайтл': { status: 'none', notes: '', readPosts: ['b'] } },
          playerTimestamps: { 'v1': 30 },
          lastVisit: 200,
          collapsedGroups: {},
          blogDescriptionLinks: [],
          newTitles: ['Тайтл C', 'Тайтл A'],
          newChapters: ['Тайтл D'],
          newListsUpdatedAt: 2000,
          posts: [{ id: 'p1', title: 'Глава 1', publishTime: 10, isLiked: true }]
        }
      };

      const merged = sync.mergeChannelsMaps(local, remote);
      expect(merged.lightfoxmanga.settings.autoMarkOpen).toBe(true);
      expect(merged.lightfoxmanga.user_data['Тайтл'].readPosts.sort()).toEqual(['a', 'b']);
      expect(merged.lightfoxmanga.posts).toHaveLength(1);
      expect(merged.lightfoxmanga.posts[0].isLiked).toBe(true);
      // Списки «Новое» — LWW: удалённый источник новее (newListsUpdatedAt 2000 > 1000)
      expect(merged.lightfoxmanga.newTitles.sort()).toEqual(['Тайтл A', 'Тайтл C']);
      expect(merged.lightfoxmanga.newChapters.sort()).toEqual(['Тайтл D']);
      expect(merged.lightfoxmanga.newListsUpdatedAt).toBe(2000);
      expect(merged.lightfoxmanga.version).toBe('2.0');
    });

    it('настройки выбираются по settings.updatedAt, а не по channel exportDate (Баг 1)', () => {
      // Локальный экспорт «новее» по exportDate, но настройки там старее (updatedAt меньше) —
      // должны победить удалённые настройки. И наоборот для второго случая.
      const base = {
        user_data: {}, playerTimestamps: {}, lastVisit: 0,
        collapsedGroups: {}, blogDescriptionLinks: [], newTitles: [], newChapters: [], posts: []
      };

      const remoteWins = sync.mergeChannelsMaps(
        { ch: { ...base, exportDate: '2026-06-01T00:00:00.000Z', settings: { autoMarkOpen: false, updatedAt: 1000 } } },
        { ch: { ...base, exportDate: '2026-01-01T00:00:00.000Z', settings: { autoMarkOpen: true, updatedAt: 2000 } } }
      );
      expect(remoteWins.ch.settings.autoMarkOpen).toBe(true);

      const localWins = sync.mergeChannelsMaps(
        { ch: { ...base, exportDate: '2026-01-01T00:00:00.000Z', settings: { autoMarkOpen: true, updatedAt: 2000 } } },
        { ch: { ...base, exportDate: '2026-06-01T00:00:00.000Z', settings: { autoMarkOpen: false, updatedAt: 1000 } } }
      );
      expect(localWins.ch.settings.autoMarkOpen).toBe(true);
    });
  });
});
