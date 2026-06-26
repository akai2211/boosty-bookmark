# Чеклист публикации Boosty Bookmark

## Кодовая часть (уже исправлено)
- [x] `manifest.json` и `manifest.firefox.json` — описание на английском
- [x] `manifest.firefox.json` — `strict_min_version` поднят до `"128.0"`

---

## Chrome Web Store

### Перед отправкой ZIP
- [ ] Поднять версию в `manifest.json` до релизной (например `1.0.0`) — `build.cjs` синхронизирует `manifest.firefox.json` и `package.json` автоматически
- [ ] Собрать релизный архив: `node build.cjs`
- [ ] Убедиться, что в архиве нет `src/`, `docs/`, `tests/`, `tags_info.json`, `*.map`

### Developer Dashboard — при создании карточки
- [ ] **Описание магазина (английское)** — заполнить основное описание листинга на английском. Русский добавить как дополнительную локаль
- [ ] **Скриншоты** — минимум один, размер 1280×800 или 640×400 (PNG/JPG)
- [ ] **Промо-тайл** — 440×280 (необязателен, но повышает видимость в каталоге)

### Developer Dashboard — раздел Privacy practices
- [ ] **Обоснование `storage` / `unlimitedStorage`:**
  > Used to store post lists for Boosty blogs, which may contain thousands of posts and exceed the default 5 MB chrome.storage.local quota.
- [ ] **Обоснование `optional_host_permissions` (`https://*/*`, `http://*/*`):**
  > Required for WebDAV cloud sync: the user manually enters a custom server URL (e.g. Nextcloud, personal NAS). Since any host may be used, broad host access is requested as an optional permission — it is only granted when the user explicitly configures a WebDAV server.
- [ ] **Обоснование `page_script.js` в MAIN world:**
  > page_script.js runs in the MAIN world for two read-only purposes. (1) It intercepts Boosty's own fetch/XHR calls to /reaction endpoints to instantly reflect the user's like state in the extension sidebar (one-directional: like on the post → checkbox), without extra API calls. The extension never sends likes itself. (2) It overrides Storage.getItem for the vk_player_preferred_quality key to apply the user's preferred video quality in the embedded VK player. No page content is modified or exfiltrated.
- [ ] **Privacy practices / Single purpose statement:**
  > The extension has a single purpose: tracking reading and viewing progress on Boosty. All features (WebDAV sync, like sync, media player resume) directly support this goal.
- [ ] Установить галочку **«This extension does not collect or transmit user data outside the user's device»** (данные не передаются на сторонние серверы — WebDAV-запросы идут на сервер, указанный самим пользователем)

---

## Firefox Add-ons (AMO)

### Перед отправкой
- [ ] Собрать Firefox-архив: `node build.cjs --firefox`
- [ ] Подготовить **архив исходников** (обязателен для bundled-кода): ZIP с содержимым репозитория без `node_modules/` и `test-results/`. Инструкция сборки для ревьюеров:
  ```
  npm install
  npm run build:js
  ```
  Точка входа: `src/content.js` → собирается в `content.js` через esbuild.
- [ ] **Gecko ID** уже указан: `boosty-bookmark@akai.io` — убедиться, что он уникален и не используется в других расширениях

### AMO Dashboard
- [ ] Заполнить описание листинга (английское + русское)
- [ ] Добавить скриншоты (те же, что для Chrome)
- [ ] В поле **«Notes to reviewer»** кратко объяснить:
  - Зачем `world: "MAIN"` в `page_script.js` (перехват fetch/XHR для синхронизации лайков)
  - Зачем `optional_host_permissions` на все хосты (WebDAV с произвольным сервером)

---

## После публикации
- [ ] Обновить ссылки в `README.md` (заменить `YOUR_EXTENSION_ID_PLACEHOLDER` на реальный ID Chrome-расширения и ссылку AMO)
