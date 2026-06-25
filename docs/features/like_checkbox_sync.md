# Фича: Синхронизация лайков и чекбоксов

Ключевая фича расширения. Связывает состояние «прочитано» (чекбокс в сайдбаре расширения) с состоянием лайка (сердечко) на Boosty — в обе стороны и в реальном времени.

---

## 1. Концепция

Расширение использует лайки Boosty как прокси для хранения прогресса чтения. Включается настройкой **«Учитывать лайки как просмотренное»** (`state.settings.syncLikes`).

**Принцип:** лайк поставлен на Boosty = глава прочитана в расширении, и наоборот.

**Два независимых источника «прочитано»:**
1. `readPosts[]` — ручная отметка пользователя (чекбокс вручную в расширении)
2. `post.isLiked` — лайк с Boosty API

Чекбокс отображается как `checked`, если выполняется хотя бы одно из двух:
```js
const isChecked = readSet.has(String(post.id)) || (state.settings.syncLikes && post.isLiked);
```

---

## 2. Контекст исполнения

Расширение работает в **двух изолированных контекстах**:

| Контекст | Файл | Что делает |
|---|---|---|
| **Content Script** (изолированный мир) | `content.js` | UI расширения, API-запросы, кэш, чекбоксы |
| **Main World** (страница) | `page_script.js` | Перехват fetch/XHR Boosty, косметическая подсветка сердечка поста |

Они общаются через `window.postMessage`:
- `content.js` → `page_script.js`: сообщение `LF_SET_LIKE_VISUAL`
- `page_script.js` → `content.js`: сообщение `LF_REACTION_INTERCEPTED`

---

## 3. DOM Boosty — ключевые элементы

```
[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]   ← кнопка реакции (лайка)
  data-active="true/false"                             ← текущее состояние лайка
  <span>5</span>                                       ← счётчик лайков (числовой)

[class*="ReactionSelector"]                            ← поповер выбора реакции (при клике)
  <img src="...heart...">                              ← иконка сердечка внутри поповера

[class*="ReactionsComment"]                            ← блок реакций на КОММЕНТАРИЙ (ловушка!)
```

> [!WARNING]
> В ленте постов ниже каждого поста могут быть комментарии с собственным блоком реакций (`ReactionsComment`). Его нужно всегда явно исключать при поиске поповера поста.

---

## 4. Направление 1: Чекбокс → Лайк

**Триггер:** пользователь ставит или снимает чекбокс в сайдбаре расширения.

### 4.1 Два контекста, где есть чекбоксы

**А. Детальный вид тайтла** (список глав внутри сайдбара, `renderDetailView`):
- Строки: `~content.js:4162–4267`
- Рендер чекбокса: `lf-chapter-checkbox`, атрибут `data-post-id`

**Б. Режим «строк» в ленте** (фильтрация по тегу, `renderFeedRows`):
- Строки: `~content.js:4557–4676`
- Рендер чекбокса: аналогично

### 4.2 Что происходит при смене состояния чекбокса

```
Пользователь кликает на чекбокс
       │
       ├─ [checked=true]
       │    ├─ 1. postId добавляется в userData.readPosts[]
       │    ├─ 2. saveStateToStorage()
       │    ├─ 3. sendBoostyReaction(postId)        → API POST /reaction (content.js)
       │    └─ 4. postMessage(LF_SET_LIKE_VISUAL, {postId, isLiked: true})
       │
       └─ [checked=false]
            ├─ 1. postId удаляется из userData.readPosts[]
            ├─ 2. saveStateToStorage()
            ├─ 3. removeBoostyReaction(postId)      → API DELETE /reaction (content.js)
            └─ 4. postMessage(LF_SET_LIKE_VISUAL, {postId, isLiked: false})
```

### 4.3 API-запросы (`content.js`)

**`sendBoostyReaction(postId)`** — ставит лайк:
```
POST https://api.boosty.to/v1/blog/{BLOG_SLUG}/post/{postId}/reaction?from_page=blog
Authorization: Bearer {token}
body: reaction=heart
```

**`removeBoostyReaction(postId)`** — снимает лайк:
```
DELETE https://api.boosty.to/v1/blog/{BLOG_SLUG}/post/{postId}/reaction?from_page=blog
Authorization: Bearer {token}
body: reaction=heart
```

Токен читается из `localStorage.getItem('auth')` → `accessToken`.

### 4.4 Косметическая подсветка сердечка (`page_script.js`)

Реальное состояние лайка ставится **только** REST-запросом из `content.js` (§4.3). Сердечко на самой странице Boosty подсвечивается отдельным косметическим патчем: после API-запроса `content.js` отправляет `LF_SET_LIKE_VISUAL`, `page_script.js` ловит его и вызывает `applyLikeVisual(postId, isLiked)`.

Ключевая идея: подсветку рисуем **своим классом** `lf-bb-liked`, а не сгенерированным классом Boosty `ReactionItem-...selected_<хэш>` (хэш генерируется сборкой Boosty и на холодной странице неизвестен). `page_script` один раз внедряет `<style>` (`ensureLikeStyleInjected`), который стилизует `lf-bb-liked` как «выбранную» реакцию: полупрозрачная серая пилюля-контейнер + бейдж-счётчик бренд-оранжевым (`rgb(241,95,44)`) с белым текстом. **Поэтому подсветка работает с первого раза, без знания хэша и без прогрева.**

`applyLikeVisual(postId, isLiked, adjustCount)` подсвечивает обе точки, где Boosty показывает реакцию:

```
applyLikeVisual(postId, isLiked, adjustCount)
  │
  ├─ likedPosts.set(postId, isLiked)   ← карта состояния в page_script
  │
  ├─ findReactionButton(postId)
  │     1) если URL страницы содержит postId → кнопка реакций прямо на странице
  │        (надёжно даже для поста БЕЗ комментариев — не зависит от ссылок-якорей);
  │     2) иначе ищем через a[href*=postId] и поднимаемся к кнопке.
  │
  ├─ агрегатная кнопка реакций: вешаем/снимаем .lf-bb-liked (оранжевая рамка),
  │     при adjustCount — правим суммарный счётчик `amount` ±1.
  │
  └─ ВИДИМЫЙ ряд реакций (страница поста, раскрытый пост) — элемент
        `[class*="ReactionItem-...container"].heart`:
        applyHeartItemVisual() → add/remove .lf-bb-liked + снять родной _selected_ + счётчик ±1
        («показано как лайк» = есть наш .lf-bb-liked ИЛИ родной _selected_ Boosty; идемпотентно)
```

**Проактивная синхронизация всего состояния** (`LF_SYNC_ALL_LIKES`): `render()` в сайдбаре (с дебаунсом ~200мс) шлёт в `page_script` полный список лайкнутых id. page_script проходит все кнопки реакций на странице и подсвечивает лайкнутые — поэтому при загрузке/навигации сердечки сразу отражают состояние расширения, не дожидаясь клика.

**Наблюдатель за поповером** (`initPopoverObserver`): hover-поповер реакций рисуется лениво. Дебаунс-MutationObserver: при появлении узлов (раз в ~80мс) проверяет, открыт ли поповер у лайкнутого поста, и подсвечивает в нём сердечко. Глобальный `querySelectorAll` на каждую мутацию НЕ делается (Boosty — React-SPA, мутаций много).

> [!IMPORTANT]
> На странице поста и в раскрытом посте ленты кнопочный `data-active` «мою реакцию» **не отражает** (остаётся `false`, даже когда реакция стоит — проверено через API `reacted.actor`). Поэтому там правим ряд реакций (свой класс на heart), а кнопку помечаем отдельно.

Патч косметический: при следующей перезагрузке Boosty перерисует всё из серверных данных (которые уже верны благодаря REST-запросу), наш класс при этом просто исчезает. Чекбокс в сайдбаре расширения обновляется мгновенно и независимо.

### 4.5 Почему НЕ кликаем по поповеру реакций

Старый подход (`simulateReaction`: программный клик по кнопке → поповер → клик по сердечку + сверка счётчика) **удалён** — он не работает на текущей вёрстке Boosty (разведка 2026-06-25, реальная страница через CDP):

- Поповер реакций — это **hover-tooltip** (`[data-test-id="TOOLTIP:CONTENT"]` / `TooltipFloating` / `ReactionSelector`), появляется по наведению, а выбор реакции (`ReactionItem container.heart`) **не реагирует ни на синтетический клик, ни на trusted-клик мышью** (0 мутаций `data-active`). Тот же класс ограничения, что и кнопка настроек VK-плеера: content-script не может синтезировать нужное взаимодействие.
- Счётчик лайков на живой странице **дрейфует сам** (другие подписчики реагируют в реальном времени), поэтому сверка «счётчик до/после» давала ложный рассинхрон и слепой retry → спам варнингов `Рассинхрон счётчика лайков` в консоли.

Вывод: источник истины — REST API, а сердечко на странице правим напрямую (§4.4).

---

## 5. Направление 2: Лайк → Чекбокс

**Триггер:** пользователь кликает на лайк прямо на Boosty (без использования расширения).

### 5.1 Перехват реального клика (`page_script.js`)

`page_script.js` заменяет `window.fetch` и `XMLHttpRequest.prototype.send`. При POST/DELETE на `/reaction` это всегда **реальный клик пользователя** (запросы расширения идут из изолированного мира content-script и сюда не попадают, см. §6) → пропускаем запрос и при успешном ответе отправляем `LF_REACTION_INTERCEPTED`.

```js
window.postMessage({ type: 'LF_REACTION_INTERCEPTED', postId, isLiked }, '*');
```

### 5.2 Обработка в content.js (`handleInterceptedReaction`)

```
handleInterceptedReaction(postId, isLiked)
  │
  ├─ [БЛОК 1] Обновление кэша (если состояние изменилось):
  │    ├─ post.isLiked = isLiked
  │    ├─ saveStateToStorage()
  │    └─ Обновление чекбокса в DOM:
  │         ├─ если чекбокс в DOM → checkbox.checked = isLiked (точечное обновление)
  │         └─ если чекбокс не в DOM → renderListContent() (мягкий ререндер)
  │
  └─ [БЛОК 2] Двусторонняя проверка рассинхрона:
       Срабатывает ВСЕГДА (независимо от изменения кэша).
       Нужен для случая: расширение было выключено в момент лайка — кэш устарел.
       │
       ├─ [isLiked=false] Пользователь снял лайк:
       │    ├─ убираем класс lf-liked-checkbox
       │    └─ если checkbox.checked, но postId НЕ в readPosts →
       │         checkbox.checked = false (был checked только через isLiked)
       │
       └─ [isLiked=true] Пользователь поставил лайк:
            └─ если !checkbox.checked →
                 checkbox.checked = true + класс lf-liked-checkbox
```

> [!NOTE]
> При дизлайке, если пост есть в `readPosts` (ручная отметка) — чекбокс **не снимается**. Ручная отметка имеет приоритет над лайком.

---

## 6. Почему нет дублирующих запросов

Расширение больше не симулирует клики по DOM, поэтому React не порождает «второй» сетевой запрос — глушить нечего, механизм `simulatedPosts` удалён. Единственный запрос лайка идёт из `content.js` (`sendBoostyReaction`/`removeBoostyReaction`) и выполняется в **изолированном мире** content-script, поэтому перехватчик `fetch`/`XHR` в `page_script.js` (main world) его **не видит** — эхо `LF_REACTION_INTERCEPTED` на собственный запрос не возникает. Перехватчик ловит только реальные клики пользователя по реакциям на странице Boosty (направление 2).

---

## 7. Отображение состояния чекбокса

### CSS-классы

| Класс | Значение |
|---|---|
| `lf-chapter-checkbox` | базовый класс чекбокса главы |
| `lf-liked-checkbox` | пост лайкнут на Boosty (жёлтый цвет) |
| `checked` (атрибут) | пост считается прочитанным (из любого источника) |

### Логика рендера

```js
const isLiked  = state.settings.syncLikes && post.isLiked;  // лайк с Boosty
const isChecked = readSet.has(String(post.id)) || isLiked;  // ручная OR лайк

// HTML:
<input type="checkbox"
  class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}"
  data-post-id="${post.id}"
  ${isChecked ? 'checked' : ''}
  ${isLiked ? `title="${t('post_liked_on_boosty')}"` : ''}>
```

---

## 8. Сообщения между контекстами

| Сообщение | Отправитель | Получатель | Данные |
|---|---|---|---|
| `LF_SET_LIKE_VISUAL` | `content.js` | `page_script.js` | `{ postId, isLiked }` |
| `LF_SYNC_ALL_LIKES` | `content.js` | `page_script.js` | `{ likedIds: string[] }` |
| `LF_REACTION_INTERCEPTED` | `page_script.js` | `content.js` | `{ postId, isLiked }` |

---

## 9. Точки отказа (при обновлении Boosty)

| Что сломалось | Где искать | Симптом |
|---|---|---|
| `data-test-id` кнопки реакции изменился | `page_script.js: findReactionButton()` | Кнопка реакции не найдена, сердечко на странице не подсвечивается (на лайк на сервере НЕ влияет) |
| Классы ряда реакций изменились (`ReactionItem-…container`, `…counter`) | `page_script.js: findVisibleHeartReactionItem()`, `ensureLikeStyleInjected()` (CSS-селекторы) | На странице поста сердечко не подсвечивается/счётчик не красится (косметика) |
| Класс `_selected_` Boosty изменился | `page_script.js: applyLikeVisual()` (снятие родной подсветки) | При снятии чекбокса родная подсветка реакции не гаснет до перезагрузки (косметика) |
| `data-active` атрибута нет на кнопке | `page_script.js: applyLikeVisual()` ветка (А) | Подсветка сердечка не переключается в раскладке с простой кнопкой (косметика) |
| Структура счётчика изменилась (не числовой узел) | `page_script.js: adjustLikeCount()` | Число лайков на странице не сдвигается на ±1 (косметика) |
| URL API реакций изменился | `content.js: sendBoostyReaction()`, `removeBoostyReaction()` | **Лайк реально не ставится** — API-запрос 404/400 |
| Паттерн URL в перехватчике не совпал | `page_script.js` → regex `/post/([a-f0-9-]+)/reaction` | Реакция пользователя на Boosty не перехватывается (направление 2) |

---

## 10. Схема потоков данных

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ДЕЙСТВИЕ: пользователь ставит ЧЕКБОКС в расширении                     │
│                                                                          │
│  content.js                          page_script.js (main world)         │
│  ─────────────────────               ─────────────────────────────────   │
│  checkbox onChange                                                        │
│    │                                                                      │
│    ├── sendBoostyReaction()  ← источник истины                           │
│    │   └── fetch POST /reaction  (изолированный мир, не перехватывается)   │
│    │                                                                      │
│    └── postMessage(LF_SET_LIKE_VISUAL)                                    │
│                                  │                                        │
│                          applyLikeVisual()  ← только косметика            │
│                            ├── findReactionButton() → ряд реакций heart    │
│                            ├── если уже в нужном состоянии → выход         │
│                            ├── add/remove .lf-bb-liked (свой класс+CSS)    │
│                            └── adjustLikeCount(±1)                         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ДЕЙСТВИЕ: пользователь ставит ЛАЙК на Boosty                           │
│                                                                          │
│  page_script.js (main world)         content.js                          │
│  ─────────────────────────────────   ─────────────────────               │
│  fetch interceptor                                                        │
│    └── реальный клик пользователя по реакции                              │
│        └── postMessage(LF_REACTION_INTERCEPTED)                           │
│                                  │                                        │
│                          handleInterceptedReaction()                     │
│                            ├── обновляем кэш post.isLiked                 │
│                            ├── обновляем чекбокс в DOM                    │
│                            └── двусторонняя проверка рассинхрона          │
└──────────────────────────────────────────────────────────────────────────┘
```
