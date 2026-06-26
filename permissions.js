/**
 * Страница выдачи host-permission для произвольного WebDAV-сервера.
 * Открывается из background компактным popup-окном (chrome.windows.create,
 * фолбэк — вкладка) при ручном синке, если права на origin ещё нет.
 * chrome.permissions.request доступен здесь (контекст страницы расширения) и
 * срабатывает по клику (user gesture) — из content-скрипта это сделать нельзя.
 * После выдачи окно само закрывается. См. background.js
 * (OPEN_WEBDAV_PERMISSION_PAGE) и src/sync.js.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const origin = params.get('origin') || '';
  const lang = (params.get('lang') || 'ru').toLowerCase().startsWith('en') ? 'en' : 'ru';

  const STRINGS = {
    ru: {
      pageTitle: 'Доступ к WebDAV-серверу',
      desc: 'Расширению нужен доступ к вашему серверу, чтобы хранить там копию данных:',
      grant: 'Выдать доступ',
      noOrigin: 'Адрес сервера не указан. Откройте настройки расширения и попробуйте снова.',
      granted: 'Доступ выдан. Окно закроется само — вернитесь на Boosty и снова нажмите «Обновить».',
      denied: 'Доступ не выдан. Нажмите «Выдать доступ» и подтвердите запрос в браузере.',
      error: 'Не удалось запросить доступ: '
    },
    en: {
      pageTitle: 'WebDAV server access',
      desc: 'The extension needs access to your server to store a copy of your data there:',
      grant: 'Grant access',
      noOrigin: 'The server address is missing. Open the extension settings and try again.',
      granted: 'Access granted. This window will close automatically — return to Boosty and click “Update” again.',
      denied: 'Access was not granted. Click “Grant access” and confirm the browser prompt.',
      error: 'Failed to request access: '
    }
  };

  const s = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = 'Boosty Bookmark — ' + s.pageTitle;

  const titleEl = document.getElementById('title');
  const descEl = document.getElementById('desc');
  const hostEl = document.getElementById('host');
  const btn = document.getElementById('grant-btn');
  const statusEl = document.getElementById('status');

  titleEl.textContent = s.pageTitle;
  descEl.textContent = s.desc;
  btn.textContent = s.grant;
  hostEl.textContent = origin.replace(/\/\*$/, '') || '—';

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  if (!origin) {
    btn.disabled = true;
    setStatus(s.noOrigin, 'err');
    return;
  }

  btn.addEventListener('click', () => {
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      if (chrome.runtime.lastError) {
        setStatus(s.error + chrome.runtime.lastError.message, 'err');
        return;
      }
      if (granted) {
        btn.disabled = true;
        setStatus(s.granted, 'ok');
        setTimeout(() => window.close(), 1500);
      } else {
        setStatus(s.denied, 'err');
      }
    });
  });
})();
