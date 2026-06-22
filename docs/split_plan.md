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

**Итог:** После Этапа 1 файлы `locales.js` и `webdav-sync.js` **удаляются из секции `content_scripts → js` в ОБОИХ манифестах** — `manifest.json` И `manifest.firefox.json` (оба содержат идентичный список). В манифестах остаются: `jszip.min.js`, собранный `content.js`, `page_script.js`.

> [!IMPORTANT]
> `jszip.min.js` остаётся внешним файлом и **не бандлится**. В коде он используется как голый глобал (`new JSZip()`, `JSZip.loadAsync()` — см. content.js:941, 1035, 1228, 1263), а не через импорт. esbuild оставляет необъявленные глобалы как есть — **никакой дополнительной конфигурации (`--global-name`, `external`) для JSZip не требуется**. (`--global-name` задаёт имя выходного IIFE-экспорта и к внешним глобалам отношения не имеет — упоминание этого флага в прежней версии плана было ошибочным.)

---

### Стратегия 2: Переход тестов с CommonJS на ESM

Текущие тесты используют `require('../content.js')` (CommonJS). esbuild по умолчанию генерирует IIFE или ESM — `module.exports` в бандле не будет. Все юнит-тесты сломаются.

**Решение (выполняется в Этапе 1):**
1. Добавить в `package.json` поле `"type": "module"`.
2. Переписать `tests/unit.test.js` и `tests/webdav-sync.test.js`: заменить `require()` на `import`.
3. Экспорт из `content.js` (`module.exports = { ... }`, content.js:5597-5612) заменяется на именованные `export` из соответствующих src-модулей.
4. Vitest поддерживает ESM нативно — дополнительная конфигурация не нужна.

> [!WARNING]
> Поле `"type": "module"` делает **все** `.js`-файлы проекта ESM-модулями для Node. Это ломает `build.js` — он написан на CommonJS (`require`, `__dirname`, content.js не использует, но build.js — да). **Решение:** переименовать `build.js` → `build.cjs` (расширение `.cjs` принудительно трактуется как CommonJS), обновить скрипты в `package.json` (`"build": "node build.cjs"`, `"build:firefox": "node build.cjs --firefox"`). Конфиги `vitest.config.js` и `playwright.config.js` уже на ESM (`import`) и загружаются собственными esbuild-загрузчиками — их трогать не нужно.

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

### Стратегия 4: Вырезание dev-кода через флаг сборки (`--define`)

> [!WARNING]
> Прежний подход — комментарии-маркеры `/* DEV_ONLY_START */ … /* DEV_ONLY_END */` + regex-очистка в `build.js` (`cleanDevCode`, build.js:57-60) — **несовместим с esbuild**. Проверено эмпирически: esbuild **удаляет обычные комментарии даже без `--minify`**, поэтому маркеры `DEV_ONLY` исчезают из собранного `content.js` ещё до того, как до них доберётся regex. Dev-код (DevTools-панель), который реально вызывается из `init`, при этом останется в релизе. Старую стратегию использовать нельзя.

**Новый подход:** dev-код оборачивается в условие `if (DEV) { … }`, где `DEV` — глобальный флаг, подставляемый esbuild на этапе сборки через `--define`.

- **Dev-сборка** (watch / локальная отладка): `--define:DEV=true` — весь dev-код сохраняется.
- **Релизная сборка**: `--define:DEV=false --minify-syntax` — esbuild сворачивает `if (false)` и удаляет мёртвую ветку, а tree-shaking вырезает ставшие неиспользуемыми функции (`initDevTools`, `createDevSidebar` и т. д.).

> [!IMPORTANT]
> `--minify-syntax` для релиза **обязателен**. Проверено эмпирически: `--define:DEV=false` **без** `--minify-syntax` НЕ удаляет ветку `if (false) {}` — она остаётся в выводе вместе с dev-функциями. `--minify-syntax` выполняет только синтаксические оптимизации (включая DCE мёртвых веток), сохраняя переносы строк — итоговый `content.js` остаётся читаемым. Полный `--minify` (сжатие пробелов + переименование) не нужен и нежелателен.

**Флаг `DEV` в юнит-тестах:** vitest импортирует `src/*.js` напрямую, минуя esbuild — голый `DEV` вызовет `ReferenceError`. Решение: добавить в `vitest.config.js` поле `define: { DEV: 'false' }` (Vite/Vitest пробрасывают `define` в свой esbuild-transform). E2E (Playwright) тестирует уже собранный бандл, где `DEV` подставлен сборкой, — дополнительных действий не требует.

**Итоговые команды esbuild:**
```sh
# dev (watch, в отдельном терминале)
esbuild src/content.js --bundle --define:DEV=true --outfile=content.js --watch --sourcemap

# dev (разовая сборка)
esbuild src/content.js --bundle --define:DEV=true --outfile=content.js --sourcemap

# релиз (вызывается из build.cjs)
esbuild src/content.js --bundle --define:DEV=false --minify-syntax --outfile=.tmp_build/content.js
```

`--bundle` обязателен во всех режимах. `--sourcemap` — только для dev (в релиз карта не включается).

**Изменения в `build.cjs` (бывший `build.js`):**
1. Переименование `build.js` → `build.cjs` из-за `"type": "module"` (см. Стратегию 2).
2. Убрать `locales.js` и `webdav-sync.js` из массива `INCLUDE_PATHS` (build.js:16-17) — теперь они внутри бандла, в релизе их быть не должно (иначе отгрузятся мёртвые дубликаты).
3. Вместо копирования корневого `content.js` — запускать esbuild напрямую в `.tmp_build/content.js` с релизными флагами (выше).
4. Функция `cleanDevCode` (regex DEV_ONLY) больше не нужна — удалить. Очистка dev-кода теперь происходит на этапе esbuild через `--define` + `--minify-syntax`.
5. `cleanDevCode` всё ещё применяется к `styles.css` (DEV_ONLY-блоки в CSS) — для CSS механизм маркеров остаётся рабочим, поэтому функцию **сохранить именно для CSS**, убрав её применение к `.js`-файлам. (Проверить, есть ли DEV_ONLY в styles.css; если нет — удалить полностью.)
6. `page_script.js` бандлингу не подвергается (отдельный MAIN-world скрипт) — копируется как есть. DEV_ONLY-блоков в нём нет (проверено), очистка не требуется.

> [!NOTE]
> В `styles.css` есть DEV_ONLY-блок (проверено: 1 блок) — для CSS механизм regex-маркеров рабочий и сохраняется. В `content.js` сейчас 11 DEV_ONLY-блоков — все они мигрируют на `if (DEV)` при переносе в `src/` (основной объём — на Этапе 10).

---

### Стратегия 5: `content.js` в корне — артефакт сборки

После рефакторинга корневой `content.js` — это **результат бандла**; источник правды переезжает в `src/`. Решения по workflow:

- **Бандл не коммитим.** Добавить в `.gitignore`: `/content.js` и `/content.js.map`. Так как файл сейчас в git, выполнить `git rm --cached content.js` (история монолита сохранится в прошлых коммитах).
- Свежий клон собирает бандл командой `npm run build:js` — отразить это в README (раздел «Разработка»).
- Расширение и E2E-тесты грузят `content.js` из корня, поэтому добавить npm-хук `"pretest": "npm run build:js"` (и/или `"pretest:e2e"`), чтобы тесты гоняли свежий бандл, а не устаревший.
- `.gitignore` уже покрывает `.tmp_build/` и `*.zip` — релизные артефакты в порядке.

> [!CAUTION]
> Так как `content.js` уходит из-под контроля git, нельзя удалять `src/content.js` или ломать `build:js` — иначе расширение перестанет грузиться до ручной пересборки. На каждом этапе рефакторинга держать `npm run watch:js` запущенным.

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

> [!NOTE]
> **Функции, экспортируемые в тесты** (`module.exports`, content.js:5597-5612), и их будущий дом: `state`, `webdavConfig`, `ensureUserData` → `state.js`; `formatDate`, `arePostsEqual`, `BLOG_SLUG`, `TAGS_BLACKLIST`, `TAB_NAMES` → `utils.js`; `checkAndTriggerOpenChat`, `syncActiveTitleFromUrl` → `navigation.js`; `getWebDavOrigin`, `requestWebDavPermission` → `sync.js`; `getGroupedTitles` (content.js:2188, логика группировки по тайтлам) → `state.js` (зависит от `state.posts`). На каждом этапе соответствующие импорты в тестах обновляются на новый путь (`../src/...`).

## Поэтапный план реализации

> [!NOTE]
> **Принцип порядка этапов.** Извлечение модулей жёстко ограничено графом зависимостей (Стратегия 3): модуль можно вынести, только когда все его зависимости уже извлечены (иначе он импортировал бы из ещё-монолитного `content.js` → цикл). Поэтому фундамент (`infra → locales/webdav → utils → state`) идёт первым **независимо от его лёгкости** — без него ничего не извлекается. В пределах этого ограничения порядок построен **от сложного к лёгкому**: сразу после фундамента выносятся высокорисковые `sync` (Этап 5) и `sidebar` (Этап 7), а независимые низкорисковые `navigation`/`players` (Этапы 8–9) отложены в конец. Так максимум сложности приходится на ранние этапы.

### Регламент работы по чатам (один этап = один чат)

Рефакторинг ведётся по одному этапу за чат. Прогресс хранится **в репозитории и в этом файле** (галочки `[ ]`/`[x]`), а не в памяти чата. Чтобы каждый новый чат стартовал чисто, соблюдать протокол.

**В начале каждого чата:**
1. Прочитать этот файл (`docs/split_plan.md`) и найти первый незавершённый этап `[ ]` — это и есть текущая задача.
2. Прочитать «Стратегические решения» выше (особенно перед этапами 1a/1b, 5, 7, 10) и сверить план с реальным кодом (правило верификации из `docs/agents.md`).
3. Если трогаешь `src/` — запустить в отдельном терминале `npm run watch:js` (иначе браузер грузит устаревший `content.js`).

**В конце каждого этапа:**
4. Прогнать `npm test` (unit + E2E) — должно быть зелёным.
5. Ручная проверка в браузере по «Таблице риска и фокуса проверок» ниже.
6. **Отметить этап выполненным:** заменить `[ ]` на `[x]` в его заголовке.
7. Завершить чат командой **«обнови память и закоммить»** — агент актуализирует `docs/`, поставит галочку, прогонит тесты и сделает локальный коммит. Чистое дерево = следующий чат стартует без путаницы.

> [!IMPORTANT]
> Без галочки `[x]` и коммита следующий чат не поймёт, на каком этапе работа. Шаги 6–7 — обязательны.

### Работа через git worktree

Весь рефакторинг ведётся в **одном отдельном worktree** на **одной долгоживущей ветке** (например `refactor/content-split`). Все этапы (1a … 11) делаются там, по одному за чат, с коммитами на этой ветке. **`main` не трогается до самого конца** — слияние происходит один раз, после прохождения всех этапов и проверок.

**Создание (один раз, в начале):**
```sh
# от актуального main создать воркти + ветку под весь рефакторинг
git worktree add ../boosty-bookmark-refactor -b refactor/content-split
cd ../boosty-bookmark-refactor
npm install        # либо симлинк, см. камень №1
```
Дальше **вся работа и тестирование** (включая «Load unpacked» в браузере) идёт в `../boosty-bookmark-refactor`. Каждый этап завершается коммитом на ветке `refactor/content-split` (по команде «обнови память и закоммить»).

**Слияние (один раз, в самом конце — после Этапа 11):**
```sh
# все этапы [x], npm test зелёный, обе релизные сборки проверены
git -C ../boosty-bookmark switch main
git -C ../boosty-bookmark merge refactor/content-split   # или через PR
git worktree remove ../boosty-bookmark-refactor
git branch -d refactor/content-split
```

**Подводные камни именно этого проекта:**
1. **`node_modules` не шарится между воркти.** В новом воркти нужен `npm install` (esbuild, vitest, playwright). Для скорости можно симлинкнуть: `ln -s ../boosty-bookmark/node_modules ./node_modules`.
2. **`content.js` — gitignored артефакт (Стратегия 5).** В свежем воркти его **нет** на диске. Перед загрузкой расширения в браузер обязательно `npm run build:js` (или запущенный `npm run watch:js`).
3. **«Load unpacked» привязан к пути.** Указать в `chrome://extensions` путь к воркти `../boosty-bookmark-refactor` **один раз** в начале и тестировать только там до самого слияния. После каждой пересборки — «Обновить» расширение.
4. **`main` может уйти вперёд.** Если в `main` во время рефакторинга попадут другие коммиты — периодически подтягивать их в ветку (`git merge main` / `git rebase main` внутри воркти), чтобы финальное слияние прошло без больших конфликтов.

### [x] Этап 1a: ESM-инфраструктура и перенос `locales`/`webdav` в `src/`

> Самая объёмная настроечная часть. Цель: проект собирается esbuild'ом в dev-режиме, тесты зелёные на ESM, `locales`/`webdav` забандлены. Релизная сборка (`build.cjs`) и DEV-гейтинг — в Этапе 1b.

> [!IMPORTANT]
> **1a и 1b желательно делать в одном чате** — это единый блок «инфраструктура». Между ними **релизная сборка нерабочая** (`build.cjs` ещё со старой логикой, манифесты уже не грузят `locales`/`webdav`): после 1a проверять только `npm run build:js` + `npm run test:unit`, **не** запускать `npm run build`. Разрывать на два чата допустимо только если 1a получился слишком тяжёлым.

1. Установить `esbuild` в качестве dev-зависимости: `npm install -D esbuild`.
2. **Переход тестов на ESM:**
   - Добавить в `package.json` поле `"type": "module"`.
   - **Переименовать `build.js` → `build.cjs`** (CommonJS-скрипт, ломается под `"type": "module"`; см. Стратегию 2). Обновить скрипты: `"build": "node build.cjs"`, `"build:firefox": "node build.cjs --firefox"`. (Содержимое `build.cjs` дорабатывается в Этапе 1b.)
   - Переписать `tests/unit.test.js` и `tests/webdav-sync.test.js`: заменить `require()` на `import ... from`. Учесть, что `require('../manifest.json')` (unit.test.js:17) под ESM требует `import ... assert { type: 'json' }` или чтения через `fs`.
   - Добавить в `vitest.config.js` поле `define: { DEV: 'false' }` (чтобы голый `DEV` в src-модулях не падал с `ReferenceError` — см. Стратегию 4).
   - Запустить `npm run test:unit` и убедиться, что все тесты проходят **до** переноса кода.
3. Скопировать текущий `content.js` в `src/content.js` (временная копия монолита).
4. **Обновить стратегию внешних скриптов:**
   - Скопировать `locales.js` → `src/locales.js`, добавить `export` к функциям `t`, `tCategory`, `getCurrentLang`.
   - Скопировать `webdav-sync.js` → `src/webdav-sync.js`, добавить `export` к публичным функциям и классам.
   - В начало `src/content.js` добавить импорты: `import { t, tCategory, getCurrentLang } from './locales.js'` и `import { ... } from './webdav-sync.js'`. Убрать из `src/content.js` блок `module.exports` (content.js:5597-5612) — экспорты для тестов переедут в src-модули на следующих этапах.
   - Обновить **`manifest.json` И `manifest.firefox.json`**: убрать `locales.js` и `webdav-sync.js` из списка `content_scripts → js` в обоих.
5. Добавить в `package.json` dev-скрипты сборки:
   - `"build:js": "esbuild src/content.js --bundle --define:DEV=true --outfile=content.js --sourcemap"` — dev-сборка в корень.
   - `"watch:js": "esbuild src/content.js --bundle --define:DEV=true --outfile=content.js --watch --sourcemap"` — автосборка при изменениях.
   - `"pretest": "npm run build:js"` — гарантирует свежий бандл перед `npm test` (E2E грузит `content.js` из корня).
6. **`content.js` как артефакт сборки** (Стратегия 5): добавить в `.gitignore` строки `/content.js` и `/content.js.map`, выполнить `git rm --cached content.js`.
7. Проверить: `npm run build:js` → собранный `content.js` работает в браузере (сайдбар открывается, локализация и WebDAV-настройки на месте); `npm run test:unit` зелёный. E2E можно прогнать здесь же или отложить до 1b.

---

### [x] Этап 1b: Релизная сборка (`build.cjs`) и флаг `DEV`

> Цель: релизные архивы собираются через esbuild и **не содержат** dev-кода. После этого этапа инфраструктура полностью готова к выделению модулей.

1. **Перевести dev-код DevTools на флаг `DEV`:** заменить обёртки `/* DEV_ONLY_START */ … /* DEV_ONLY_END */` вокруг JS-кода на `if (DEV) { … }` (базовый перевод точек входа; детальный перенос самих функций — Этап 10). Объявления функций DevTools, вызываемые только из dev-веток, esbuild вырежет tree-shaking'ом при релизной сборке.
2. **Обновить `build.cjs`:** убрать `locales.js`/`webdav-sync.js` из `INCLUDE_PATHS`; вместо копирования корневого `content.js` запускать `esbuild src/content.js --bundle --define:DEV=false --minify-syntax --outfile=.tmp_build/content.js`; убрать применение `cleanDevCode` к `.js` (оставить для CSS, если в `styles.css` есть DEV_ONLY-блоки, иначе удалить функцию).
3. Проверить сборку: `npm run build` и `npm run build:firefox` дают рабочие архивы; распаковать оба и `grep`-нуть собранный `content.js` на имена DevTools-функций — их быть не должно; убедиться, что в архивах нет корневых `locales.js`/`webdav-sync.js` и `content.js.map`.
4. Полный прогон `npm test` (unit + E2E) — зелёный.

---

### [x] Этап 2: Финализация `src/locales.js` / `src/webdav-sync.js` и удаление дубликатов

> Основная работа (создание src-копий, экспорты, импорты, правка манифестов) сделана в Этапе 1. Этот этап — cleanup: удаление корневых дубликатов и перевод тестов на новые пути.

1. Убедиться, что `src/locales.js` и `src/webdav-sync.js` — полноценные ES-модули с именованными экспортами.
2. Удалить исходные `locales.js` и `webdav-sync.js` из корня (они теперь только в `src/`).
3. **Обновить пути в юнит-тестах:** `tests/unit.test.js` (`require('../locales.js')`, unit.test.js:39) и `tests/webdav-sync.test.js` (`../locales.js`, `../webdav-sync.js`, строки 3-4) — заменить на импорты из `../src/locales.js` и `../src/webdav-sync.js`.
4. Обновить E2E-тесты Playwright, если они напрямую ссылаются на корневые `locales.js`/`webdav-sync.js`.
5. Проверить, что корневых `locales.js`/`webdav-sync.js` нет в `INCLUDE_PATHS` (`build.cjs`) и в `content_scripts` обоих манифестов (сделано в Этапе 1).
6. Собрать проект, запустить тесты: `npm test`.

---

### [x] Этап 3: Выделение `src/utils.js` (Утилиты и константы)

1. Создать `src/utils.js`.
2. Перенести из `src/content.js`:
   - Константы: `BLOG_SLUG`, `STORAGE_KEY`, `WEBDAV_CONFIG_KEY`, `WEBDAV_AUTO_SYNC_MIN_INTERVAL_MS`, `TAGS_BLACKLIST`, SVG-пути (`FOX_SVG_PATH`, `PLATE_SVG_PATH`, `BOOKMARK_SVG_PATH`).
   - `TAB_NAMES` (использует `t()` — импортируется из `src/locales.js`).
   - Функции: `escapeHtml`, `getUsdtAddress`, `isExtensionContextValid`, `formatDate`, `arePostsEqual`, `formatSeconds`.
3. Экспортировать из `src/utils.js`, импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [x] Этап 4: Выделение `src/state.js` (Глобальное состояние и хранилище)

1. Создать `src/state.js`.
2. Перенести:
   - Объявление объектов `state` и `webdavConfig`.
   - Функции: `loadStateFromStorage`, `saveStateToStorage`, `loadWebDavConfig`, `saveWebDavConfig`, `ensureUserData`, `debouncedWebDavUpload`, `buildLocalChannelsMapFromStorage`, `applyMergedChannelToState`, `exportUserData`, `importUserData`, `updateExtensionBadge`.
3. Экспортировать состояние и функции, импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [x] Этап 5: Выделение `src/sync.js` (Синхронизация и API) — 🔴 ВЫСОКИЙ риск, с разрывом цикла

> Самый сложный и рискованный модуль — выносится первым после фундамента (как только готовы `state`, `utils`, `webdav-sync`).

1. Создать `src/sync.js`.
2. Перенести: `backgroundSync`, `performIncrementalSync`, `performFullSync`, `performWebDavSync`, `triggerAutoWebDavSync`, `handleInterceptedReaction`, `patchFetch`, `syncDomLike`, `getBoostyAuthToken`, `getWebDavSyncApi`, `normalizeWebDavBaseUrl`, `createWebDavProvider`, `getWebDavOrigin`, `requestWebDavPermission`, `isWebDavConfigured`, `isWebDavFieldsFilled`, `analyzeNewContent`.
3. **Разрыв цикла с `ui/sidebar.js`:** все функции, которые вызывают `render()`, `renderListContent()`, `renderSettingsContent()` — принимают эти функции как callback-параметры. На этом этапе `render` ещё живёт в монолитном `src/content.js` (sidebar выносится позже, Этап 7) — привязка callback-ов делается в `content.js` к ещё-инлайновому `render`. Благодаря callback-подходу `sync.js` извлекаемо до `sidebar.js`.
4. Импортировать в `src/content.js`.
5. Собрать проект, запустить тесты. **Тщательная ручная проверка:** инкрементальная и полная синхронизация, перехват лайков, WebDAV.

---

### [x] Этап 6: Выделение `src/ui/templates.js` (HTML-шаблоны интерфейса)

> Prerequisite для `sidebar` (Этап 7): чистые шаблоны выносятся первыми, чтобы sidebar импортировал их, а не держал инлайн.

1. Создать `src/ui/templates.js`.
2. Выделить функции, генерирующие чистые HTML-строки: шаблоны сайдбара, списков тайтлов, вкладок, кнопок настроек, модальных окон (USDT), групп. Критерий: функция не имеет побочных эффектов, только принимает данные и возвращает строку.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [x] Этап 7: Выделение `src/ui/sidebar.js` (Логика и рендеринг UI) — 🔴 ВЫСОКИЙ риск

1. Создать `src/ui/sidebar.js`.
2. Перенести: `render`, `renderListContent`, `renderDetailContent`, `renderSettingsContent`, `renderAboutContent`, `renderGroup`, `renderChaptersList`, `createMangaRow`, `createSidebar`, `createTriggerButton`, `detectAndApplyTheme`, `showNotification`, `debounceSave`, `clearTitleNovelty`, `getStatusTooltip`, `moveTab`, `dragAndDropReorder`.
3. Импортировать sync-функции из `src/sync.js` (Этап 5), передавать `render` в них как callback. Перенести привязку callback-ов из `content.js` сюда / в точку входа.
4. Импортировать в `src/content.js`.
5. Собрать проект, запустить тесты. **Тщательная ручная проверка:** все интерактивные элементы — D&D вкладок, масштаб, настройки, рендеринг всех вкладок.

---

### [x] Этап 8: Выделение `src/navigation.js` (Навигация и скроллинг) — независимый, отложен

> Зависит только от `state`/`utils` — мог быть извлечён раньше, но отложен, чтобы не разбавлять блок высокорисковых модулей.

1. Создать `src/navigation.js`.
2. Перенести: `checkAndScrollToFeed`, `checkAndScrollToPost`, `checkAndTriggerOpenChat`, `syncActiveTitleFromUrl`, `patchHistory`, `isTargetPage`, `hasPostHash`.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [x] Этап 9: Выделение `src/players.js` (Интеграция с медиаплеерами) — независимый, отложен

1. Создать `src/players.js`.
2. Перенести: `trackPlayerProgress`, `initPlayerTracking`, `getPlayerUniqueId`, `getPostIdForPlayer`, `getPlayerProgressForPost`, `updateChapterProgressInUI`, `getClosestElement`, `forceVideoQuality`, `openQualitySubmenu`, `selectQualityOption`, `setupVideoPlayerQuality`.
3. Импортировать в `src/content.js`.
4. Собрать проект, запустить тесты.

---

### [ ] Этап 10: Выделение `src/ui/devtools.js` (Панель разработчика)

> Выделено в отдельный этап, так как DevTools — это dev-код, который должен полностью исчезать из релиза через флаг `DEV` (см. Стратегию 4).

1. Создать `src/ui/devtools.js`.
2. Перенести функции DevTools-панели: `initDevTools`, `createDevTriggerButton`, `createDevSidebar`, `renderDevSidebarContent`, `loadDevSettings`, `saveDevSettings`, `applyDevSettingsEffects`, `autoOpenReactions`, `isReactionElement`, `handleReactionLeave`, `handleGlobalClick`, `handleDevScroll`, `isPopoverOpenForBtn`.
3. **Гейтинг через `DEV`:** все точки входа в DevTools-код (вызовы `initDevTools()` и навешивание dev-слушателей в `content.js`/`init()`) обернуть в `if (DEV) { … }`. Сам модуль `src/ui/devtools.js` импортируется как обычно, но при релизной сборке (`--define:DEV=false --minify-syntax`) все его экспорты, вызываемые только из `if (DEV)`-веток, удаляются tree-shaking'ом.
   - **Важно:** убедиться, что DevTools-функции не вызываются ни из одной prod-ветки — иначе esbuild сохранит их в релизе. Проверить перекрёстные ссылки.
4. Убрать в `src/`-файлах все остаточные маркеры `/* DEV_ONLY_START/END */` вокруг JS — они больше не используются механизмом сборки.
5. Собрать релиз (`npm run build`), распаковать архив и `grep`-нуть собранный `content.js` на имена DevTools-функций (`initDevTools`, `createDevSidebar` и т. п.) — их быть не должно. Запустить тесты.

---

### [ ] Этап 11: Финальное объединение и рефакторинг точки входа

1. В `src/content.js` должно остаться только:
   - Импорты всех модулей.
   - Функция `init()`.
   - Привязка callback-ов (передача `render` в sync-функции).
   - Запуск URL-интервала и слушателей событий верхнего уровня.
2. Провести полное итоговое тестирование: `npm test` (юнит-тесты + E2E-тесты Playwright).
3. Проверить корректность сборки релизных архивов: `npm run build` и `npm run build:firefox` (оба используют `build.cjs` с релизными esbuild-флагами).
4. Распаковать оба архива и `grep`-нуть собранный `content.js` на имена DevTools-функций (`initDevTools`, `createDevSidebar`, …) — dev-код должен полностью отсутствовать (вырезан через `--define:DEV=false --minify-syntax`). Убедиться, что в архивах нет корневых `locales.js`/`webdav-sync.js` (забандлены) и нет `content.js.map`.
5. Проверить итоговый размер dev-`content.js` в корне (бандл с `--minify-syntax` не применяется к dev-сборке, размер сопоставим с текущим монолитом плюс инлайн locales/webdav).

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
| 1a — esbuild + ESM + locales/webdav в src/ | Средний | Сайдбар открывается, локализация и WebDAV-настройки на месте |
| 1b — релизная сборка + флаг DEV | Средний | Релизный архив без DevTools-кода, расширение из архива работает |
| 2 — locales/webdav в src/ | Средний | Локализация интерфейса, настройки WebDAV |
| 3 — utils | Низкий | `npm test` достаточно |
| 4 — state | Низкий | Прогресс сохраняется после перезагрузки страницы |
| 5 — sync | 🔴 Высокий | Инкрементальная и полная синхронизация, лайки, WebDAV |
| 6 — ui/templates | Средний | Внешний вид всех вкладок сайдбара |
| 7 — ui/sidebar | 🔴 Высокий | Все интерактивные элементы: D&D, масштаб, настройки |
| 8 — navigation | Средний | Клик по тайтлу → переход, автоскролл к главе |
| 9 — players | Низкий | Запоминание времени аудио/видео |
| 10 — ui/devtools | Низкий | Открытие DevTools-панели, эмуляция даты |
| 11 — финальный | Средний | Полный прогон + обе релизные сборки |

