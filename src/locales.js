const locales = {
    ru: {
      // Каркас и шапка
      title_bookmarks: 'Закладки',
      header_titles: 'Тайтлов: ',
      header_posts: ' | Постов: ',
      search_placeholder: 'Поиск тайтла...',
      search_clear_tooltip: 'Очистить поиск',
      sort_btn_tooltip: 'Сортировка тайтлов',
      close_btn_tooltip: 'Свернуть панель',
      sync_btn_tooltip: 'Проверить новые посты',
      settings_btn_tooltip: 'Настройки',
      btn_clear_all_new: 'Убрать',
      btn_clear_new_short: 'Очистить всё',

      // Вкладки и категории (Сортировка)
      tab_favorite: 'Избранное',
      tab_all: 'Все',
      tab_watching: 'Смотрю',
      tab_new: 'Новые',
      tab_completed: 'Завершено',
      tab_dropped: 'Заброшено',
      tab_archive: 'Архив',

      sort_name_asc: 'По названию: А → Я',
      sort_name_desc: 'По названию: Я → А',
      sort_new_desc: 'Сначала новые',
      sort_new_asc: 'Сначала старые',
      sort_chapters_desc: 'Больше глав',
      sort_chapters_asc: 'Меньше глав',
      sort_progress_desc: 'Прогресс выше',
      sort_progress_asc: 'Прогресс ниже',

      // Пустые и загрузочные состояния
      loading_db: 'Загружаем посты...',
      loading_page: 'Страница {0}',
      loading_once_notice: 'Это нужно сделать всего один раз.',
      empty_db_notice: 'Здесь пока пусто. Нажмите кнопку со стрелками вверху, чтобы загрузить посты.',
      empty_db_run_btn: 'Загрузить',

      // Настройки: Общие секции
      settings_title_sync: 'Резервные копии',
      settings_title_tracking: 'Настройки отслеживания',
      settings_title_interface: 'Интерфейс',
      settings_title_tab_order: 'Порядок вкладок',

      settings_export_btn: 'Сохранить в ZIP',
      settings_import_btn: 'Восстановить из ZIP',
      settings_full_sync_btn: 'Загрузить посты заново',
      settings_cloud_sync_title: 'Хранение в облаке',
      settings_cloud_sync_desc: 'Настройки и прогресс хранятся в облаке в виде ZIP-файла. При открытии панели данные обновляются автоматически.',
      settings_select_cloud: 'Выберите облако',
      settings_yandex_disk: 'Яндекс.Диск',
      settings_other_webdav: 'Другой WebDAV',

      // WebDAV гиды
      webdav_guide_yandex_title: 'Как подключить Яндекс.Диск',
      webdav_guide_yandex_step1: 'Откройте страницу <a href="https://id.yandex.ru/security/app-passwords" target="_blank" class="lf-link">Яндекс ID → Пароли приложений</a>.',
      webdav_guide_yandex_step2: 'Создайте новый пароль приложения с типом <strong>«Файлы (Яндекс.Диск)»</strong>.',
      webdav_guide_yandex_step3: 'Введите логин (без @yandex.ru) и созданный пароль приложения в поля ниже.',
      webdav_guide_yandex_step4: 'Нажмите «Обновить», чтобы загрузить данные в первый раз.',

      webdav_guide_other_title: 'Как подключить Nextcloud или другой WebDAV',
      webdav_guide_other_step1: 'На сервере создайте <strong>код доступа для приложения</strong> — это не пароль от вашего аккаунта. В Nextcloud: «Настройки → Безопасность → Устройства и сессии → Создать новый код доступа приложения».',
      webdav_guide_other_step2: 'Скопируйте <strong>адрес WebDAV</strong> из настроек файлов. Для Nextcloud он выглядит так: <code>https://ваш-сервер/remote.php/dav/files/имя/</code>',
      webdav_guide_other_step3: 'Вставьте адрес, имя пользователя и созданный код ниже. Код показывается только один раз — сохраните его.',
      webdav_guide_other_step4: 'Нажмите «Обновить», чтобы загрузить данные в первый раз.',

      // Поля настроек
      settings_auto_sync_label: 'Автообновление',
      settings_auto_sync_desc: 'Данные сами скачиваются при открытии панели и сохраняются в облако при изменениях.',
      settings_webdav_url: 'Адрес WebDAV-сервера',
      settings_webdav_url_hint: 'Для локального сервера (NAS) по HTTP укажите протокол явно: http://… По умолчанию подставляется https://',
      settings_webdav_username: 'Имя пользователя',
      settings_webdav_username_yandex_placeholder: 'логин на Яндексе',
      settings_webdav_username_placeholder: 'user',
      settings_webdav_access_code: 'Код доступа',
      settings_webdav_code_desc_yandex: 'Пароль приложения, созданный в Яндекс ID.',
      settings_webdav_code_desc_other: 'Код приложения, созданный на сервере, — не пароль от аккаунта.',
      settings_webdav_code_placeholder: 'Вставьте код доступа',
      settings_webdav_sync_btn: 'Обновить',
      settings_webdav_syncing_btn: 'Обновляем...',
      settings_webdav_last_sync: 'Последнее обновление: {0}',
      settings_webdav_never_sync: 'никогда',

      settings_sync_likes_label: 'Отмечать просмотр лайком',
      settings_sync_likes_desc: 'Лайкнутые на Boosty посты считаются просмотренными. Галочки при этом блокируются — отметить главу можно только лайком на самом посте. Выключите, чтобы галочки и лайки были независимы.',
      settings_sync_title_from_url_label: 'Открывать тайтл по тегу на Boosty',
      settings_sync_title_from_url_desc: 'Когда вы выбираете тег на странице Boosty, в панели сама открывается карточка тайтла.',
      settings_open_titles_label: 'Открывать тайтлы в текущей вкладке',
      settings_open_titles_desc: 'Если выключено, тайтлы откроются в новой вкладке браузера.',
      settings_open_chapters_feed_label: 'Переходить к главам в ленте тайтла',
      settings_open_chapters_feed_desc: 'При клике на главу открывается страница тайтла с прокруткой к нужному посту, а не отдельная страница поста.',
      settings_save_player_label: 'Запоминать время видео и аудио',
      settings_save_player_desc: 'Видео и аудио на Boosty продолжатся с того места, где вы остановились.',
      settings_group_all_viewed_label: 'Группа «Всё просмотрено»',
      settings_group_all_viewed_desc: 'Тайтлы, где просмотрены все главы, прячутся в отдельную свёрнутую группу в разделе «Смотрю». Как только выходит новая глава, тайтл снова появляется в общем списке.',
      settings_force_video_quality_label: 'Фиксированное качество видео (бета)',
      settings_force_video_quality_desc: 'Плеер всегда будет включать выбранное качество видео.',
      settings_video_quality_label: 'Желаемое качество',
      settings_auto_mark_label: 'Отмечать главу при открытии',
      settings_auto_mark_desc: 'Глава отмечается просмотренной, когда вы открываете её по ссылке.',

      settings_zoom_label: 'Масштаб боковой панели',
      settings_zoom_desc: 'Настройте удобный размер текста и элементов интерфейса.',
      settings_tab_order_desc: 'Меняйте порядок вкладок перетаскиванием за иконку или стрелками.',
      settings_drag_handle_tooltip: 'Перетащить',
      settings_tab_up_tooltip: 'Вверх',
      settings_tab_down_tooltip: 'Вниз',

      settings_about_btn: 'О расширении',
      settings_delete_data_btn: 'Удалить сохранённые данные',
      settings_delete_data_confirm_btn: 'Точно удалить? Нажмите ещё раз',
      settings_cancel: 'Отмена',

      // Уведомления (Notifications)
      notify_auto_sync_on: 'Автообновление включено',
      notify_auto_sync_off: 'Автообновление выключено',
      notify_sync_likes_on: 'Лайки засчитываются как просмотр',
      notify_sync_likes_off: 'Лайки больше не засчитываются',
      notify_sync_title_from_url_on: 'Открытие тайтла по тегу включено',
      notify_sync_title_from_url_off: 'Открытие тайтла по тегу выключено',
      notify_auto_mark_on: 'Отметка при открытии включена',
      notify_auto_mark_off: 'Отметка при открытии выключена',
      notify_open_titles_current: 'Тайтлы открываются в текущей вкладке',
      notify_open_titles_new: 'Тайтлы открываются в новой вкладке',
      notify_chapters_feed_on: 'Главы открываются в ленте тайтла',
      notify_chapters_feed_off: 'Главы открываются отдельными страницами',
      notify_group_all_viewed_on: 'Группа «Всё просмотрено» включена',
      notify_group_all_viewed_off: 'Группа «Всё просмотрено» отключена',
      notify_zoom_changed: 'Масштаб изменён на {0}%',
      notify_data_deleted: 'Все данные удалены',
      notify_title_moved: 'Тайтл перенесён в раздел «{0}»',
      notify_force_video_quality_on: 'Фиксированное качество видео включено',
      notify_force_video_quality_off: 'Фиксированное качество видео выключено',
      notify_video_quality_changed: 'Качество видео изменено на {0}',

      // Детальный вид тайтла
      detail_back_btn: 'Назад к списку',
      detail_title_tag_tooltip: 'Открыть тег на Boosty',
      detail_category_undefined: 'Без категории',
      detail_tracking_status_label: 'Статус отслеживания',
      detail_status_favorite: '⭐ Избранное',
      detail_status_watching: '🟡 Смотрю',
      detail_status_completed: '🟢 Завершено',
      detail_status_dropped: '🔴 Заброшено',
      detail_status_none: '⚪ Не отслеживаю',
      detail_notes_label: 'Заметки',
      detail_notes_placeholder: 'Здесь можно записать что угодно — сохранится само.',
      detail_chapters_count_label: 'Список глав ({0}/{1})',
      detail_chapters_sort_oldest: 'Старые вверху',
      detail_chapters_sort_newest: 'Новые вверху',

      // Статусы текстом (для уведомлений)
      status_favorite: 'Избранное',
      status_watching: 'Смотрю',
      status_completed: 'Завершено',
      status_dropped: 'Заброшено',
      status_none: 'Не отслеживаю',

      // Тултипы статусов
      tooltip_completed: 'Просмотрено полностью',
      tooltip_watching: 'Есть непросмотренные главы',
      tooltip_dropped: 'Заброшено',
      tooltip_none: 'Просмотр не начат',

      // Экран "О расширении"
      about_back_btn: 'Назад к настройкам',
      about_desc: 'Удобная библиотека, чтобы следить за озвучками и другими постами на Boosty. Помогает раскладывать публикации по произведениям, отмечать прочитанные главы и хранить личные заметки (пока работает только с автором <a href="https://boosty.to/lightfoxmanga" target="_blank" class="lf-link">Light Fox</a>).',
      about_author: 'Автор и разработчик: ',
      about_license: 'Лицензия: ',
      about_privacy: 'Конфиденциальность: ',
      about_privacy_desc: 'Локально или WebDAV',
      about_disclaimer: 'Не является официальным расширением Boosty',
      about_github: 'Репозиторий на GitHub',
      about_feedback: 'Связаться с автором / Предложить идею',
      about_support: 'Поддержать проект',
      about_support_boosty: 'Boosty (Подписка и Новости)',
      about_support_usdt: 'USDT (TRC-20)',
      about_support_copied: 'Адрес скопирован! ✓',
      about_support_usdt_modal_title: 'Поддержка USDT (TRC-20)',
      about_support_usdt_modal_warning_title: 'Важная инструкция:',
      about_support_usdt_modal_desc: 'Переводите только на адрес в сети TRC-20 (TRON). Отправка через другие сети (ERC-20, BSC, Arbitrum) приведёт к потере средств.',
      about_support_usdt_modal_verify_title: 'Проверка адреса:',
      about_support_usdt_modal_verify_desc: 'Начинается на <code>TGs</code>, содержит <code>XMh</code> в середине, заканчивается на <code>6cq</code>.',
      about_support_usdt_modal_address_label: 'Адрес USDT (TRC-20)',
      about_support_usdt_modal_copy_btn: 'Скопировать адрес',
      about_support_usdt_modal_double_click_tooltip: 'Двойной клик для копирования',
      about_support_usdt_modal_memo_not_required: 'memo не требуется',



      // Группы в «Смотрю»
      group_all_viewed: 'Всё просмотрено',
      group_volume_finished: 'Том закончен',
      group_fully_finished: 'Полностью озвучено',
      group_new_titles: 'Новые тайтлы',
      group_new_chapters_short: 'Новые главы',

      // Названия категорий/тиров
      category_free: 'Бесплатные',
      category_announcements: 'Объявления',
      category_all: 'Все',

      notify_backup_read_error: 'Не удалось прочитать данные для копии.',
      notify_export_success: 'Прогресс сохранён в ZIP!',
      notify_zip_generate_error: 'Не удалось создать ZIP-файл.',
      notify_export_error: 'Не удалось сохранить прогресс.',
      notify_import_success: 'Прогресс восстановлен! Загружено каналов: {0}',
      notify_import_merged: 'Прогресс объединён с текущим! Каналов: {0}',
      notify_import_invalid_format: 'Не тот файл. Проверьте, что выбрали нужный ZIP.',
      import_dialog_title: 'Восстановление прогресса',
      import_dialog_text: 'Как применить данные из файла?',
      import_dialog_merge_btn: 'Объединить с текущим',
      import_dialog_merge_hint: 'Безопасно: данные объединятся, новые версии заменят старые.',
      import_dialog_replace_btn: 'Заменить всё',
      import_dialog_replace_hint: 'Текущий прогресс заменится данными из файла.',
      import_dialog_cancel_btn: 'Отмена',
      notify_webdav_fill_fields: 'Заполните адрес сервера, имя пользователя и код доступа',
      notify_webdav_sync_success: 'Данные обновлены в облаке!',
      notify_sync_success: 'Посты обновлены!',
      notify_sync_error: 'Не удалось обновить посты. Попробуйте ещё раз.',
      notify_sync_posts_error: 'Не удалось загрузить посты. Попробуйте ещё раз.',

      status_webdav_auto_sync_success: 'Автообновление выполнено',
      status_webdav_sync_success: 'Обновление выполнено',
      status_webdav_sync_error: 'Ошибка обновления',

      // Ошибки WebDAV-клиента
      error_webdav_no_url: 'Не указан адрес WebDAV-сервера',
      error_webdav_auth: 'Неверное имя пользователя или код доступа',
      error_webdav_propfind: 'Ошибка WebDAV: {0}',
      error_webdav_mkcol: 'Не удалось создать папку на WebDAV ({0})',
      error_webdav_download: 'Не удалось скачать из облака ({0})',
      error_webdav_upload: 'Не удалось отправить в облако ({0})',
      error_webdav_conflict: 'Облако изменилось во время обновления, объединяю данные заново…',
      error_webdav_invalid_protocol: 'Адрес сервера должен начинаться с http:// или https://',
      error_webdav_module_not_loaded: 'Компонент обновления не загрузился',
      error_webdav_no_username: 'Укажите имя пользователя',
      error_webdav_no_access_code: 'Укажите код доступа',
      error_webdav_no_background_response: 'Фоновый процесс не ответил',
      error_webdav_no_permission: 'Не получено разрешение на доступ к WebDAV-серверу',
      notify_webdav_permission_page_opened: 'Открыто окно для выдачи доступа к серверу. Разрешите доступ и повторите синхронизацию.',

      empty_search_results: 'Ничего не найдено в этой категории.',
      confirm_clear_all_new_short: 'Точно очистить?',
      post_liked_on_boosty: 'Этот пост лайкнут на Boosty',
      post_mark_via_like: 'Чтобы отметить — поставьте лайк на этом посте на Boosty',
      player_progress_tooltip: 'Сколько просмотрено',
      player_progress_watched: 'Просмотрено {0} из {1}',
      player_progress_stopped: 'Остановились на {0}',
      untitled_post: 'Без названия',
      month_0: 'янв',
      month_1: 'фев',
      month_2: 'мар',
      month_3: 'апр',
      month_4: 'май',
      month_5: 'июн',
      month_6: 'июл',
      month_7: 'авг',
      month_8: 'сен',
      month_9: 'окт',
      month_10: 'ноя',
      month_11: 'дек'
    },
    en: {
      // Frame & Header
      title_bookmarks: 'Bookmarks',
      header_titles: 'Titles: ',
      header_posts: ' | Posts: ',
      search_placeholder: 'Search title...',
      search_clear_tooltip: 'Clear search',
      sort_btn_tooltip: 'Sort titles',
      close_btn_tooltip: 'Collapse panel',
      sync_btn_tooltip: 'Check for new posts',
      settings_btn_tooltip: 'Settings',
      btn_clear_all_new: 'Remove',
      btn_clear_new_short: 'Clear all',

      // Tabs & Categories (Sorting)
      tab_favorite: 'Favorites',
      tab_all: 'All',
      tab_watching: 'Watching',
      tab_new: 'New',
      tab_completed: 'Completed',
      tab_dropped: 'Dropped',
      tab_archive: 'Archive',

      sort_name_asc: 'By name: A → Z',
      sort_name_desc: 'By name: Z → A',
      sort_new_desc: 'Newest first',
      sort_new_asc: 'Oldest first',
      sort_chapters_desc: 'Most chapters',
      sort_chapters_asc: 'Least chapters',
      sort_progress_desc: 'Highest progress',
      sort_progress_asc: 'Lowest progress',

      // Empty & Loading states
      loading_db: 'Loading posts...',
      loading_page: 'Page {0}',
      loading_once_notice: 'This only needs to be done once.',
      empty_db_notice: 'It\'s empty here for now. Click the arrows button at the top to load your posts.',
      empty_db_run_btn: 'Load',

      // Settings: Main Sections
      settings_title_sync: 'Backup',
      settings_title_tracking: 'Tracking Settings',
      settings_title_interface: 'Interface',
      settings_title_tab_order: 'Tab Order',

      settings_export_btn: 'Save to ZIP',
      settings_import_btn: 'Restore from ZIP',
      settings_full_sync_btn: 'Reload all posts',
      settings_cloud_sync_title: 'Cloud storage',
      settings_cloud_sync_desc: 'Your settings and progress are kept in the cloud as a ZIP file. Data updates automatically when you open the panel.',
      settings_select_cloud: 'Choose a cloud',
      settings_yandex_disk: 'Yandex.Disk',
      settings_other_webdav: 'Other WebDAV',

      // WebDAV guides
      webdav_guide_yandex_title: 'How to connect Yandex.Disk',
      webdav_guide_yandex_step1: 'Open <a href="https://id.yandex.com/security/app-passwords" target="_blank" class="lf-link">Yandex ID → App passwords</a>.',
      webdav_guide_yandex_step2: 'Create a new app password of type <strong>"Files (Yandex.Disk)"</strong>.',
      webdav_guide_yandex_step3: 'Enter your login (without @yandex.ru) and the app password you created in the fields below.',
      webdav_guide_yandex_step4: 'Click "Update" to upload your data for the first time.',

      webdav_guide_other_title: 'How to connect Nextcloud or other WebDAV',
      webdav_guide_other_step1: 'On your server, create an <strong>app access code</strong> — this is not your main account password. In Nextcloud: "Settings → Security → Devices & sessions → Create new app password".',
      webdav_guide_other_step2: 'Copy the <strong>WebDAV URL</strong> from the file settings. For Nextcloud, it looks like this: <code>https://your-server/remote.php/dav/files/username/</code>',
      webdav_guide_other_step3: 'Paste the address, username, and the code you created below. The code is shown only once — be sure to save it.',
      webdav_guide_other_step4: 'Click "Update" to upload your data for the first time.',

      // Settings fields
      settings_auto_sync_label: 'Auto-update',
      settings_auto_sync_desc: 'Your data downloads when you open the panel and saves to the cloud when it changes.',
      settings_webdav_url: 'WebDAV Server URL',
      settings_webdav_url_hint: 'For a local server (NAS) over HTTP, specify the protocol explicitly: http://… Otherwise https:// is assumed',
      settings_webdav_username: 'Username',
      settings_webdav_username_yandex_placeholder: 'username on Yandex',
      settings_webdav_username_placeholder: 'user',
      settings_webdav_access_code: 'Access Code',
      settings_webdav_code_desc_yandex: 'App password created in Yandex ID.',
      settings_webdav_code_desc_other: 'App code created on the server — not your account password.',
      settings_webdav_code_placeholder: 'Paste access code',
      settings_webdav_sync_btn: 'Update',
      settings_webdav_syncing_btn: 'Updating...',
      settings_webdav_last_sync: 'Last update: {0}',
      settings_webdav_never_sync: 'never',

      settings_sync_likes_label: 'Mark watched by liking',
      settings_sync_likes_desc: 'Posts you liked on Boosty count as watched. Checkboxes become read-only — mark only by liking the post itself. Turn off to keep checkboxes and likes independent.',
      settings_sync_title_from_url_label: 'Open title by tag on Boosty',
      settings_sync_title_from_url_desc: 'When you choose a tag on a Boosty page, the title card opens automatically in the panel.',
      settings_open_titles_label: 'Open titles in current tab',
      settings_open_titles_desc: 'If turned off, titles will open in a new browser tab.',
      settings_open_chapters_feed_label: 'Open chapters in title feed',
      settings_open_chapters_feed_desc: 'Clicking a chapter opens the title page and scrolls to the post, instead of opening a separate post page.',
      settings_save_player_label: 'Remember audio & video time',
      settings_save_player_desc: 'Video and audio on Boosty resume from where you left off.',
      settings_group_all_viewed_label: '"All chapters viewed" group',
      settings_group_all_viewed_desc: 'Titles where you\'ve watched every chapter are tucked into a separate collapsed group in the "Watching" tab. As soon as a new chapter comes out, the title shows up in the main list again.',
      settings_force_video_quality_label: 'Fixed video quality (beta)',
      settings_force_video_quality_desc: 'The player will always use the quality you choose.',
      settings_video_quality_label: 'Preferred quality',
      settings_auto_mark_label: 'Mark on open',
      settings_auto_mark_desc: 'A chapter is marked as watched when you open it via a link.',

      settings_zoom_label: 'Sidebar Zoom',
      settings_zoom_desc: 'Set a comfortable size for text and interface elements.',
      settings_tab_order_desc: 'Reorder the tabs by dragging the handle or using the arrows.',
      settings_drag_handle_tooltip: 'Drag and drop',
      settings_tab_up_tooltip: 'Move up',
      settings_tab_down_tooltip: 'Move down',

      settings_about_btn: 'About Extension',
      settings_delete_data_btn: 'Delete Saved Data',
      settings_delete_data_confirm_btn: 'Really delete? Click again',
      settings_cancel: 'Cancel',

      // Notifications
      notify_auto_sync_on: 'Auto-update enabled',
      notify_auto_sync_off: 'Auto-update disabled',
      notify_sync_likes_on: 'Likes now count as watched',
      notify_sync_likes_off: 'Likes no longer count as watched',
      notify_sync_title_from_url_on: 'Open title by tag enabled',
      notify_sync_title_from_url_off: 'Open title by tag disabled',
      notify_auto_mark_on: 'Mark on open enabled',
      notify_auto_mark_off: 'Mark on open disabled',
      notify_open_titles_current: 'Titles open in current tab',
      notify_open_titles_new: 'Titles open in new tab',
      notify_chapters_feed_on: 'Chapters open in the title feed',
      notify_chapters_feed_off: 'Chapters open as separate pages',
      notify_group_all_viewed_on: '"All chapters viewed" group enabled',
      notify_group_all_viewed_off: '"All chapters viewed" group disabled',
      notify_zoom_changed: 'Zoom changed to {0}%',
      notify_data_deleted: 'All data deleted',
      notify_title_moved: 'Title moved to "{0}"',
      notify_force_video_quality_on: 'Fixed video quality enabled',
      notify_force_video_quality_off: 'Fixed video quality disabled',
      notify_video_quality_changed: 'Video quality changed to {0}',

      // Detailed Title View
      detail_back_btn: 'Back to list',
      detail_title_tag_tooltip: 'Open tag on Boosty',
      detail_category_undefined: 'No category',
      detail_tracking_status_label: 'Tracking Status',
      detail_status_favorite: '⭐ Favorites',
      detail_status_watching: '🟡 Watching',
      detail_status_completed: '🟢 Completed',
      detail_status_dropped: '🔴 Dropped',
      detail_status_none: '⚪ Not tracking',
      detail_notes_label: 'Notes',
      detail_notes_placeholder: 'Jot down anything here — it saves automatically.',
      detail_chapters_count_label: 'Chapters List ({0}/{1})',
      detail_chapters_sort_oldest: 'Oldest first',
      detail_chapters_sort_newest: 'Newest first',

      // Status text (for notifications)
      status_favorite: 'Favorites',
      status_watching: 'Watching',
      status_completed: 'Completed',
      status_dropped: 'Dropped',
      status_none: 'Not tracking',

      // Status tooltips
      tooltip_completed: 'Fully read',
      tooltip_watching: 'Has unread chapters',
      tooltip_dropped: 'Dropped',
      tooltip_none: 'Not started',

      // "About" Screen
      about_back_btn: 'Back to settings',
      about_desc: 'A handy library to keep track of voice-overs and other posts on Boosty. It sorts publications by title, marks the chapters you\'ve read, and keeps your personal notes (for now it works only with the author <a href="https://boosty.to/lightfoxmanga" target="_blank" class="lf-link">Light Fox</a>).',
      about_author: 'Author and Developer: ',
      about_license: 'License: ',
      about_privacy: 'Privacy: ',
      about_privacy_desc: 'Locally or WebDAV',
      about_disclaimer: 'Not an official Boosty extension',
      about_github: 'GitHub Repository',
      about_feedback: 'Contact Author / Suggest an Idea',
      about_support: 'Support Project',
      about_support_boosty: 'Boosty (Subscribe & News)',
      about_support_usdt: 'USDT (TRC-20)',
      about_support_copied: 'Address copied! ✓',
      about_support_usdt_modal_title: 'USDT (TRC-20) Support',
      about_support_usdt_modal_warning_title: 'Important Instruction:',
      about_support_usdt_modal_desc: 'Send ONLY to the address in the TRC-20 (TRON) network. Sending via other networks (ERC-20, BSC, Arbitrum) will result in loss of funds.',
      about_support_usdt_modal_verify_title: 'Address Verification:',
      about_support_usdt_modal_verify_desc: 'Starts with <code>TGs</code>, contains <code>XMh</code> in the middle, ends with <code>6cq</code>.',
      about_support_usdt_modal_address_label: 'USDT (TRC-20) Address',
      about_support_usdt_modal_copy_btn: 'Copy Address',
      about_support_usdt_modal_double_click_tooltip: 'Double click to copy',
      about_support_usdt_modal_memo_not_required: 'memo is not required',



      // Group "Volume finished" in Watching
      group_all_viewed: 'All chapters viewed',
      group_volume_finished: 'Volume finished',
      group_fully_finished: 'Fully finished',
      group_new_titles: 'New titles',
      group_new_chapters_short: 'New chapters',

      // Category names / tiers
      category_free: 'Free',
      category_announcements: 'Announcements',
      category_all: 'All',

      notify_backup_read_error: 'Failed to read backup data.',
      notify_export_success: 'Progress saved to ZIP!',
      notify_zip_generate_error: 'Failed to create the ZIP file.',
      notify_export_error: 'Failed to save progress.',
      notify_import_success: 'Progress restored! Channels loaded: {0}',
      notify_import_merged: 'Progress merged with current! Channels: {0}',
      notify_import_invalid_format: 'Wrong file. Make sure you picked the right ZIP.',
      import_dialog_title: 'Restore progress',
      import_dialog_text: 'How should the file data be applied?',
      import_dialog_merge_btn: 'Merge with current',
      import_dialog_merge_hint: 'Safe: data is merged, newer versions replace older ones.',
      import_dialog_replace_btn: 'Replace all',
      import_dialog_replace_hint: 'Your current progress will be replaced with the file data.',
      import_dialog_cancel_btn: 'Cancel',
      notify_webdav_fill_fields: 'Please fill in the server address, username, and access code',

      status_webdav_auto_sync_success: 'Auto-update done',
      status_webdav_sync_success: 'Update done',
      status_webdav_sync_error: 'Update error',
      notify_webdav_sync_success: 'Cloud data updated!',
      notify_sync_success: 'Posts updated!',
      notify_sync_error: 'Couldn\'t update posts. Please try again.',
      notify_sync_posts_error: 'Couldn\'t load posts. Please try again.',

      // WebDAV client errors
      error_webdav_no_url: 'WebDAV server URL is not specified',
      error_webdav_auth: 'Incorrect username or access code',
      error_webdav_propfind: 'WebDAV Error: {0}',
      error_webdav_mkcol: 'Failed to create directory on WebDAV ({0})',
      error_webdav_download: 'Failed to download from cloud ({0})',
      error_webdav_upload: 'Failed to upload to cloud ({0})',
      error_webdav_conflict: 'Cloud changed during update, merging again…',
      error_webdav_invalid_protocol: 'Server URL must start with http:// or https://',
      error_webdav_module_not_loaded: 'Update component failed to load',
      error_webdav_no_username: 'Specify username',
      error_webdav_no_access_code: 'Specify access code',
      error_webdav_no_background_response: 'The background process didn\'t respond',
      error_webdav_no_permission: 'Permission to access the WebDAV server was not granted',
      notify_webdav_permission_page_opened: 'A window has been opened to grant server access. Allow access and retry the sync.',

      empty_search_results: 'Nothing found in this category.',
      confirm_clear_all_new_short: 'Are you sure?',
      post_liked_on_boosty: 'This post is liked on Boosty',
      post_mark_via_like: 'To mark it, like this post on Boosty',
      player_progress_tooltip: 'Playback progress',
      player_progress_watched: 'Watched {0} of {1}',
      player_progress_stopped: 'Stopped at {0}',
      untitled_post: 'Untitled',
      month_0: 'Jan',
      month_1: 'Feb',
      month_2: 'Mar',
      month_3: 'Apr',
      month_4: 'May',
      month_5: 'Jun',
      month_6: 'Jul',
      month_7: 'Aug',
      month_8: 'Sep',
      month_9: 'Oct',
      month_10: 'Nov',
      month_11: 'Dec'
    }
  };

  function getCurrentLang() {
    if (typeof document !== 'undefined') {
      if (typeof document.cookie === 'string') {
        const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
        if (match) {
          const locale = match[1].toLowerCase();
          if (locale.startsWith('en')) return 'en';
          if (locale.startsWith('ru')) return 'ru';
        }
      }
      if (document.documentElement && document.documentElement.lang) {
        return document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'ru';
      }
    }
    return 'ru';
  }

  function t(key, ...args) {
    const lang = getCurrentLang();
    let text = locales[lang]?.[key] || locales['ru']?.[key] || key;
    if (args.length > 0) {
      args.forEach((arg, idx) => {
        text = text.replace(`{${idx}}`, arg);
      });
    }
    return text;
  }

  const categoryKeys = {
    'Бесплатные': 'category_free',
    'Объявления': 'category_announcements',
    'Все': 'category_all',
    'Категория не определена': 'detail_category_undefined',
    'Новые тайтлы': 'group_new_titles',
    'Новые главы': 'group_new_chapters_short',
    'Просмотрены все главы': 'group_all_viewed',
    'Завершен том': 'group_volume_finished',
    'Полностью озвучено': 'group_fully_finished'
  };

  function tCategory(catName) {
    const key = categoryKeys[catName];
    return key ? t(key) : catName;
  }

  export { locales, t, tCategory, getCurrentLang };
