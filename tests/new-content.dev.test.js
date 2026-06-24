import { describe, it, expect, beforeEach, vi } from 'vitest';
import manifest from '../manifest.json';

// Этот файл прогоняется проектом vitest с DEV=true (см. vitest.config.js),
// поэтому здесь доступна dev-only ветка эмуляции даты отсечки в analyzeNewContent
// (src/sync.js): новизна пересчитывается целиком от границы state.lastVisit по
// текущей базе, ключевое условие — firstPostTime > lastVisit (дебют после границы).

// Моки глобальных объектов Chrome/sessionStorage до импорта тестируемых модулей.
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

// Импортируем модули напрямую (без точки входа content.js, чтобы не запускать init()
// с интервалами и слушателями). analyzeNewContent берёт state/getGroupedTitlesInternal
// из собственных импортов, а devSettings инжектится через setSyncDeps().
const { state } = await import('../src/state.js');
const { analyzeNewContent, setSyncDeps } = await import('../src/sync.js');

// Границы выбраны вокруг даты отсечки. publishTime у постов — в секундах,
// state.lastVisit — в миллисекундах (как в продакшене).
const CUTOFF = '2026-06-20T00:00:00Z';
const cutoffMs = Date.parse(CUTOFF);
const secExact = Math.floor(cutoffMs / 1000);             // пост ровно на границе
const secBefore = Math.floor(Date.parse('2026-06-10T00:00:00Z') / 1000); // до границы
const secAfter = Math.floor(Date.parse('2026-06-22T00:00:00Z') / 1000);  // после границы

const post = (id, tagId, tagTitle, publishTime, isLiked = false) => ({
  id, title: id, publishTime, isLiked,
  tags: [{ id: tagId, title: tagTitle }],
  subscriptionLevel: 'free'
});

function setDev(overrides = {}) {
  setSyncDeps({
    devSettings: { enabled: true, cutoffDate: CUTOFF, showAllNewChapters: false, ...overrides }
  });
}

describe('analyzeNewContent — DEV-эмуляция даты отсечки (firstPostTime > lastVisit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.posts = [];
    state.user_data = {};
    state.newTitles = [];
    state.newChapters = [];
    state.blogDescriptionLinks = [];
    state.lastVisit = cutoffMs;
    setDev();
  });

  it('тайтл, дебютировавший ПОСЛЕ границы, попадает в «Новые тайтлы» по стабильному tagId', () => {
    state.posts = [post('a1', 'tag-new', 'Дебют', secAfter)];

    analyzeNewContent([{ id: 'x' }], state.posts);

    expect(state.newTitles).toContain('tag-new');
    expect(state.newTitles).not.toContain('Дебют');
    expect(state.newChapters).toEqual([]);
  });

  it('строгое неравенство: пост ровно НА границе не считается новым', () => {
    state.lastVisit = secExact * 1000;
    state.posts = [post('a1', 'tag-edge', 'Граница', secExact)];

    analyzeNewContent([{ id: 'x' }], state.posts);

    expect(state.newTitles).toEqual([]);
    expect(state.newChapters).toEqual([]);
  });

  it('у отслеживаемого тайтла с дебютом ДО границы новый пост после границы идёт в «Новые главы»', () => {
    state.user_data['Тайтл'] = { status: 'watching', notes: '', readPosts: [], updatedAt: 0 };
    state.posts = [
      post('old', 'tag-1', 'Тайтл', secBefore),
      post('new', 'tag-1', 'Тайтл', secAfter),
    ];

    analyzeNewContent([{ id: 'x' }], state.posts);

    expect(state.newChapters).toContain('tag-1');
    expect(state.newTitles).toEqual([]);
  });

  it('неотслеживаемый тайтл не даёт «Новые главы», пока не включён showAllNewChapters', () => {
    // status none, readCount 0 (<=1) — grouping не повышает его до watching
    state.posts = [
      post('old', 'tag-2', 'Чужой', secBefore),
      post('new', 'tag-2', 'Чужой', secAfter),
    ];

    analyzeNewContent([{ id: 'x' }], state.posts);
    expect(state.newChapters).not.toContain('tag-2');

    // С dev-переключателем «показывать все новые главы» ограничение по статусу снимается
    state.newChapters = [];
    setDev({ showAllNewChapters: true });
    analyzeNewContent([{ id: 'x' }], state.posts);
    expect(state.newChapters).toContain('tag-2');
  });

  it('полностью просмотренный тайтл не попадает в «Новые главы» даже при новом посте', () => {
    state.user_data['Дочитан'] = { status: 'watching', notes: '', readPosts: [], updatedAt: 0 };
    state.posts = [
      post('old', 'tag-3', 'Дочитан', secBefore, true),
      post('new', 'tag-3', 'Дочитан', secAfter, true),
    ];

    analyzeNewContent([{ id: 'x' }], state.posts);

    expect(state.newChapters).not.toContain('tag-3');
  });

  it('инициализирует state.lastVisit из даты отсечки, если он не задан (0)', () => {
    state.lastVisit = 0;
    state.posts = [post('a1', 'tag-init', 'Инит', secAfter)];

    analyzeNewContent([{ id: 'x' }], state.posts);

    expect(state.lastVisit).toBe(cutoffMs);
    expect(state.newTitles).toContain('tag-init');
  });
});
