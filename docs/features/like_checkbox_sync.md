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
| **Main World** (страница) | `page_script.js` | Перехват fetch/XHR Boosty, DOM-клики по кнопке реакций |

Они общаются через `window.postMessage`:
- `content.js` → `page_script.js`: сообщение `LF_TOGGLE_LIKE_DOM`
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
       │    └─ 4. postMessage(LF_TOGGLE_LIKE_DOM, {postId, isLiked: true})
       │
       └─ [checked=false]
            ├─ 1. postId удаляется из userData.readPosts[]
            ├─ 2. saveStateToStorage()
            ├─ 3. removeBoostyReaction(postId)      → API DELETE /reaction (content.js)
            └─ 4. postMessage(LF_TOGGLE_LIKE_DOM, {postId, isLiked: false})
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

### 4.4 DOM-клик по кнопке реакции (`page_script.js`)

После API-запроса `content.js` отправляет `LF_TOGGLE_LIKE_DOM`. `page_script.js` ловит его и вызывает `simulateReaction(postId, shouldLike)`:

```
simulateReaction(postId, shouldLike)
  │
  ├─ findReactionButton(postId)
  │    └─ ищет a[href*=postId] вне #lf-sidebar → поднимается вверх по DOM
  │       → находит [data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]
  │
  ├─ getLikeCount(reactionBtn)   ← запоминает счётчик ДО клика
  │
  ├─ simulatedPosts.add(postId)  ← помечаем пост как "программный клик"
  │                                 (чтобы заблокировать React-запрос, см. раздел 6)
  │
  ├─ fireClick(reactionBtn)      ← открывает поповер реакций
  │
  ├─ waitForReactionPopover(1500мс)
  │    └─ ищет [class*="ReactionSelector"] НЕ внутри [class*="ReactionsComment"]
  │       (fallback: img[src*="heart"] с теми же исключениями)
  │
  ├─ fireClick(heartElement)     ← кликает по сердечку в поповере
  │
  ├─ ждёт 600мс (обновление DOM React)
  │
  └─ ПРОВЕРКА РАССИНХРОНА (Направление 1):
       ├─ getLikeCount(reactionBtn) — счётчик ПОСЛЕ клика
       ├─ shouldLike=true  → ожидаем увеличение счётчика
       ├─ shouldLike=false → ожидаем уменьшение счётчика
       └─ если не совпало → повторный клик (retry) через тот же механизм
```

### 4.5 Почему нельзя использовать `.click()`

React/Radix UI (поповеры Boosty) игнорируют синтетический `.click()`. Требуется полная цепочка pointer-событий с реальными координатами:

```js
function fireClick(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window,
                 clientX: cx, clientY: cy, buttons: 1, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerover', opts));
  el.dispatchEvent(new MouseEvent('mouseover', opts));
  el.dispatchEvent(new PointerEvent('pointerenter', opts));
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}
```

---

## 5. Направление 2: Лайк → Чекбокс

**Триггер:** пользователь кликает на лайк прямо на Boosty (без использования расширения).

### 5.1 Перехват реального клика (`page_script.js`)

`page_script.js` заменяет `window.fetch` и `XMLHttpRequest.prototype.send`. При POST/DELETE на `/reaction`:

1. Если `simulatedPosts.has(postId)` — это **наш программный клик** → блокируем запрос (возвращаем фейковый 200 OK), чтобы не задублировать уже выполненный API-запрос из `content.js`.
2. Иначе — **реальный клик пользователя** → пропускаем запрос и при успешном ответе отправляем `LF_REACTION_INTERCEPTED`.

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

## 6. Блокировка дублирующих запросов (`simulatedPosts`)

Когда расширение выполняет `simulateReaction`, оно добавляет `postId` в `Set simulatedPosts`. Это нужно, чтобы когда мы программно кликаем по кнопке реакции в DOM, React не отправил **второй** запрос на сервер (первый уже был отправлен через `sendBoostyReaction` / `removeBoostyReaction` из `content.js`).

```
simulatedPosts.add(postId)   ← перед DOM-кликом
    ↓
Перехватчик fetch видит postId в simulatedPosts
    ↓
Возвращает фейковый Response({}, 200)  ← React думает, что всё ок
    ↓
setTimeout 500мс → simulatedPosts.delete(postId)   ← снимаем флаг
```

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
| `LF_TOGGLE_LIKE_DOM` | `content.js` | `page_script.js` | `{ postId, isLiked }` |
| `LF_REACTION_INTERCEPTED` | `page_script.js` | `content.js` | `{ postId, isLiked }` |

---

## 9. Точки отказа (при обновлении Boosty)

| Что сломалось | Где искать | Симптом |
|---|---|---|
| `data-test-id` кнопки реакции изменился | `page_script.js: findReactionButton()` | Кнопка реакции не найдена, DOM-клик не выполняется |
| Классы поповера изменились (`ReactionSelector`) | `page_script.js: waitForReactionPopover()` | Поповер не находится после клика |
| Структура поповера: иконка сердечка не `img[src*="heart"]` | `page_script.js: simulateReaction()` | `heartElement` не найден |
| URL API реакций изменился | `content.js: sendBoostyReaction()`, `removeBoostyReaction()` | API-запрос 404/400 |
| Паттерн URL в перехватчике не совпал | `page_script.js` → regex `/post/([a-f0-9-]+)/reaction` | Реакция пользователя не перехватывается |
| `data-active` атрибута нет на кнопке | `content.js` (старый код устаревшей ветки) | Только если старая логика была активна |

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
│    ├── sendBoostyReaction()                                               │
│    │   └── fetch POST /reaction  ──→ [заблокирован simulatedPosts]        │
│    │                                                                      │
│    └── postMessage(LF_TOGGLE_LIKE_DOM)                                    │
│                                  │                                        │
│                          simulateReaction()                               │
│                            ├── fireClick(reactionBtn)                     │
│                            ├── waitForReactionPopover()                   │
│                            ├── fireClick(heartElement)                    │
│                            └── проверка счётчика → retry если рассинхрон │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ДЕЙСТВИЕ: пользователь ставит ЛАЙК на Boosty                           │
│                                                                          │
│  page_script.js (main world)         content.js                          │
│  ─────────────────────────────────   ─────────────────────               │
│  fetch interceptor                                                        │
│    └── !simulatedPosts → реальный клик                                    │
│        └── postMessage(LF_REACTION_INTERCEPTED)                           │
│                                  │                                        │
│                          handleInterceptedReaction()                     │
│                            ├── обновляем кэш post.isLiked                 │
│                            ├── обновляем чекбокс в DOM                    │
│                            └── двусторонняя проверка рассинхрона          │
└──────────────────────────────────────────────────────────────────────────┘
```
