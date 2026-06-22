# План поэтапного разделения монолита content.js

В данном файле описан пошаговый план разделения монолитного файла `content.js` (5600+ строк) на логические модули с использованием сборщика **esbuild**.

Разделение производится последовательно, шаг за шагом. Каждый модуль изолируется, тестируется локально и в E2E-тестах перед переходом к следующему этапу.

---

## Стратегические решения (принятые до начала реализации)

### Стратегия 1: Бандлинг `locales.js` и `webdav-sync.js`

`locales.js` и `webdav-sync.js` **включаются внутрь бандла** через ES-импорты.

**Обоснование:**
- `TAB_NAMES` в `src/utils.js` вызывает `t()` из `locales.js` при инициализации модуля. Если `locales.js` остаётся внешним глобалом, `t` будет `undefined` на момент инициализации `utils.js` внутри бандла.
- `getWebDavSyncApi()` в `content.js` создаёт инстанс из `webdav-sync.js` — при бандлинге обоих файлов зависимость становится явной.

**Итог:** После Этапа 1 файлы `locales.js` и `webdav-sync.js` **удаляются из `manifest.json`** (секция `content_scripts → js`). В манифесте остаются: `jszip.min.js`, собранный `content.js`, `page_script.js`.

> [!IMPORTANT]
> `jszip.min.js` остаётся внешним файлом — его не нужно бандлить, так как JSZip предоставляет глобал `JSZip`, который используется в коде через `globalThis.JSZip`. esbuild должен знать об этом через `--global-name` или конфигурацию.

---

### Стратегия 2: Переход тестов с CommonJS на ESM

Текущие тесты используют `require('../content.js')` (CommonJS). esbuild по умолчанию генерирует IIFE или ESM — `module.exports` в бандле не будет. Все юнит-тесты сломаются.

**Решение (выполняется в Этапе 1):**
1. Добавить в `package.json` поле `"type": "module"`.
2. Переписать `tests/unit.test.js` и `tests/webdav-sync.test.js`: заменить `require()` на `import`.
3. Экспорт из `content.js` (`module.exports = { ... }`) заменяется на именованные `export` из соответствующих src-модулей.
4. Vitest поддерживает ESM нативно — дополнительная конфигурация не нужна.

---

### Стратегия 3: Граф зависимостей между модулями

Для предотвращения **циклических зависимостей** заранее определён граф:

```
jszip.min.js      ← внешний глобал (не бандлится)
locales.js        → будет преобразован в src/locales.js (ES-модуль)
webdav-sync.js    → будет преобразован в src/webdav-sync.js (ES-модуль)

src/utils.js        ← импортирует: src/locales.js
src/state.js        ← импортирует: src/utils.js
src/navigation.js   ← импортирует: src/state.js, src/utils.js
src/players.js      ← импортирует: src/state.js, src/utils.js
src/sync.js         ← импортирует: src/state.js, src/utils.js, src/webdav-sync.js
                       НЕ импортирует ui/sidebar.js (разрыв цикла — см. ниже)
src/ui/templates.js ← импортирует: src/utils.js, src/state.js
src/ui/sidebar.js   ← импортирует: src/state.js, src/utils.js, src/ui/templates.js, src/sync.js
src/content.js      ← импортирует все модули, точка входа
```

**Разрыв цикла `sync ↔ sidebar`:**

`sync.js` вызывает `render()` после каждой синхронизации — это прямая зависимость от `ui/sidebar.js`. Чтобы её разорвать, функции синхронизации принимают `render` как **callback-параметр**:

```js
// src/sync.js
export async function performFullSync(onComplete) {
  // ... логика синхронизации ...
  if (onComplete) onComplete(); // вместо прямого вызова render()
}

// src/content.js (точка входа)
import { performFullSync } from './sync.js';
import { render } from './ui/sidebar.js';

// Привязка callback-а на уровне точки входа
const boundPerformFullSync = () => performFullSync(render);
```

---

### Стратегия 4: DEV_ONLY-блоки при esbuild

`build.js` применяет regex-чистку DEV_ONLY к **собранному** `content.js` из корня — это корректный подход, ничего менять не нужно.

**Требования к запуску esbuild:**
- Флаг `--minify` **запрещён** (комментарии минификатор удаляет, DEV_ONLY-маркеры исчезнут до чистки).
- Флаг `--minify-whitespace` — также запрещён по той же причине.
- Флаг `--bundle` — **обязателен**.
- Флаг `--sourcemap` — рекомендуется для отладки.

Итоговая команда сборки dev:
```sh
esbuild src/content.js --bundle --outfile=content.js --sourcemap
```

Сборка релиза (`build.js`) сначала запускает esbuild, потом чистит DEV_ONLY из `content.js`, затем упаковывает в ZIP.

---

## Архитектура модулей (папка `src/`)

После завершения рефакторинга структура исходного кода в `src/` будет выглядеть следующим образом:

| Файл | Содержимое |
|---|---|
| `src/locales.js` | Переименован из `locales.js` (корня). ES-модуль: `export function t()`, `export function tCategory()`, `export function getCurrentLang()` |
| `src/webdav-sync.js` | Переименован из `webdav-sync.js` (корня). ES-модуль: `export class WebDavProvider`, `export function mergeChannelsMaps()` |
| `src/utils.js` | Константы (`BLOG_SLUG`, `STORAGE_KEY`, `TAGS_BLACKLIST`, `TAB_NAMES`, SVG-пути), хелперы (`escapeHtml`, `isExtensionContextValid`, `formatDate`, `arePostsEqual`, `getUsdtAddress`) |
| `src/state.js` | Объекты `state` и `webdavConfig`, функции `loadStateFromStorage`, `saveStateToStorage`, `loadWebDavConfig`, `saveWebDavConfig`, `ensureUserData` |
| `src/navigation.js` | `checkAndScrollToFeed`, `checkAndScrollToPost`, `checkAndTriggerOpenChat`, `syncActiveTitleFromUrl`, `patchHistory` |
| `src/players.js` | `trackPlayerProgress`, `initPlayerTracking`, `forceVideoQuality`, `setupVideoPlayerQuality` и вспомогательные функции плееров |
| `src/sync.js` | `backgroundSync`, `performIncrementalSync`, `performFullSync`, `performWebDavSync`, `handleInterceptedReaction`, `patchFetch`. Принимают `render` как callback (разрыв цикла) |
| `src/ui/templates.js` | Чистые функции-генераторы HTML-строк: шаблоны сайдбара, списков, вкладок, модальных окон |
| `src/ui/sidebar.js` | `render`, `renderListContent`, `renderDetailContent`, `renderSettingsContent`, `renderAboutContent`, `createSidebar`, `createTriggerButton`, обработчики D&D, масштабирование |
| `src/content.js` | Точка входа: импортирует все модули, вызывает `init()`, запускает URL-интервал |

---

## Поэтапный план реализации

### [ ] Этап 1: Настройка инфраструктуры сборки (esbuild + миграция тестов)

1. Установить `esbuild` в качестве dev-зависимости: `npm install -D esbuild`.
2. **Переход тестов на ESM:**
   - Добавить в `package.json` поле `"type": "module"`.
   - Переписать `tests/unit.test.js` и `tests/webdav-sync.test.js`: заменить `require()` на `import ... from`.
   - Проверить, что `vitest.config.js` не требует дополнительных изменений (Vitest поддерживает ESM нативно).
   - Запустить `npm run test:unit` и убедиться, что все тесты проходят **до** переноса кода.
3. Скопировать текущий `content.js` в `src/content.js` (временная копия монолита).
4. **Обновить стратегию внешних скриптов:**
   - Скопировать `locales.js` → `src/locales.js`, добавить `export` к функциям `t`, `tCategory`, `getCurrentLang`.
   - Скопировать `webdav-sync.js` → `src/webdav-sync.js`, добавить `export` к публичным функциям и классам.
   - В начало `src/content.js` добавить импорты: `import { t, tCategory, getCurrentLang } from './locales.js'` и `import { ... } from './webdav-sync.js'`.
   - Обновить `manifest.json`: убрать `locales.js` и `webdav-sync.js` из списка `content_scripts → js`.
5. Добавить в `package.json` скрипты сборки:
   - `"build:js": "esbuild src/content.js --bundle --outfile=content.js --sourcemap"` — для сборки в корень.
   - `"watch:js": "esbuild src/content.js --bundle --outfile=content.js --watch --sourcemap"` — для автосборки при изменениях.
6. Обновить скрипт релиза `build.js`: перед упаковкой в ZIP запускать `esbuild src/content.js --bundle --outfile=.tmp_build/content.js` (вместо простого копирования `content.js`). Флаг `--minify` не использовать.
7. Проверить сборку: убедиться, что собранный `content.js` в корне работает в браузере, юнит-тесты и E2E-тесты проходят (`npm test`).

---

### [ ] Этап 2: Выделение `src/locales.js` и `src/webdav-sync.js` (уже начато в Этапе 1)

1. Убедиться, что `src/locales.js` является полноценным ES-модулем с именованными экспортами.
2. Убедиться, что `src/webdav-sync.js` является полноценным ES-модулем с именованными экспортами.
3. Удалить исходные `locales.js` и `webdav-sync.js` из корня (они теперь только в `src/`).
4. Обновить E2E-тесты Playwright, если они напрямую ссылаются на файлы из корня.
5. Собрать проект, запустить тесты: `npm test`.

---

### [ ] Этап 3: Выделение `src/utils.js` (Утилиты и константы)

1. Создать `src/utils.js`.
2. Перенести из `src/content.js`:
   - Константы: `BLOG_SLUG`, `STORAGE_KEY`, `WEBDAV_CONFIG_KEY`, `WEBDAV_AUTO_SYNC_MIN_INTERVAL_MS`, `TAGS_BLACKLIST`, SVG-пути (`FOX_SVG_PATH`, `PLATE_SVG_PATH`, `BOOKMARK_SVG_PATH`).
   - `TAB_NAMES` (использует `t()` — импортируется из `src/locales.js`).
   - Функции: `escapeHtml`, `getUsdtAddress`, `isExtensionContextValid`, `formatDate`, `arePostsEqual`, `formatSeconds`.
3. Экспортировать из `src/utils.js`, импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 4: Выделение `src/state.js` (Глобальное состояние и хранилище)

1. Создать `src/state.js`.
2. Перенести:
   - Объявление объектов `state` и `webdavConfig`.
   - Функции: `loadStateFromStorage`, `saveStateToStorage`, `loadWebDavConfig`, `saveWebDavConfig`, `ensureUserData`, `debouncedWebDavUpload`, `buildLocalChannelsMapFromStorage`, `applyMergedChannelToState`, `exportUserData`, `importUserData`, `updateExtensionBadge`.
3. Экспортировать состояние и функции, импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 5: Выделение `src/navigation.js` (Навигация и скроллинг)

1. Создать `src/navigation.js`.
2. Перенести: `checkAndScrollToFeed`, `checkAndScrollToPost`, `checkAndTriggerOpenChat`, `syncActiveTitleFromUrl`, `patchHistory`, `isTargetPage`, `hasPostHash`.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 6: Выделение `src/players.js` (Интеграция с медиаплеерами)

1. Создать `src/players.js`.
2. Перенести: `trackPlayerProgress`, `initPlayerTracking`, `getPlayerUniqueId`, `getPostIdForPlayer`, `getPlayerProgressForPost`, `updateChapterProgressInUI`, `getClosestElement`, `forceVideoQuality`, `openQualitySubmenu`, `selectQualityOption`, `setupVideoPlayerQuality`.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 7: Выделение `src/sync.js` (Синхронизация и API) — с разрывом цикла

1. Создать `src/sync.js`.
2. Перенести: `backgroundSync`, `performIncrementalSync`, `performFullSync`, `performWebDavSync`, `triggerAutoWebDavSync`, `handleInterceptedReaction`, `patchFetch`, `syncDomLike`, `getBoostyAuthToken`, `getWebDavSyncApi`, `normalizeWebDavBaseUrl`, `createWebDavProvider`, `getWebDavOrigin`, `requestWebDavPermission`, `isWebDavConfigured`, `isWebDavFieldsFilled`, `analyzeNewContent`.
3. **Разрыв цикла с `ui/sidebar.js`:** все функции, которые вызывают `render()`, `renderListContent()`, `renderSettingsContent()` — принимают эти функции как callback-параметры. Привязка callback-ов происходит в `src/content.js`.
4. Импортировать в `src/content.js`.
5. Собрать проект, запустить тесты.

---

### [ ] Этап 8: Выделение `src/ui/templates.js` (HTML-шаблоны интерфейса)

1. Создать `src/ui/templates.js`.
2. Выделить функции, генерирующие чистые HTML-строки: шаблоны сайдбара, списков тайтлов, вкладок, кнопок настроек, модальных окон (USDT), групп. Критерий: функция не имеет побочных эффектов, только принимает данные и возвращает строку.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 9: Выделение `src/ui/sidebar.js` (Логика и рендеринг UI)

1. Создать `src/ui/sidebar.js`.
2. Перенести: `render`, `renderListContent`, `renderDetailContent`, `renderSettingsContent`, `renderAboutContent`, `renderGroup`, `renderChaptersList`, `createMangaRow`, `createSidebar`, `createTriggerButton`, `detectAndApplyTheme`, `showNotification`, `debounceSave`, `clearTitleNovelty`, `getStatusTooltip`, `moveTab`, `dragAndDropReorder`.
3. Импортировать sync-функции из `src/sync.js`, передавать `render` в них как callback.
4. Импортировать в `src/content.js`.
5. Собрать проект, запустить тесты.

---

### [ ] Этап 10: Выделение `src/ui/devtools.js` (Панель разработчика)

> Выделено в отдельный этап, так как DevTools содержит DEV_ONLY-блоки, которые нужно аккуратно сохранить при переносе.

1. Создать `src/ui/devtools.js`.
2. Перенести функции DevTools-панели (обёрнутые в `/* DEV_ONLY_START */` блоки): `initDevTools`, `createDevTriggerButton`, `createDevSidebar`, `renderDevSidebarContent`, `loadDevSettings`, `saveDevSettings`, `applyDevSettingsEffects`, `autoOpenReactions`, `isReactionElement`, `handleReactionLeave`, `handleGlobalClick`, `handleDevScroll`, `isPopoverOpenForBtn`.
3. DEV_ONLY-маркеры сохранить вокруг всего содержимого файла.
4. В `build.js` убедиться, что DEV_ONLY-чистка применяется к **собранному** `content.js` (корень), а не к src-файлам.
5. Собрать проект, запустить тесты, проверить, что релизная сборка (`npm run build`) не содержит DevTools-кода.

---

### [ ] Этап 11: Финальное объединение и рефакторинг точки входа

1. В `src/content.js` должно остаться только:
   - Импорты всех модулей.
   - Функция `init()`.
   - Привязка callback-ов (передача `render` в sync-функции).
   - Запуск URL-интервала и слушателей событий верхнего уровня.
2. Провести полное итоговое тестирование: `npm test` (юнит-тесты + E2E-тесты Playwright).
3. Проверить корректность сборки релизных архивов: `npm run build` и `npm run build:firefox`.
4. Проверить, что DEV_ONLY-блоки полностью отсутствуют в релизных архивах.
5. Проверить итоговый размер `content.js` в корне (должен быть сопоставим с текущим — бандл без минификации).

---

## Workflow разработки и проверки

### Режим разработки (watch)

Перед началом работы с `src/`-файлами запускать в отдельном терминале:

```sh
npm run watch:js
```

esbuild отслеживает изменения в `src/` и автоматически пересобирает `content.js` в корне при каждом сохранении файла (~2–10 мс). Браузер обновляется вручную как обычно (F5 / Ctrl+R).

> [!IMPORTANT]
> Если `watch` не запущен, браузер будет грузить устаревший `content.js`. Это единственное отличие от текущего workflow.

---

### Чеклист проверки после каждого этапа

После завершения любого этапа выполнить в указанном порядке:

1. **Собрать бандл:**
   ```sh
   npm run build:js
   ```

2. **Запустить тесты:**
   ```sh
   npm test
   ```
   Все тесты должны пройти без ошибок.

3. **Ручная проверка в браузере:**
   - Перезагрузить расширение в `chrome://extensions/` (кнопка «Обновить»).
   - Открыть Boosty, убедиться что сайдбар открывается.
   - Проверить функциональность, затронутую в текущем этапе (см. таблицу ниже).

4. **Проверить отсутствие ошибок в консоли** (`F12 → Console`) на странице Boosty.

---

### Таблица риска и фокуса проверок по этапам

| Этап | Риск | Что проверять в браузере |
|---|---|---|
| 1 — esbuild + ESM тесты | Средний | Сайдбар открывается, синхронизация работает |
| 2 — locales/webdav в src/ | Средний | Локализация интерфейса, настройки WebDAV |
| 3 — utils | Низкий | `npm test` достаточно |
| 4 — state | Низкий | Прогресс сохраняется после перезагрузки страницы |
| 5 — navigation | Средний | Клик по тайтлу → переход, автоскролл к главе |
| 6 — players | Низкий | Запоминание времени аудио/видео |
| 7 — sync | Высокий | Инкрементальная и полная синхронизация, лайки |
| 8 — ui/templates | Средний | Внешний вид всех вкладок сайдбара |
| 9 — ui/sidebar | Высокий | Все интерактивные элементы: D&D, масштаб, настройки |
| 10 — ui/devtools | Низкий | Открытие DevTools-панели, эмуляция даты |
| 11 — финальный | Средний | Полный прогон + обе релизные сборки |

