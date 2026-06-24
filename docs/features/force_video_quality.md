# Функция «Принудительное качество видео» (Force Video Quality)

Функция позволяет автоматически открывать видео на Boosty в заданном пользователем разрешении (например, всегда 1080p), не открывая вручную меню настроек VK-плеера при каждом просмотре.

Видео на Boosty проигрываются веб-компонентом `vk-video-player` — это новый VK-плеер с собственным Shadow DOM, медиапоток отдаётся CDN VK/OK (`*.vkuser.net`, `api.mycdn.me`).

---

## 1. Почему прежний подход (клики по меню) не работает

Изначально качество выставлялось программными кликами по меню настроек плеера. После смены структуры VK-плеера этот путь стал **принципиально нереализуем из расширения**:

1. **Кнопку настроек нельзя открыть программно.** Кнопка `button[data-testid="settings-btn"]` (иконка `span.settings-icon-wrapper` в `.controls-right`) реагирует только на **доверенный ввод** (`isTrusted = true`). Проверено вживую: ни `.click()`, ни нативный `button.click()`, ни полная синтетическая последовательность pointer-событий (`pointerdown` → `pointerup` → `click` с координатами) меню не открывают. Content-script физически не может синтезировать доверенное событие.
2. **Пункты качества появляются в DOM только при открытом меню.** Подменю качества (`li.item[data-value="1080p"|"720p"|…]`) рендерится лениво — лишь после открытия меню настроек и клика по пункту «Качество» (`li[data-testid="quality-settings"]`). Без открытого меню вариантов разрешения в DOM нет.
3. **Контраст:** сами пункты `li[data-value]` на синтетический `.click()` реагируют корректно (качество переключается), но добраться до них программно нельзя — мешает п.1.

Вывод: автоматизация через DOM-клики невозможна. Нужен другой канал управления качеством.

---

## 2. Рабочий механизм — подмена localStorage-ключа

VK-плеер сам сохраняет и читает предпочтительное качество в `localStorage`:

```
localStorage['vk_player_preferred_quality'] = {"videoId":"15541331700255","value":"1080p"}
```

Ключевые факты (установлены экспериментально на реальном плеере):

* **Плеер читает этот ключ при инициализации** и стартует видео в сохранённом качестве. Проверено: запись `value:"1080p"` + перезагрузка → видео стартует с `video.videoHeight === 1080` без единого клика.
* **Значение привязано к `videoId` конкретного видео.** Если `pref.videoId` не совпадает с текущим видео — плеер **игнорирует** запись и **стирает** её (старт в «Авто»). То есть просто записать качество с произвольным id нельзя.
* **`videoId` доступен из публичного свойства Svelte-компонента** — `document.querySelector('vk-video-player').store.videoId` (запасные пути: `…store` другого экземпляра, `…videoConfig.videos[0].unitedVideoId`).
* **Тайминг идеален:** в момент, когда плеер вызывает `getItem('vk_player_preferred_quality')`, элемент `vk-video-player` уже смонтирован и `store.videoId` уже установлен (подтверждено логом из init-script — плеер читает ключ дважды, оба раза videoId на месте).

Поэтому вместо записи в хранилище мы **перехватываем чтение** ключа и отдаём плееру корректный `videoId` + желаемое качество «на лету».

---

## 3. Архитектура технического решения

Решение разнесено по двум мирам исполнения, потому что нужные данные доступны в разных контекстах:

* **MAIN world** (`page_script.js`) — здесь доступны JS-свойства DOM-элементов страницы (включая `vk-video-player.store.videoId`) и здесь можно переопределить `Storage.prototype.getItem` так, чтобы это видел сам плеер. Content-script (isolated world) к свойствам элементов и к «настоящему» `localStorage` страницы доступа не имеет.
* **Isolated world** (`src/`, content-script) — здесь живут настройки расширения (`state.settings`), UI и логика. Отсюда нельзя напрямую влиять на плеер, поэтому настройка передаётся в MAIN world сообщением.

### А. Перехват чтения ключа в MAIN world (`page_script.js`)

`page_script.js` загружается в MAIN world (`manifest.json` → `content_scripts` с `"world": "MAIN"`). В нём:

1. Хранится текущая настройка качества:
   ```js
   let qualityPref = { enabled: false, value: 'auto' };
   ```
2. Переопределён `Storage.prototype.getItem`:
   ```js
   const originalGetItem = Storage.prototype.getItem;
   Storage.prototype.getItem = function (key) {
     if (key === 'vk_player_preferred_quality'
         && qualityPref.enabled && qualityPref.value && qualityPref.value !== 'auto') {
       const videoId = getActiveVkVideoId();
       if (videoId) return JSON.stringify({ videoId, value: qualityPref.value });
     }
     return originalGetItem.apply(this, arguments);
   };
   ```
   То есть плеер при чтении ключа получает синтезированное значение с **актуальным** videoId и нужным качеством. Реальной записи в хранилище не происходит — побочных эффектов для других вкладок/видео нет.
3. `getActiveVkVideoId()` определяет videoId инициализирующегося плеера:
   ```js
   function getActiveVkVideoId() {
     for (const p of document.querySelectorAll('vk-video-player')) {
       const vid = (p.store && p.store.videoId)
         || (p.videoConfig?.videos?.[0]?.unitedVideoId);
       if (vid) return String(vid);
     }
     return null;
   }
   ```

### Б. Передача настройки из расширения (isolated → MAIN)

Content-script сообщает page_script о текущей настройке через `window.postMessage`:

```js
window.postMessage({ type: 'LF_SET_QUALITY_PREF', enabled, value }, '*');
```

`page_script.js` слушает это сообщение в общем обработчике `window 'message'` (там же, где `LF_TOGGLE_LIKE_DOM` для лайков) и обновляет `qualityPref`. Если `enabled === false` или `value === 'auto'`, перехват не вмешивается — плеер получает оригинальное значение, и функцию можно полностью отключить.

### В. Когда отправляется настройка

`sendVideoQualityPref()` (в `src/players.js`) формирует и шлёт сообщение на основе `state.settings`:

* **При инициализации расширения** — `src/content.js`, сразу после загрузки настроек (`loadStateFromStorage`) и **до** первой проверки страницы. Это важно: настройка должна добраться до page_script раньше, чем плеер прочитает ключ.
* **При изменении настройки в сайдбаре** — `src/ui/sidebar.js`, в обработчиках чекбокса «Принудительное качество видео» и выпадающего списка качества (отправка инлайн, формат совпадает с `sendVideoQualityPref`).

---

## 4. Поток данных (end-to-end)

```
Пользователь включает настройку в сайдбаре (1080p)
        │
        ▼
src/ui/sidebar.js: сохранение в state + postMessage(LF_SET_QUALITY_PREF, enabled=true, value="1080p")
        │  (а при следующих загрузках — src/content.js при init вызывает sendVideoQualityPref())
        ▼
page_script.js (MAIN world): qualityPref = { enabled:true, value:"1080p" }
        │
        ▼
Открывается видео → vk-video-player инициализируется, читает localStorage:
        getItem('vk_player_preferred_quality')
        │
        ▼
Перехват: возвращаем { videoId: <vk-video-player.store.videoId>, value:"1080p" }
        │
        ▼
Плеер видит совпадение videoId → стартует видео в 1080p
```

---

## 5. Точки интеграции в коде

| Файл | Что добавлено |
| --- | --- |
| `page_script.js` | Константа `VK_QUALITY_KEY`, состояние `qualityPref`, `getActiveVkVideoId()`, переопределение `Storage.prototype.getItem`, обработка сообщения `LF_SET_QUALITY_PREF` |
| `src/players.js` | Хелпер `sendVideoQualityPref()` (экспортируется); удалены мёртвые функции старого подхода (`selectQualityOption`, `openQualitySubmenu`, `forceVideoQuality`, `setupVideoPlayerQuality`) |
| `src/content.js` | Импорт и вызов `sendVideoQualityPref()` при инициализации (рано, до проверки страницы) |
| `src/ui/sidebar.js` | Отправка `LF_SET_QUALITY_PREF` из обработчиков чекбокса и селекта качества; снят `display:none` с блока настройки (разморозка); список значений приведён к `144p…1080p` |
| `src/state.js` | Убран форс `state.settings.forceVideoQuality = false` (заморозка снята) |

Настройки в `state.settings`:
* `forceVideoQuality` (boolean) — включена ли функция;
* `videoQuality` (string) — целевое разрешение, значения совпадают с `data-value` плеера: `144p`, `240p`, `360p`, `480p`, `720p`, `1080p` (по умолчанию `1080p`).

---

## 6. Ограничения и поведение

* **Применяется к видео, открытым ПОСЛЕ установки настройки.** Плеер читает ключ только при инициализации, поэтому уже играющее видео не переключается на лету — нужное качество получают следующие открытые видео (или то же видео после перезагрузки страницы).
* **Несколько плееров на странице:** `getActiveVkVideoId()` берёт первый `vk-video-player` с доступным `store.videoId`. На практике плееры инициализируются по одному (по мере появления в зоне видимости), поэтому в момент чтения ключа активным обычно является нужный.
* **Недоступное разрешение:** если выбранного качества у конкретного видео нет (например, `1080p` у низкокачественного ролика), поведение определяет сам плеер (обычно ближайшее доступное / «Авто»).
* **Без побочных эффектов в хранилище:** перехват только подменяет ответ `getItem`, реального `setItem` расширение не делает — ручной выбор качества пользователем в плеере продолжает работать штатно.

---

## 7. Тестирование

* Юнит- и E2E-тесты расширения проходят (48 unit + 8 e2e) — переработка `src/players.js` ничего не сломала.
* Функциональная проверка выполнена вживую на реальном плеере (залогиненный аккаунт, блог `lightfoxmanga`, Playwright/CDP): включение настройки `1080p` в UI → перезагрузка страницы → видео стартует в `videoHeight === 1080` автоматически; при выключении перехвата `getItem` возвращает оригинал.
* Нюанс проверки локальной сборки: при изменении `page_script.js`/бандла распакованное расширение нужно перезагрузить (через service worker: `chrome.runtime.reload()`), затем перезагрузить страницу — иначе Chrome держит прежнюю версию скриптов.

Технический раздел: `docs/technical_notes.md` §39. Запись задачи: `docs/tasks.md` §6.
