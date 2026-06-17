(function (global) {
  'use strict';

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
      sync_btn_tooltip: 'Синхронизировать новые посты',
      settings_btn_tooltip: 'Настройки',
      btn_clear_all_new: 'Очистить все новые',
      btn_clear_new_short: 'Очистить всё',
      confirm_clear_all_new: 'Вы уверены, что хотите очистить весь список новых тайтлов и глав?',

      // Вкладки и категории (Сортировка)
      tab_favorite: 'Избранное',
      tab_all: 'Все',
      tab_watching: 'Смотрю',
      tab_new: 'Новые',
      tab_completed: 'Завершено',
      tab_dropped: 'Брошено',
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
      loading_db: 'Загрузка базы постов...',
      loading_page: 'Страница {0}',
      loading_once_notice: 'Это нужно сделать только один раз.',
      empty_db_notice: 'База пуста. Пожалуйста, запустите синхронизацию, нажав на кнопку со стрелками вверху.',
      empty_db_run_btn: 'Запустить',

      // Настройки: Общие секции
      settings_title_sync: 'Синхронизация',
      settings_title_tracking: 'Настройки отслеживания',
      settings_title_interface: 'Интерфейс',
      settings_title_tab_order: 'Порядок вкладок',

      settings_export_btn: 'Экспорт ZIP',
      settings_import_btn: 'Импорт ZIP',
      settings_full_sync_btn: 'Полная пересинхронизация',
      settings_cloud_sync_title: 'Облачная синхронизация',
      settings_cloud_sync_desc: 'Синхронизация настроек и прогресса с облаком в формате ZIP-архива. При открытии панели выполняется автоматическое обновление.',
      settings_select_cloud: 'Выберите облако',
      settings_yandex_disk: 'Яндекс.Диск',
      settings_other_webdav: 'Другой WebDAV',

      // WebDAV гиды
      webdav_guide_yandex_title: 'Как подключить Яндекс.Диск',
      webdav_guide_yandex_step1: 'Перейдите на страницу <a href="https://id.yandex.ru/security/app-passwords" target="_blank" class="lf-link">Яндекс ID → Пароли приложений</a>.',
      webdav_guide_yandex_step2: 'Создайте новый пароль приложения с типом <strong>«Файлы (Яндекс.Диск)»</strong>.',
      webdav_guide_yandex_step3: 'Введите ваше имя пользователя (логин без @yandex.ru) и сгенерированный пароль приложения в поля ниже.',
      webdav_guide_yandex_step4: 'Нажмите кнопку «Синхронизировать» для первой выгрузки данных.',

      webdav_guide_other_title: 'Как подключить Nextcloud или другой WebDAV',
      webdav_guide_other_step1: 'На сервере создайте <strong>код доступа для приложения</strong> — это не пароль от вашего аккаунта. В Nextcloud: «Настройки → Безопасность → Устройства и сессии → Создать новый код доступа приложения».',
      webdav_guide_other_step2: 'Скопируйте <strong>адрес WebDAV</strong> из настроек файлов. Для Nextcloud он выглядит так: <code>https://ваш-сервер/remote.php/dav/files/имя/</code>',
      webdav_guide_other_step3: 'Вставьте адрес, имя пользователя и сгенерированный код ниже. Код показывается один раз — сохраните его.',
      webdav_guide_other_step4: 'Нажмите кнопку «Синхронизировать» для первой выгрузки данных.',

      // Поля настроек
      settings_auto_sync_label: 'Автоматическая синхронизация',
      settings_auto_sync_desc: 'Автоматическое фоновое скачивание при открытии и выгрузка изменений в облако.',
      settings_webdav_url: 'Адрес WebDAV-сервера',
      settings_webdav_username: 'Имя пользователя',
      settings_webdav_username_yandex_placeholder: 'логин на Яндексе',
      settings_webdav_username_placeholder: 'user',
      settings_webdav_access_code: 'Код доступа',
      settings_webdav_code_desc_yandex: 'Сгенерированный пароль приложения Яндекс ID.',
      settings_webdav_code_desc_other: 'Сгенерированный на сервере код приложения, не пароль от аккаунта.',
      settings_webdav_code_placeholder: 'Вставьте код доступа',
      settings_webdav_sync_btn: 'Синхронизировать',
      settings_webdav_syncing_btn: 'Синхронизация...',
      settings_webdav_last_sync: 'Последняя синхронизация: {0}',
      settings_webdav_never_sync: 'никогда',

      settings_sync_likes_label: 'Синхронизация по лайкам',
      settings_sync_likes_desc: 'Считать лайкнутые посты на Boosty просмотренными главами.',
      settings_open_titles_label: 'Открывать тайтлы в текущей вкладке',
      settings_open_titles_desc: 'Если отключено, тайтлы будут открываться в новой вкладке браузера.',
      settings_open_chapters_feed_label: 'Переходить к главам в ленте тайтла (Бета)',
      settings_open_chapters_feed_desc: 'При клике на главу переходить на страницу тайтла и скроллить к посту в ленте вместо открытия отдельной страницы поста.',
      settings_beta_warning_text: 'Данная функция находится в бета-тестировании, работает не везде и может функционировать некорректно в некоторых тайтлах.',
      settings_save_player_label: 'Запоминать время видео и аудио',
      settings_save_player_desc: 'Автоматически восстанавливать прогресс воспроизведения медиаплееров Boosty.',
      settings_force_video_quality_label: 'Принудительное качество видео',
      settings_force_video_quality_desc: 'Запоминать и принудительно устанавливать качество видео в плеере.',
      settings_video_quality_label: 'Предпочитаемое качество',
      settings_auto_mark_label: 'Автоотметка при открытии',
      settings_auto_mark_desc: 'Автоматически помечать главу как просмотренную при переходе по ссылке.',

      settings_zoom_label: 'Масштаб боковой панели',
      settings_zoom_desc: 'Настройте удобный размер текста и элементов интерфейса.',
      settings_tab_order_desc: 'Настройте расположение вкладок категорий в боковой панели с помощью перетаскивания (Drag & Drop) за иконку или стрелок.',
      settings_drag_handle_tooltip: 'Перетащить',
      settings_tab_up_tooltip: 'Вверх',
      settings_tab_down_tooltip: 'Вниз',

      settings_about_btn: 'О расширении',
      settings_delete_data_btn: 'Удалить сохранённые данные',
      settings_delete_data_confirm_btn: 'Вы точно уверены? Нажмите для удаления',
      settings_cancel: 'Отмена',

      // Уведомления (Notifications)
      notify_auto_sync_on: 'Автоматическая синхронизация включена',
      notify_auto_sync_off: 'Автоматическая синхронизация отключена',
      notify_sync_likes_on: 'Синхронизация по лайкам включена',
      notify_sync_likes_off: 'Синхронизация по лайкам отключена',
      notify_auto_mark_on: 'Автоотметка включена',
      notify_auto_mark_off: 'Автоотметка отключена',
      notify_open_titles_current: 'Тайтлы открываются в текущей вкладке',
      notify_open_titles_new: 'Тайтлы открываются в новой вкладке',
      notify_chapters_feed_on: 'Включен переход к главам в ленте',
      notify_chapters_feed_off: 'Включено открытие отдельных страниц глав',
      notify_zoom_changed: 'Масштаб изменен на {0}%',
      notify_data_deleted: 'Все данные успешно удалены',
      notify_title_moved: 'Тайтлы перенесен в раздел «{0}»',
      notify_force_video_quality_on: 'Принудительное качество видео включено',
      notify_force_video_quality_off: 'Принудительное качество видео отключено',
      notify_video_quality_changed: 'Предпочитаемое качество изменено на {0}',

      // Детальный вид тайтла
      detail_back_btn: 'Назад к списку',
      detail_title_tag_tooltip: 'Открыть тег на Boosty',
      detail_category_undefined: 'Категория не определена',
      detail_tracking_status_label: 'Статус отслеживания',
      detail_status_favorite: '⭐ Избранное',
      detail_status_watching: '🟡 Смотрю',
      detail_status_completed: '🟢 Завершено',
      detail_status_dropped: '🔴 Брошено',
      detail_status_none: '⚪ Не отслеживаю',
      detail_notes_label: 'Блокнот (Заметки)',
      detail_notes_placeholder: 'Напишите здесь важные заметки... (сохраняется автоматически)',
      detail_chapters_count_label: 'Список глав ({0}/{1})',
      detail_chapters_sort_oldest: 'Старые вверху',
      detail_chapters_sort_newest: 'Новые вверху',

      // Статусы текстом (для уведомлений)
      status_favorite: 'Избранное',
      status_watching: 'Смотрю',
      status_completed: 'Завершено',
      status_dropped: 'Брошено',
      status_none: 'Не отслеживаю',

      // Тултипы статусов
      tooltip_completed: 'Просмотрено полностью',
      tooltip_watching: 'Есть непросмотренные главы',
      tooltip_dropped: 'Брошено',
      tooltip_none: 'Просмотр не начат',

      // Экран "О расширении"
      about_back_btn: 'Назад к настройкам',
      about_desc: 'Удобная библиотека для отслеживания прогресса озвучек и других постов на Boosty. Позволяет структурировать публикации по произведениям, отмечать прочитанные главы и сохранять личные заметки (временно адаптировано только под автора <a href="https://boosty.to/lightfoxmanga" target="_blank" class="lf-link">Light Fox</a>).',
      about_author: 'Автор и разработчик: ',
      about_license: 'Лицензия: ',
      about_privacy: 'Конфиденциальность: ',
      about_privacy_desc: 'Локально или WebDAV',
      about_disclaimer: 'Не является официальным расширением Boosty',
      about_github: 'GitHub Репозиторий',
      about_feedback: 'Связаться с автором / Предложить идею',
      about_support: 'Поддержать проект',
      about_support_boosty: 'Boosty (Подписка и Новости)',
      about_support_yoomoney: 'ЮMoney',
      about_support_donationalerts: 'DonationAlerts',
      about_support_ton: 'TON',
      about_support_usdt: 'USDT (TRC-20)',
      about_support_copied: 'Адрес скопирован! ✓',
      about_support_usdt_modal_title: 'Поддержка USDT (TRC-20)',
      about_support_usdt_modal_warning_title: 'Важная инструкция:',
      about_support_usdt_modal_desc: 'Переводите только на адрес в сети TRC-20 (TRON). Отправка через другие сети (ERC-20, BSC, Arbitrum) приведет к потере средств.',
      about_support_usdt_modal_verify_title: 'Проверка адреса:',
      about_support_usdt_modal_verify_desc: 'Начинается на <code>TGs</code>, содержит <code>XMh</code> в середине, заканчивается на <code>6cq</code>.',
      about_support_usdt_modal_address_label: 'Адрес USDT (TRC-20)',
      about_support_usdt_modal_copy_btn: 'Скопировать адрес',
      about_support_usdt_modal_double_click_tooltip: 'Двойной клик для копирования',
      about_support_usdt_modal_memo_not_required: 'memo не требуется',



      // Группа "Завершен том" в Смотрю
      group_volume_finished: 'Завершен том',
      group_fully_finished: 'Полностью озвучено',
      group_announcements: 'Объявления',
      group_new_chapters: 'Новые главы (в подписках)',
      group_new_titles: 'Новые тайтлы',
      group_new_chapters_short: 'Новые главы',

      // Названия категорий/тиров
      category_free: 'Бесплатные',
      category_announcements: 'Объявления',
      category_all: 'Все',

      notify_backup_read_error: 'Не удалось прочитать данные для бэкапа.',
      notify_export_success: 'Прогресс экспортирован успешно в ZIP!',
      notify_zip_generate_error: 'Не удалось сгенерировать ZIP-архив.',
      notify_export_error: 'Не удалось экспортировать прогресс.',
      notify_import_success: 'Прогресс успешно импортирован! Загружено каналов: {0}',
      notify_import_invalid_format: 'Неверный формат файла. Убедитесь, что выбрали правильный ZIP-архив.',
      notify_webdav_fill_fields: 'Заполните адрес сервера, имя пользователя и код доступа',
      notify_webdav_sync_success: 'Облачная синхронизация завершена!',
      notify_sync_success: 'Синхронизация завершена успешно!',
      notify_sync_error: 'Ошибка при синхронизации постов. Попробуйте еще раз.',
      notify_sync_posts_error: 'Ошибка при загрузке постов. Попробуйте еще раз.',

      status_webdav_auto_sync_success: 'Автосинхронизация выполнена',
      status_webdav_sync_success: 'Синхронизация выполнена',
      status_webdav_sync_error: 'Ошибка синхронизации',

      // Ошибки WebDAV-клиента
      error_webdav_no_url: 'Не указан адрес WebDAV-сервера',
      error_webdav_auth: 'Неверное имя пользователя или код доступа',
      error_webdav_propfind: 'Ошибка WebDAV: {0}',
      error_webdav_mkcol: 'Не удалось создать папку на WebDAV ({0})',
      error_webdav_download: 'Ошибка загрузки из облака ({0})',
      error_webdav_upload: 'Ошибка загрузки в облако ({0})',
      error_webdav_invalid_protocol: 'Адрес сервера должен начинаться с http:// или https://',
      error_webdav_module_not_loaded: 'Модуль синхронизации не загружен',
      error_webdav_no_username: 'Укажите имя пользователя',
      error_webdav_no_access_code: 'Укажите код доступа',
      error_webdav_no_background_response: 'Нет ответа от фонового скрипта',

      empty_search_results: 'Ничего не найдено в этой категории.',
      confirm_clear_all_new_short: 'Точно очистить?',
      post_liked_on_boosty: 'Этот пост лайкнут на Boosty',
      player_progress_tooltip: 'Прогресс воспроизведения',
      player_progress_watched: 'Просмотрено {0} из {1}',
      player_progress_stopped: 'Остановился на {0}',
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
      sync_btn_tooltip: 'Sync new posts',
      settings_btn_tooltip: 'Settings',
      btn_clear_all_new: 'Clear all new',
      btn_clear_new_short: 'Clear all',
      confirm_clear_all_new: 'Are you sure you want to clear the entire list of new titles and chapters?',

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
      loading_db: 'Loading posts database...',
      loading_page: 'Page {0}',
      loading_once_notice: 'This needs to be done only once.',
      empty_db_notice: 'The database is empty. Please run synchronization by clicking the arrows button above.',
      empty_db_run_btn: 'Run',

      // Settings: Main Sections
      settings_title_sync: 'Synchronization',
      settings_title_tracking: 'Tracking Settings',
      settings_title_interface: 'Interface',
      settings_title_tab_order: 'Tab Order',

      settings_export_btn: 'Export ZIP',
      settings_import_btn: 'Import ZIP',
      settings_full_sync_btn: 'Full Resync',
      settings_cloud_sync_title: 'Cloud Synchronization',
      settings_cloud_sync_desc: 'Synchronize settings and progress with the cloud in ZIP format. It will auto sync when the sidebar opens.',
      settings_select_cloud: 'Select Provider',
      settings_yandex_disk: 'Yandex.Disk',
      settings_other_webdav: 'Other WebDAV',

      // WebDAV guides
      webdav_guide_yandex_title: 'How to connect Yandex.Disk',
      webdav_guide_yandex_step1: 'Go to <a href="https://id.yandex.com/security/app-passwords" target="_blank" class="lf-link">Yandex ID → App passwords</a>.',
      webdav_guide_yandex_step2: 'Create a new app password of type <strong>"Files (Yandex.Disk)"</strong>.',
      webdav_guide_yandex_step3: 'Enter your username (login without @yandex.ru) and the generated app password in the fields below.',
      webdav_guide_yandex_step4: 'Click "Sync" to perform the first upload of your data.',

      webdav_guide_other_title: 'How to connect Nextcloud or other WebDAV',
      webdav_guide_other_step1: 'On your server, create an <strong>app access code</strong> — this is not your main account password. In Nextcloud: "Settings → Security → Devices & sessions → Create new app password".',
      webdav_guide_other_step2: 'Copy the <strong>WebDAV URL</strong> from the file settings. For Nextcloud, it looks like this: <code>https://your-server/remote.php/dav/files/username/</code>',
      webdav_guide_other_step3: 'Paste the URL, username, and generated code below. The code is shown only once, make sure to save it.',
      webdav_guide_other_step4: 'Click "Sync" to perform the first upload of your data.',

      // Settings fields
      settings_auto_sync_label: 'Auto Sync',
      settings_auto_sync_desc: 'Automatically download on open and upload changes to the cloud.',
      settings_webdav_url: 'WebDAV Server URL',
      settings_webdav_username: 'Username',
      settings_webdav_username_yandex_placeholder: 'username on Yandex',
      settings_webdav_username_placeholder: 'user',
      settings_webdav_access_code: 'Access Code',
      settings_webdav_code_desc_yandex: 'Generated app password from Yandex ID.',
      settings_webdav_code_desc_other: 'App token generated on the server, not your main password.',
      settings_webdav_code_placeholder: 'Paste access code',
      settings_webdav_sync_btn: 'Sync',
      settings_webdav_syncing_btn: 'Syncing...',
      settings_webdav_last_sync: 'Last sync: {0}',
      settings_webdav_never_sync: 'never',

      settings_sync_likes_label: 'Sync by Likes',
      settings_sync_likes_desc: 'Mark liked posts on Boosty as watched chapters in the extension.',
      settings_open_titles_label: 'Open titles in current tab',
      settings_open_titles_desc: 'If disabled, titles will open in a new browser tab.',
      settings_open_chapters_feed_label: 'Open chapters in title feed (Beta)',
      settings_open_chapters_feed_desc: 'When clicking a chapter, navigate to the title page and scroll to the post in the feed instead of opening the direct post page.',
      settings_beta_warning_text: 'This feature is in beta, does not work everywhere, and may function incorrectly in some titles.',
      settings_save_player_label: 'Remember audio & video time',
      settings_save_player_desc: 'Automatically restore playback progress in Boosty media players.',
      settings_force_video_quality_label: 'Force Video Quality',
      settings_force_video_quality_desc: 'Remember and force set video quality in the player.',
      settings_video_quality_label: 'Preferred Quality',
      settings_auto_mark_label: 'Auto-mark on open',
      settings_auto_mark_desc: 'Automatically mark a chapter as read when you navigate to its link.',

      settings_zoom_label: 'Sidebar Zoom',
      settings_zoom_desc: 'Set a comfortable size for text and interface elements.',
      settings_tab_order_desc: 'Adjust the order of category tabs in the sidebar by using drag & drop handles or arrows.',
      settings_drag_handle_tooltip: 'Drag and drop',
      settings_tab_up_tooltip: 'Move up',
      settings_tab_down_tooltip: 'Move down',

      settings_about_btn: 'About Extension',
      settings_delete_data_btn: 'Delete Saved Data',
      settings_delete_data_confirm_btn: 'Are you absolutely sure? Click to delete',
      settings_cancel: 'Cancel',

      // Notifications
      notify_auto_sync_on: 'Auto sync enabled',
      notify_auto_sync_off: 'Auto sync disabled',
      notify_sync_likes_on: 'Sync by likes enabled',
      notify_sync_likes_off: 'Sync by likes disabled',
      notify_auto_mark_on: 'Auto-mark enabled',
      notify_auto_mark_off: 'Auto-mark disabled',
      notify_open_titles_current: 'Titles open in current tab',
      notify_open_titles_new: 'Titles open in new tab',
      notify_chapters_feed_on: 'Enabled scroll-to-post in feed',
      notify_chapters_feed_off: 'Enabled opening direct chapter pages',
      notify_zoom_changed: 'Scale changed to {0}%',
      notify_data_deleted: 'All data has been successfully deleted',
      notify_title_moved: 'Title moved to "{0}"',
      notify_force_video_quality_on: 'Force video quality enabled',
      notify_force_video_quality_off: 'Force video quality disabled',
      notify_video_quality_changed: 'Preferred quality changed to {0}',

      // Detailed Title View
      detail_back_btn: 'Back to list',
      detail_title_tag_tooltip: 'Open tag on Boosty',
      detail_category_undefined: 'Category not defined',
      detail_tracking_status_label: 'Tracking Status',
      detail_status_favorite: '⭐ Favorites',
      detail_status_watching: '🟡 Watching',
      detail_status_completed: '🟢 Completed',
      detail_status_dropped: '🔴 Dropped',
      detail_status_none: '⚪ Not tracking',
      detail_notes_label: 'Notes',
      detail_notes_placeholder: 'Write important notes here... (saved automatically)',
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
      about_desc: 'A convenient library for tracking progress of voice acting and other posts on Boosty. It organizes publications by titles, tracks read chapters, and saves personal notes (temporarily adapted only for the author <a href="https://boosty.to/lightfoxmanga" target="_blank" class="lf-link">Light Fox</a>).',
      about_author: 'Author and Developer: ',
      about_license: 'License: ',
      about_privacy: 'Privacy: ',
      about_privacy_desc: 'Locally or WebDAV',
      about_disclaimer: 'Not an official Boosty extension',
      about_github: 'GitHub Repository',
      about_feedback: 'Contact Author / Suggest an Idea',
      about_support: 'Support Project',
      about_support_boosty: 'Boosty (Subscribe & News)',
      about_support_yoomoney: 'YooMoney',
      about_support_donationalerts: 'DonationAlerts',
      about_support_ton: 'TON',
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
      group_volume_finished: 'Volume finished',
      group_fully_finished: 'Fully finished',
      group_announcements: 'Announcements',
      group_new_chapters: 'New chapters (subscribed)',
      group_new_titles: 'New titles',
      group_new_chapters_short: 'New chapters',

      // Category names / tiers
      category_free: 'Free',
      category_announcements: 'Announcements',
      category_all: 'All',

      notify_backup_read_error: 'Failed to read backup data.',
      notify_export_success: 'Progress successfully exported to ZIP!',
      notify_zip_generate_error: 'Failed to generate ZIP archive.',
      notify_export_error: 'Failed to export progress.',
      notify_import_success: 'Progress successfully imported! Loaded channels: {0}',
      notify_import_invalid_format: 'Invalid file format. Make sure you selected the correct ZIP archive.',
      notify_webdav_fill_fields: 'Please fill in the server address, username, and access code',

      status_webdav_auto_sync_success: 'Auto sync completed',
      status_webdav_sync_success: 'Sync completed',
      status_webdav_sync_error: 'Sync error',
      notify_webdav_sync_success: 'Cloud synchronization completed!',
      notify_sync_success: 'Synchronization completed successfully!',
      notify_sync_error: 'Error synchronizing posts. Please try again.',
      notify_sync_posts_error: 'Error loading posts. Please try again.',

      // WebDAV client errors
      error_webdav_no_url: 'WebDAV server URL is not specified',
      error_webdav_auth: 'Incorrect username or access code',
      error_webdav_propfind: 'WebDAV Error: {0}',
      error_webdav_mkcol: 'Failed to create directory on WebDAV ({0})',
      error_webdav_download: 'Failed to download from cloud ({0})',
      error_webdav_upload: 'Failed to upload to cloud ({0})',
      error_webdav_invalid_protocol: 'Server URL must start with http:// or https://',
      error_webdav_module_not_loaded: 'Sync module is not loaded',
      error_webdav_no_username: 'Specify username',
      error_webdav_no_access_code: 'Specify access code',
      error_webdav_no_background_response: 'No response from background script',

      empty_search_results: 'Nothing found in this category.',
      confirm_clear_all_new_short: 'Are you sure?',
      post_liked_on_boosty: 'This post is liked on Boosty',
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
    'Новые главы (в подписках)': 'group_new_chapters',
    'Новые тайтлы': 'group_new_titles',
    'Новые главы': 'group_new_chapters_short',
    'Завершен том': 'group_volume_finished',
    'Полностью озвучено': 'group_fully_finished'
  };

  function tCategory(catName) {
    const key = categoryKeys[catName];
    return key ? t(key) : catName;
  }

  global.locales = locales;
  global.t = t;
  global.tCategory = tCategory;
  global.getCurrentLang = getCurrentLang;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
