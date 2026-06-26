# Фича: Синхронизация лайков и чекбоксов

Связывает состояние «прочитано» (чекбокс в сайдбаре расширения) с состоянием лайка (сердечко) на Boosty.

> [!IMPORTANT]
> **Концепция переписана 2026-06 (build `2026-06-26.8`).** Раньше синхронизация была двусторонней: чекбокс расширения САМ ставил/снимал лайк на Boosty (REST + косметическая подсветка сердечка). Это оказалось ненадёжным и порождало запинки. Теперь связь **одно­сторонняя**: лайкать можно **только на самом посте Boosty**, расширение лайки не пишет — только читает.

---

## 1. Концепция

Настройка **«Отмечать просмотр лайком»** (`state.settings.syncLikes`) определяет режим.

### Режим ВКЛючён (`syncLikes = true`)
- Лайк на посте Boosty = глава прочитана. Это **единственный** способ отметить главу: все чекбоксы в сайдбаре становятся **read-only** — переключение блокируется перехватом клика (`click` → `preventDefault`), а не атрибутом `disabled` (он делал бы галочку серой/блёклой). Класс `lf-checkbox-locked` (курсор `not-allowed`, цвет обычный), тултип `post_mark_via_like`.
- Поставил/снял лайк на самом посте → галочка в расширении меняется **в реальном времени** (перехват fetch/XHR, направление «лайк → галочка»).
- `autoMarkOpen` («отмечать главу при открытии») в этом режиме подавляется — иначе создалась бы залоченная, неснимаемая отметка.

### Режим ВЫКЛючен (`syncLikes = false`)
- Лайки и галочки **полностью независимы**. Чекбоксы редактируются вручную как обычные отметки «прочитано» (`readPosts[]`), лайки на Boosty на них не влияют и наоборот. Намеренный рассинхрон — это ОК.

Чекбокс отображается как `checked`, если выполняется хотя бы одно:
```js
const isLiked  = state.settings.syncLikes && post.isLiked;   // лайк с Boosty (только при ВКЛ)
const isChecked = readSet.has(String(post.id)) || isLiked;   // ручная OR лайк
```

---

## 2. Контекст исполнения

| Контекст | Файл | Что делает |
|---|---|---|
| **Content Script** (изолированный мир) | `content.js` (`src/`) | UI расширения, кэш, чекбоксы |
| **Main World** (страница) | `page_script.js` | Перехват fetch/XHR Boosty (лайк → сообщение), качество VK |

Общение через `window.postMessage`. По теме лайков осталось **одно** сообщение:
- `page_script.js` → `content.js`: `LF_REACTION_INTERCEPTED` `{ postId, isLiked }`

(Сообщения `LF_SET_LIKE_VISUAL` и `LF_SYNC_ALL_LIKES`, а также вся косметическая подсветка сердечка на странице — **удалены** вместе со старой двусторонней моделью.)

---

## 3. Направление: Лайк на Boosty → Чекбокс расширения

### 3.1 Перехват реального клика (`page_script.js`)

`page_script.js` оборачивает `window.fetch` и `XMLHttpRequest.prototype.send`. При POST/DELETE на `/reaction` (это всегда реальный клик пользователя — расширение само лайки больше не шлёт) и успешном ответе:

```js
window.postMessage({ type: 'LF_REACTION_INTERCEPTED', postId, isLiked }, '*');
```

`isLiked = (метод === POST)`.

### 3.2 Обработка в content.js (`handleInterceptedReaction`, `src/sync.js`)

```
handleInterceptedReaction(postId, isLiked)
  │
  ├─ Обновление кэша (всегда, даже при выключенной настройке — данные не врут):
  │    если post.isLiked изменился → post.isLiked = isLiked; saveStateToStorage()
  │
  ├─ if (!state.settings.syncLikes) return;   ← ВЫКЛ: галочки независимы, не трогаем
  │
  ├─ [изменилось] точечное обновление чекбокса в DOM:
  │     checkbox.checked = isLiked, +/- класс lf-liked-checkbox, обновить счётчик в шапке;
  │     если чекбокса нет в DOM и мы в списке → мягкий renderListContent()
  │
  └─ Двусторонняя проверка рассинхрона (на случай: расширение было выключено в момент лайка):
       ├─ [isLiked=false] снять lf-liked-checkbox; если checked, но postId НЕ в readPosts → снять галочку
       └─ [isLiked=true]  если !checked → поставить галочку + класс lf-liked-checkbox
```

> [!NOTE]
> Залоченная галочка (`disabled`) всё равно обновляется отсюда: `disabled` блокирует только пользовательский ввод, JS-присвоение `.checked` работает.

> [!NOTE]
> При дизлайке, если пост есть в `readPosts` (ручная отметка из режима ВЫКЛ) — галочка **не снимается**. Ручная отметка приоритетнее.

---

## 4. Почему расширение больше не пишет лайки

Разведка 2026-06 (живая страница через CDP) показала: поповер реакций Boosty — это hover-tooltip, выбор реакции **не реагирует ни на синтетический, ни на trusted-клик** (0 мутаций). Запись через REST API технически работала, но:
- косметическую подсветку сердечка на странице приходилось рисовать своим классом, поповер ловить MutationObserver-ом — хрупко, с запинками на холодной странице;
- счётчик лайков на живой странице дрейфует сам (другие подписчики), что мешало сверке.

Решение (по запросу пользователя): **лайк ставит только пользователь на самом посте**. Расширение читает результат через перехват сети и отражает его в галочке. Удалены: `sendBoostyReaction`/`removeBoostyReaction` (`src/sync.js`), `syncAllLikesToPage` + `LF_SYNC_ALL_LIKES` (`src/ui/sidebar.js`), весь блок косметики и наблюдатель поповера (`page_script.js`).

---

## 5. Отображение состояния чекбокса

| Класс / атрибут | Значение |
|---|---|
| `lf-chapter-checkbox` | базовый класс чекбокса главы |
| `lf-liked-checkbox` | пост лайкнут на Boosty (приглушённый вид) |
| `lf-checkbox-locked` | режим ВКЛ: галочка read-only, `cursor: not-allowed`, обычный цвет (переключение блокирует JS `click`→`preventDefault`) |
| `checked` (атрибут) | пост считается прочитанным (из любого источника) |

```js
<input type="checkbox"
  class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}${state.settings.syncLikes ? ' lf-checkbox-locked' : ''}"
  data-post-id="${post.id}"
  ${isChecked ? 'checked' : ''}
  ${state.settings.syncLikes ? 'disabled' : ''}
  title="${isLiked ? t('post_liked_on_boosty') : (state.settings.syncLikes ? t('post_mark_via_like') : '')}">
```

Оба места рендера: детальный вид тайтла (`renderDetailView`) и режим строк ленты (`renderFeedRows`) в `src/ui/sidebar.js`.

---

## 6. Точки отказа (при обновлении Boosty)

| Что сломалось | Где искать | Симптом |
|---|---|---|
| Паттерн URL реакции изменился | `page_script.js` → regex `/post/([a-f0-9-]+)/reaction` | Лайк на посте не подхватывается галочкой (направление перестаёт работать) |
| Boosty сменил fetch на иной транспорт | `page_script.js` (перехват fetch/XHR) | То же самое |
| Структура `state.settings.syncLikes` / `post.isLiked` | `src/sync.js: handleInterceptedReaction`, `src/ui/sidebar.js` рендер | Галочки не отражают лайки |
