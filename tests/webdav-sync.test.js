import { describe, it, expect } from 'vitest';

const sync = require('../webdav-sync.js');

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

    it('выбирает более продвинутый статус', () => {
      const local = {
        'Тайтл Б': { status: 'watching', notes: '', readPosts: [] }
      };
      const remote = {
        'Тайтл Б': { status: 'completed', notes: '', readPosts: [] }
      };

      const merged = sync.mergeUserData(local, remote);
      expect(merged['Тайтл Б'].status).toBe('completed');
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
          settings: { syncLikes: true },
          user_data: { 'Тайтл': { status: 'watching', notes: '', readPosts: ['a'] } },
          playerTimestamps: {},
          lastVisit: 100,
          collapsedGroups: {},
          blogDescriptionLinks: [],
          posts: [{ id: 'p1', title: 'Глава 1', publishTime: 10, isLiked: false }]
        }
      };
      const remote = {
        lightfoxmanga: {
          exportDate: '2026-06-01T00:00:00.000Z',
          settings: { syncLikes: false, autoMarkOpen: true },
          user_data: { 'Тайтл': { status: 'none', notes: '', readPosts: ['b'] } },
          playerTimestamps: { 'v1': 30 },
          lastVisit: 200,
          collapsedGroups: {},
          blogDescriptionLinks: [],
          posts: [{ id: 'p1', title: 'Глава 1', publishTime: 10, isLiked: true }]
        }
      };

      const merged = sync.mergeChannelsMaps(local, remote);
      expect(merged.lightfoxmanga.settings.autoMarkOpen).toBe(true);
      expect(merged.lightfoxmanga.user_data['Тайтл'].readPosts.sort()).toEqual(['a', 'b']);
      expect(merged.lightfoxmanga.posts).toHaveLength(1);
      expect(merged.lightfoxmanga.posts[0].isLiked).toBe(true);
      expect(merged.lightfoxmanga.version).toBe('2.0');
    });
  });
});
