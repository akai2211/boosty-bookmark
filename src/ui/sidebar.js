/* ui/sidebar.js — Создание и рендеринг боковой панели: каркас, список тайтлов,
 * детальный вид, настройки, экран «О расширении», уведомления и обработчики UI.
 * Чистые HTML-шаблоны импортируются из ./templates.js (этап 6). */

import { t, tCategory } from '../locales.js';
import {
  TAGS_BLACKLIST,
  TAB_NAMES,
  BOOKMARK_SVG_PATH,
  escapeHtml,
  getUsdtAddress,
  formatDate,
  formatSeconds,
  formatSyncDate
} from '../utils.js';
import {
  state,
  webdavConfig,
  ensureUserData,
  setPostReadState,
  saveStateToStorage,
  exportUserData,
  importBackupFile,
  saveWebDavConfig
} from '../state.js';
import {
  getWebDavOrigin,
  requestWebDavPermission,
  triggerAutoWebDavSync,
  performWebDavSync,
  saveWebDavSettingsFromForm,
  performIncrementalSync,
  performFullSync,
  sendBoostyReaction,
  removeBoostyReaction
} from '../sync.js';
import { getGroupedTitles } from '../grouping.js';
import {
  triggerButtonIcon,
  sidebarLoadingTemplate,
  sidebarShellTemplate,
  usdtModalTemplate,
  aboutContentTemplate,
  getStatusTooltip
} from './templates.js';

// Внешние зависимости, остающиеся в content.js (прогресс плеера, dev-эффекты,
// dev-настройки). Внедряются через setSidebarDeps() — разрывает цикл sidebar ↔ content.js.
// Dev-зависимости (applyDevSettingsEffects, devSettings) проводятся только под if (DEV).
let getPlayerProgressForPost = () => null;
let applyDevSettingsEffects = () => {};
let devSettings = { enabled: false, cutoffDate: '', hideAboutAuthor: true, alwaysShowReactions: true };

let _headerResizeObserver = null;

// Диалог выбора режима импорта: возвращает 'merge' | 'replace' | null (отмена).
function showImportChoiceDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'lf-import-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
      <div class="lf-import-dialog" style="background:#1e1e22;color:#eee;border:1px solid #3a3a42;border-radius:10px;max-width:340px;width:90%;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.5);font-size:13px;">
        <h3 style="margin:0 0 6px;font-size:15px;">${t('import_dialog_title')}</h3>
        <p style="margin:0 0 14px;color:#aaa;">${t('import_dialog_text')}</p>
        <button data-mode="merge" class="lf-btn-secondary" style="width:100%;margin:0 0 8px;padding:8px 10px;text-align:left;line-height:1.3;">
          <strong>${t('import_dialog_merge_btn')}</strong><br><span style="color:#9a9aa2;font-size:11px;">${t('import_dialog_merge_hint')}</span>
        </button>
        <button data-mode="replace" class="lf-btn-secondary" style="width:100%;margin:0 0 12px;padding:8px 10px;text-align:left;line-height:1.3;">
          <strong>${t('import_dialog_replace_btn')}</strong><br><span style="color:#9a9aa2;font-size:11px;">${t('import_dialog_replace_hint')}</span>
        </button>
        <button data-mode="" class="lf-btn-secondary" style="width:100%;margin:0;padding:6px 10px;opacity:.8;">${t('import_dialog_cancel_btn')}</button>
      </div>
    `;

    const finish = (mode) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(mode || null);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { finish(null); return; }
      const btn = e.target.closest('button[data-mode]');
      if (btn) finish(btn.getAttribute('data-mode'));
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}

function updateHeaderTop() {
  const topMenu = document.getElementById('TopMenu');
  const h = topMenu ? topMenu.getBoundingClientRect().bottom : 70;
  document.documentElement.style.setProperty('--lf-header-h', h + 'px');
}

function cleanupHeaderObserver() {
  if (_headerResizeObserver) {
    _headerResizeObserver.disconnect();
    _headerResizeObserver = null;
  }
}

function setSidebarDeps(d) {
  if (d.getPlayerProgressForPost) getPlayerProgressForPost = d.getPlayerProgressForPost;
  if (d.applyDevSettingsEffects) applyDevSettingsEffects = d.applyDevSettingsEffects;
  if (d.devSettings) devSettings = d.devSettings;
}

  // Создание плавающей кнопки-триггера
  function createTriggerButton() {
    if (document.getElementById('lf-trigger-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'lf-trigger-btn';
    btn.title = t('title_bookmarks');
    
    // Иконка закладки с молнией (без внешнего оранжевого квадрата, только сама закладка)
    btn.innerHTML = triggerButtonIcon();
    
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      state.settings.sidebarOpen = !state.settings.sidebarOpen;
      const sidebar = document.getElementById('lf-sidebar');
      if (sidebar) {
        if (state.settings.sidebarOpen) {
          sidebar.classList.add('lf-open');
          detectAndApplyTheme();
          triggerAutoWebDavSync();
        } else {
          sidebar.classList.remove('lf-open');
        }
      }
      saveStateToStorage();
    });
    
    document.body.appendChild(btn);
  }

  // Создание контейнера боковой панели
  function createSidebar() {
    if (document.getElementById('lf-sidebar')) return;
    
    const sidebar = document.createElement('div');
    sidebar.id = 'lf-sidebar';
    sidebar.className = 'lf-dark'; // По умолчанию темная
    
    if (state.settings.sidebarOpen) {
      sidebar.classList.add('lf-open');
    }
    
    // Применяем масштаб из настроек через CSS-переменную
    if (state.settings.zoom) {
      sidebar.style.setProperty('--lf-zoom', state.settings.zoom);
    }
    
    // Предотвращаем закрытие панели при кликах внутри неё, но закрываем дропдаун при клике мимо него
    sidebar.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!event.target.closest('.lf-dropdown')) {
        const dropdown = document.getElementById('lf-archive-dropdown');
        if (dropdown) {
          dropdown.classList.remove('lf-show');
        }
        const sortDropdown = document.getElementById('lf-sort-dropdown');
        if (sortDropdown) {
          sortDropdown.classList.remove('lf-show');
        }
      }
    });
    
    document.body.appendChild(sidebar);
    updateHeaderTop();
    if (!_headerResizeObserver) {
      const topMenu = document.getElementById('TopMenu');
      if (topMenu) {
        _headerResizeObserver = new ResizeObserver(updateHeaderTop);
        _headerResizeObserver.observe(topMenu);
      }
    }
    detectAndApplyTheme();
  }

  // Определение и применение текущей темы Boosty
  function detectAndApplyTheme() {
    const sidebar = document.getElementById('lf-sidebar');
    if (!sidebar) return;
    
    // Проверяем цвет фона страницы Boosty для выбора темы
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    // Преобразуем rgb(r, g, b) в яркость
    const rgb = bodyBg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const r = parseInt(rgb[0]);
      const g = parseInt(rgb[1]);
      const b = parseInt(rgb[2]);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      
      if (brightness > 128) {
        // Светлая тема
        sidebar.classList.remove('lf-dark');
        sidebar.classList.add('lf-light');
      } else {
        // Темная тема
        sidebar.classList.remove('lf-light');
        sidebar.classList.add('lf-dark');
      }
    }
  }

  // Вспомогательная функция для всплывающих уведомлений
  function showNotification(text) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background-color: #333;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 100000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-left: 4px solid var(--lf-primary, #ff5722);
      transition: opacity 0.3s, transform 0.3s;
      transform: translateY(10px);
      opacity: 0;
    `;
    toast.textContent = text;
    document.body.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);
    
    // Анимация скрытия и удаление
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Дебаунс для автосохранения заметок
  let saveTimeout;
  function debounceSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveStateToStorage();
    }, 500);
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА СОДЕРЖИМОГО (ОСНОВНОЙ РЕНДЕР)
  // -------------------------------------------------------------
  function render() {
    const sidebar = document.getElementById('lf-sidebar');
    if (!sidebar) return;

    const bodyContent = document.getElementById('lf-body-content');
    const savedScrollTop = bodyContent ? bodyContent.scrollTop : 0;
    const savedTab = state.ui.activeTab;
    const savedTitle = state.ui.activeTitle;

    // Сохраняем временное состояние UI в sessionStorage текущей вкладки (для сохранения при перезагрузках)
    try {
      sessionStorage.setItem('lf_active_title', state.ui.activeTitle || '');
      sessionStorage.setItem('lf_active_tab', state.ui.activeTab || 'favorite');
    } catch (e) {
      // Игнорируем ошибки доступа к sessionStorage
    }
    
    // Если идет синхронизация
    if (state.ui.isSyncing) {
      sidebar.innerHTML = sidebarLoadingTemplate();
      return;
    }
    
    // Вычисляем количество уникальных тайтлов до шаблона
    const uniqueTagCount = new Set(state.posts.flatMap(p =>
      p.tags.map(t => t.title).filter(t => !TAGS_BLACKLIST.includes(t.toLowerCase()))
    )).size;

    // Общая верстка каркаса
    sidebar.innerHTML = sidebarShellTemplate(uniqueTagCount);

    // Подключаем события хедера
    document.getElementById('lf-sync-btn').addEventListener('click', performIncrementalSync);
    
    const settingsBtn = document.getElementById('lf-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        state.ui.activeTitle = null;
        if (state.ui.activeTab === 'settings') {
          state.ui.activeTab = state.ui.previousTab || 'favorite';
        } else {
          state.ui.previousTab = state.ui.activeTab;
          state.ui.activeTab = 'settings';
        }
        render();
      });
    }

    const closeBtn = document.getElementById('lf-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.settings.sidebarOpen = false;
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.classList.remove('lf-open');
        }
        saveStateToStorage();
      });
    }
    
    if (!state.ui.activeTitle) {
      const searchInput = document.getElementById('lf-search');
      const searchClear = document.getElementById('lf-search-clear');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          state.ui.searchQuery = e.target.value;
          if (searchClear) {
            searchClear.style.display = e.target.value ? 'flex' : 'none';
          }
          renderListContent();
        });
      }
      
      if (searchClear && searchInput) {
        searchClear.addEventListener('click', () => {
          state.ui.searchQuery = '';
          searchInput.value = '';
          searchClear.style.display = 'none';
          searchInput.focus();
          renderListContent();
        });
      }
      
      // Вкладки (только обычные)
      const tabButtons = sidebar.querySelectorAll('.lf-tab-btn:not(.lf-dropdown-trigger)');
      tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          state.ui.activeTab = e.target.dataset.tab;
          render();
        });
      });

      // Дропдаун архива
      const archiveBtn = document.getElementById('lf-archive-btn');
      const archiveDropdown = document.getElementById('lf-archive-dropdown');
      
      // Дропдаун сортировки
      const sortBtn = document.getElementById('lf-sort-btn');
      const sortDropdown = document.getElementById('lf-sort-dropdown');

      if (archiveBtn && archiveDropdown) {
        archiveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          archiveDropdown.classList.toggle('lf-show');
          if (sortDropdown) {
            sortDropdown.classList.remove('lf-show');
          }
        });
      }

      if (sortBtn && sortDropdown) {
        sortBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sortDropdown.classList.toggle('lf-show');
          if (archiveDropdown) {
            archiveDropdown.classList.remove('lf-show');
          }
        });

        // Клик по элементам сортировки
        const sortItems = sortDropdown.querySelectorAll('.lf-dropdown-item');
        sortItems.forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            state.settings.titleSort = e.currentTarget.dataset.sort;
            saveStateToStorage();
            sortDropdown.classList.remove('lf-show');
            
            // Обновляем активный класс
            sortItems.forEach(si => si.classList.remove('lf-active'));
            e.currentTarget.classList.add('lf-active');
            
            renderListContent();
          });
        });
      }

      // Элементы дропдауна архива
      const archiveItems = archiveDropdown ? archiveDropdown.querySelectorAll('.lf-dropdown-item') : [];
      archiveItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          state.ui.activeTab = e.currentTarget.dataset.tab;
          if (archiveDropdown) {
            archiveDropdown.classList.remove('lf-show');
          }
          render();
        });
      });
      
      renderListContent();
    } else {
      renderDetailContent();
    }

    // Восстанавливаем позицию прокрутки, если вкладка и тайтл не изменились
    if (state.ui.activeTab === savedTab && state.ui.activeTitle === savedTitle) {
      const newBodyContent = document.getElementById('lf-body-content');
      if (newBodyContent && savedScrollTop > 0) {
        newBodyContent.scrollTop = savedScrollTop;
      }
    }
  }

  // Отрисовка вкладки настроек
  function renderSettingsContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="lf-settings-container">
        <!-- Резервное копирование -->
        <div class="lf-settings-section lf-collapsible ${state.ui.syncBackupExpanded ? 'lf-expanded' : ''}">
          <div class="lf-settings-section-header" id="lf-toggle-sync-backup">
            <h3 class="lf-settings-title" style="margin: 0;">${t('settings_title_sync')}</h3>
            <svg class="lf-collapse-arrow" viewBox="0 0 24 24">
              <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
            </svg>
          </div>
          <div class="lf-settings-section-body">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <button id="lf-export-btn" class="lf-btn-secondary" style="flex: 1; margin: 0; padding: 6px 10px; font-size: 11px; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
                  <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
                </svg>
                ${t('settings_export_btn')}
              </button>
              
              <button id="lf-import-btn" class="lf-btn-secondary" style="flex: 1; margin: 0; padding: 6px 10px; font-size: 11px; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
                  <path d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z" />
                </svg>
                ${t('settings_import_btn')}
              </button>
              <input type="file" id="lf-import-input" accept=".zip" style="display: none;">
            </div>
            
            <div style="margin-bottom: 12px;">
              <button id="lf-full-sync-btn" class="lf-btn-secondary" style="width: 100%; margin: 0; padding: 6px 10px; font-size: 11px; height: 28px; display: flex; justify-content: center; align-items: center;">
                ${t('settings_full_sync_btn')}
              </button>
            </div>

            <div class="lf-settings-divider"></div>

            <h4 class="lf-settings-subtitle">${t('settings_cloud_sync_title')}</h4>
            <div class="lf-settings-desc" style="margin-bottom: 10px;">
              ${t('settings_cloud_sync_desc')}
            </div>

            <!-- Группа выбора провайдера -->
            <label class="lf-settings-label" style="margin-top: 8px;">${t('settings_select_cloud')}</label>
            <select id="lf-provider-select" class="lf-settings-select" style="margin-top: 4px; margin-bottom: 12px; width: 100%;" ${state.ui.webdavSyncing || state.ui.webdavTesting ? 'disabled' : ''}>
              <option value="yandex" ${webdavConfig.provider === 'yandex' ? 'selected' : ''}>${t('settings_yandex_disk')}</option>
              <option value="webdav" ${webdavConfig.provider === 'webdav' ? 'selected' : ''}>${t('settings_other_webdav')}</option>
            </select>

            ${webdavConfig.provider === 'yandex' ? `
            <details class="lf-webdav-guide">
              <summary>${t('webdav_guide_yandex_title')}</summary>
              <ol class="lf-webdav-guide-list">
                <li>${t('webdav_guide_yandex_step1')}</li>
                <li>${t('webdav_guide_yandex_step2')}</li>
                <li>${t('webdav_guide_yandex_step3')}</li>
                <li>${t('webdav_guide_yandex_step4')}</li>
              </ol>
            </details>
            ` : `
            <details class="lf-webdav-guide">
              <summary>${t('webdav_guide_other_title')}</summary>
              <ol class="lf-webdav-guide-list">
                <li>${t('webdav_guide_other_step1')}</li>
                <li>${t('webdav_guide_other_step2')}</li>
                <li>${t('webdav_guide_other_step3')}</li>
                <li>${t('webdav_guide_other_step4')}</li>
              </ol>
            </details>
            `}

            <div class="lf-settings-row">
              <label class="lf-settings-label" for="lf-webdav-enabled">
                ${t('settings_auto_sync_label')}
                <div class="lf-settings-desc">${t('settings_auto_sync_desc')}</div>
              </label>
              <input type="checkbox" id="lf-webdav-enabled" class="lf-settings-checkbox" ${webdavConfig.enabled ? 'checked' : ''}>
            </div>

            <div class="lf-webdav-fields" style="margin-bottom: 12px;">
              ${webdavConfig.provider === 'webdav' ? `
              <label class="lf-settings-label" for="lf-webdav-base-url">${t('settings_webdav_url')}</label>
              <div class="lf-input-wrapper">
                <input type="url" id="lf-webdav-base-url" class="lf-settings-input" style="padding-right: 28px;" value="${escapeHtml(webdavConfig.baseUrl)}" placeholder="https://cloud.example.com/remote.php/dav/files/user/" autocomplete="off">
                ${webdavConfig.baseUrl ? `<button class="lf-input-clear-btn" data-clear="lf-webdav-base-url" type="button">&times;</button>` : ''}
              </div>
              <div class="lf-settings-hint" style="font-size:10px;color:#8a8a92;margin:2px 0 0;">${t('settings_webdav_url_hint')}</div>
              ` : ''}

              <label class="lf-settings-label" for="lf-webdav-username" style="margin-top: 8px;">${t('settings_webdav_username')}</label>
              <div class="lf-input-wrapper">
                <input type="text" id="lf-webdav-username" class="lf-settings-input" style="padding-right: 28px;" value="${escapeHtml(webdavConfig.username)}" placeholder="${webdavConfig.provider === 'yandex' ? t('settings_webdav_username_yandex_placeholder') : t('settings_webdav_username_placeholder')}" autocomplete="username">
                ${webdavConfig.username ? `<button class="lf-input-clear-btn" data-clear="lf-webdav-username" type="button">&times;</button>` : ''}
              </div>

              <label class="lf-settings-label" for="lf-webdav-access-code" style="margin-top: 8px;">
                ${t('settings_webdav_access_code')}
                <div class="lf-settings-desc">
                  ${webdavConfig.provider === 'yandex' ? t('settings_webdav_code_desc_yandex') : t('settings_webdav_code_desc_other')}
                </div>
              </label>
              <div class="lf-input-wrapper">
                <input type="text" id="lf-webdav-access-code" class="lf-settings-input ${state.ui.showAccessCode ? '' : 'lf-settings-input-password'}" style="padding-right: 48px;" value="${webdavConfig.accessCode ? (state.ui.showAccessCode ? escapeHtml(webdavConfig.accessCode) : '••••••••') : ''}" placeholder="${t('settings_webdav_code_placeholder')}" autocomplete="off">
                ${webdavConfig.accessCode ? `<button class="lf-input-clear-btn" data-clear="lf-webdav-access-code" type="button" style="right: 26px;">&times;</button>` : ''}
                <button id="lf-webdav-toggle-code-btn" class="lf-input-eye-btn" type="button">
                  ${state.ui.showAccessCode ? `
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                      <path d="M11.83,9L15,12.17C14.83,12.62 14.47,12.97 14,13.17L10.83,10C11,9.5 11.37,9.13 11.83,9M12,17A5,5 0 0,1 7,12C7,11.53 7.13,11.1 7.35,10.74L5.8,9.2C5.3,10 5,11 5,12A7,7 0 0,0 12,19C13,19 14,18.7 14.8,18.2L13.26,16.65C12.9,16.87 12.47,17 12,17M2,4.27L5.11,7.39C3.12,8.6 1.57,10.21 1,12C2.73,16.39 7,19.5 12,19.5C13.8,19.5 15.5,19 17,18.15L19.73,20.88L21,19.6L3.27,1.87L2,3.15M12,7.5C14.48,7.5 16.5,9.5 16.5,12C16.5,12.75 16.3,13.46 16,14.06L18.66,16.72C20.67,15.19 22.18,13.16 22.68,11C20.95,7.61 16.68,4.5 11.68,4.5C10.22,4.5 8.84,4.82 7.6,5.39L9.6,7.39C10.26,7.15 10.96,7.5 11.68,7.5M12,9A3,3 0 0,0 9,12C9,12.23 9.07,12.44 9.17,12.63L11.37,10.43C11.56,10.13 11.77,10 12,10" />
                    </svg>
                  ` : `
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                      <path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17Z" />
                    </svg>
                  `}
                </button>
              </div>
            </div>

            <div class="lf-settings-buttons" style="margin-top: 16px; margin-bottom: 12px; position: relative; flex-direction: column;">
              <button id="lf-webdav-sync-btn" class="lf-btn-primary" style="width: 100%; display: flex; justify-content: center; align-items: center;" ${state.ui.webdavSyncing || state.ui.webdavTesting ? 'disabled' : ''}>
                ${state.ui.webdavSyncing ? t('settings_webdav_syncing_btn') : t('settings_webdav_sync_btn')}
              </button>
              ${state.ui.webdavSyncing ? `
                <div class="lf-sync-progress-bar-container">
                  <div class="lf-sync-progress-bar"></div>
                </div>
              ` : ''}
            </div>

            <div class="lf-webdav-status">
              <span>${t('settings_webdav_last_sync', webdavConfig.lastSyncAt ? formatSyncDate(webdavConfig.lastSyncAt) : t('settings_webdav_never_sync'))}</span>
              ${webdavConfig.lastSyncStatus ? `<span class="lf-webdav-status-note">${escapeHtml(webdavConfig.lastSyncStatus)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Параметры отслеживания -->
        <div class="lf-settings-section">
          <h3 class="lf-settings-title">${t('settings_title_tracking')}</h3>
          
          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-sync-likes">
              ${t('settings_sync_likes_label')}
              <div class="lf-settings-desc">${t('settings_sync_likes_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-sync-likes" class="lf-settings-checkbox" ${state.settings.syncLikes ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-sync-title-from-url">
              ${t('settings_sync_title_from_url_label')}
              <div class="lf-settings-desc">${t('settings_sync_title_from_url_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-sync-title-from-url" class="lf-settings-checkbox" ${state.settings.syncTitleFromUrl ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-open-titles">
              ${t('settings_open_titles_label')}
              <div class="lf-settings-desc">${t('settings_open_titles_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-open-titles" class="lf-settings-checkbox" ${state.settings.openTitlesInCurrentTab ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-open-chapters-in-feed">
              ${t('settings_open_chapters_feed_label')}
              <div class="lf-settings-desc">${t('settings_open_chapters_feed_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-open-chapters-in-feed" class="lf-settings-checkbox" ${state.settings.openChaptersInFeed ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-group-all-viewed">
              ${t('settings_group_all_viewed_label')}
              <div class="lf-settings-desc">${t('settings_group_all_viewed_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-group-all-viewed" class="lf-settings-checkbox" ${state.settings.groupAllViewed !== false ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-save-player">
              ${t('settings_save_player_label')}
              <div class="lf-settings-desc">${t('settings_save_player_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-save-player" class="lf-settings-checkbox" ${state.settings.savePlayerTime ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-force-video-quality">
              ${t('settings_force_video_quality_label')}
              <div class="lf-settings-desc">${t('settings_force_video_quality_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-force-video-quality" class="lf-settings-checkbox" ${state.settings.forceVideoQuality ? 'checked' : ''}>
          </div>

          <div class="lf-settings-row" id="lf-setting-video-quality-container" style="${state.settings.forceVideoQuality ? '' : 'opacity: 0.5; pointer-events: none;'}">
            <label class="lf-settings-label" for="lf-setting-video-quality">
              ${t('settings_video_quality_label')}
            </label>
            <select id="lf-setting-video-quality" class="lf-settings-select" ${state.settings.forceVideoQuality ? '' : 'disabled'}>
              <option value="1080p" ${state.settings.videoQuality === '1080p' ? 'selected' : ''}>1080p</option>
              <option value="720p" ${state.settings.videoQuality === '720p' ? 'selected' : ''}>720p</option>
              <option value="480p" ${state.settings.videoQuality === '480p' ? 'selected' : ''}>480p</option>
              <option value="360p" ${state.settings.videoQuality === '360p' ? 'selected' : ''}>360p</option>
              <option value="240p" ${state.settings.videoQuality === '240p' ? 'selected' : ''}>240p</option>
              <option value="144p" ${state.settings.videoQuality === '144p' ? 'selected' : ''}>144p</option>
            </select>
          </div>

          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-auto-mark">
              ${t('settings_auto_mark_label')}
              <div class="lf-settings-desc">${t('settings_auto_mark_desc')}</div>
            </label>
            <input type="checkbox" id="lf-setting-auto-mark" class="lf-settings-checkbox" ${state.settings.autoMarkOpen ? 'checked' : ''}>
          </div>
        </div>

        <!-- Внешний вид -->
        <div class="lf-settings-section">
          <h3 class="lf-settings-title">${t('settings_title_interface')}</h3>
          
          <div class="lf-settings-row">
            <label class="lf-settings-label" for="lf-setting-zoom">
              ${t('settings_zoom_label')}
              <div class="lf-settings-desc">${t('settings_zoom_desc')}</div>
            </label>
            <select id="lf-setting-zoom" class="lf-settings-select">
              <option value="1.0" ${state.settings.zoom === 1.0 ? 'selected' : ''}>80%</option>
              <option value="1.125" ${state.settings.zoom === 1.125 ? 'selected' : ''}>90%</option>
              <option value="1.25" ${state.settings.zoom === 1.25 ? 'selected' : ''}>100%</option>
              <option value="1.375" ${state.settings.zoom === 1.375 ? 'selected' : ''}>110%</option>
              <option value="1.5" ${state.settings.zoom === 1.5 ? 'selected' : ''}>120%</option>
              <option value="1.625" ${state.settings.zoom === 1.625 ? 'selected' : ''}>130%</option>
              <option value="1.75" ${state.settings.zoom === 1.75 ? 'selected' : ''}>140%</option>
              <option value="1.875" ${state.settings.zoom === 1.875 ? 'selected' : ''}>150%</option>
            </select>
          </div>
        </div>

        <!-- Порядок вкладок -->
        <div class="lf-settings-section lf-collapsible ${state.ui.tabOrderExpanded ? 'lf-expanded' : ''}">
          <div class="lf-settings-section-header" id="lf-toggle-tab-order">
            <h3 class="lf-settings-title" style="margin: 0;">${t('settings_title_tab_order')}</h3>
            <svg class="lf-collapse-arrow" viewBox="0 0 24 24">
              <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
            </svg>
          </div>
          <div class="lf-settings-section-body">
            <div class="lf-settings-desc" style="margin-bottom: 12px;">
              ${t('settings_tab_order_desc')}
            </div>
            <div class="lf-tab-order-list">
              ${state.settings.tabOrder.map((tabKey, idx) => `
                <div class="lf-tab-order-item" data-index="${idx}">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="lf-drag-handle" title="${t('settings_drag_handle_tooltip')}">
                      <svg viewBox="0 0 24 24">
                        <path d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z" />
                      </svg>
                    </div>
                    <span class="lf-tab-order-name">${TAB_NAMES[tabKey] || tabKey}</span>
                  </div>
                  <div class="lf-tab-order-btns">
                    <button class="lf-tab-order-btn lf-tab-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="${t('settings_tab_up_tooltip')}">▲</button>
                    <button class="lf-tab-order-btn lf-tab-down" data-index="${idx}" ${idx === state.settings.tabOrder.length - 1 ? 'disabled' : ''} title="${t('settings_tab_down_tooltip')}">▼</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- О расширении -->
        <div class="lf-settings-section" style="padding: 0; border: none; background: none;">
          <button id="lf-about-btn" class="lf-btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; padding: 8px 12px; font-weight: 600; margin: 0;">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
            ${t('settings_about_btn')}
          </button>
        </div>

        <div id="lf-delete-container" style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
          <button id="lf-delete-data-btn" class="lf-btn-secondary" style="width: 100%; border-color: rgba(211, 47, 47, 0.2); color: rgba(211, 47, 47, 0.7); font-size: 11px; padding: 6px 10px; margin: 0;">
            ${t('settings_delete_data_btn')}
          </button>
        </div>
      </div>
    `;

    // Подключение событий кнопок экспорта/импорта
    document.getElementById('lf-export-btn').addEventListener('click', exportUserData);
    
    const importBtn = document.getElementById('lf-import-btn');
    const importInput = document.getElementById('lf-import-input');
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      event.target.value = ''; // сбрасываем сразу, чтобы повторный выбор того же файла сработал
      if (!file) return;
      const mode = await showImportChoiceDialog();
      if (!mode) return; // отмена
      await importBackupFile(file, mode);
    });

    const webdavEnabled = document.getElementById('lf-webdav-enabled');
    const webdavBaseUrl = document.getElementById('lf-webdav-base-url');
    const webdavUsername = document.getElementById('lf-webdav-username');
    const webdavAccessCode = document.getElementById('lf-webdav-access-code');
    const webdavToggleCodeBtn = document.getElementById('lf-webdav-toggle-code-btn');
    const webdavSyncBtn = document.getElementById('lf-webdav-sync-btn');

    if (webdavEnabled) {
      webdavEnabled.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const origin = getWebDavOrigin();
          if (origin) {
            const granted = await requestWebDavPermission(origin);
            if (!granted) {
              e.target.checked = false;
              webdavConfig.enabled = false;
              await saveWebDavConfig();
              showNotification(t('error_webdav_no_permission'));
              return;
            }
          }
        }
        webdavConfig.enabled = e.target.checked;
        await saveWebDavConfig();
        showNotification(e.target.checked ? t('notify_auto_sync_on') : t('notify_auto_sync_off'));
      });
    }

    // Обработчик выбора провайдера в выпадающем списке
    const providerSelect = document.getElementById('lf-provider-select');
    if (providerSelect) {
      providerSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (webdavConfig.provider === val) return;
        webdavConfig.provider = val;
        await saveWebDavConfig();
        renderSettingsContent();
      });
    }

    if (webdavBaseUrl) {
      webdavBaseUrl.addEventListener('blur', saveWebDavSettingsFromForm);
    }

    if (webdavUsername) {
      webdavUsername.addEventListener('blur', saveWebDavSettingsFromForm);
      webdavUsername.addEventListener('input', (e) => {
        const cleared = e.target.value.replace(/[а-яА-ЯёЁ]/g, '');
        if (cleared !== e.target.value) {
          e.target.value = cleared;
        }
      });
    }

    let codeInputChanged = false;
    if (webdavAccessCode) {
      webdavAccessCode.addEventListener('focus', (e) => {
        if (e.target.value === '••••••••') {
          e.target.value = '';
          codeInputChanged = false;
        }
      });
      webdavAccessCode.addEventListener('input', () => {
        codeInputChanged = true;
      });
      webdavAccessCode.addEventListener('blur', async (e) => {
        if (e.target.value === '' && !codeInputChanged && webdavConfig.accessCode) {
          e.target.value = state.ui.showAccessCode ? webdavConfig.accessCode : '••••••••';
        }
        await saveWebDavSettingsFromForm();
      });
    }

    if (webdavToggleCodeBtn) {
      webdavToggleCodeBtn.addEventListener('click', () => {
        state.ui.showAccessCode = !state.ui.showAccessCode;
        renderSettingsContent();
      });
    }

    if (webdavSyncBtn) {
      webdavSyncBtn.addEventListener('click', () => {
        performWebDavSync({ silent: false });
      });
    }

    const clearButtons = document.querySelectorAll('.lf-input-clear-btn');
    clearButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.clear;
        if (targetId === 'lf-webdav-base-url') {
          webdavConfig.baseUrl = '';
        } else if (targetId === 'lf-webdav-username') {
          webdavConfig.username = '';
        } else if (targetId === 'lf-webdav-access-code') {
          webdavConfig.accessCode = '';
        }
        await saveWebDavConfig();
        renderSettingsContent();
      });
    });

    // Кнопка удаления данных (двухэтапное подтверждение)
    const deleteDataBtn = document.getElementById('lf-delete-data-btn');
    const deleteContainer = document.getElementById('lf-delete-container');
    let deleteTimeout = null;

    if (deleteDataBtn && deleteContainer) {
      deleteDataBtn.addEventListener('click', () => {
        const isConfirming = deleteDataBtn.getAttribute('data-confirming') === 'true';

        if (!isConfirming) {
          // Переводим в состояние подтверждения
          deleteDataBtn.setAttribute('data-confirming', 'true');
          deleteDataBtn.textContent = t('settings_delete_data_confirm_btn');
          deleteDataBtn.style.backgroundColor = '#d32f2f';
          deleteDataBtn.style.color = '#ffffff';
          deleteDataBtn.style.borderColor = '#d32f2f';

          // Создаем кнопку отмены
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'lf-delete-cancel-btn';
          cancelBtn.className = 'lf-btn-secondary';
          cancelBtn.style.width = '100%';
          cancelBtn.style.fontSize = '11px';
          cancelBtn.style.padding = '6px 10px';
          cancelBtn.textContent = t('settings_cancel');
          
          cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetDeleteButton();
          });

          deleteContainer.appendChild(cancelBtn);

          // Таймер автоотмены через 5 секунд
          deleteTimeout = setTimeout(() => {
            resetDeleteButton();
          }, 5000);

        } else {
          // Второе нажатие — выполняем удаление
          if (deleteTimeout) clearTimeout(deleteTimeout);
          
          chrome.storage.local.clear(() => {
            showNotification(t('notify_data_deleted'));
            
            // Сбрасываем DevTools в памяти к заводским настройкам
            if (DEV) {
              devSettings.enabled = false;
              devSettings.cutoffDate = '';
              devSettings.hideAboutAuthor = true;
              devSettings.alwaysShowReactions = true;
              devSettings.showAllNewChapters = false;
              applyDevSettingsEffects();
            }

            // Сбрасываем локальное состояние
            state.posts = [];
            state.user_data = {};
            state.lastVisit = 0;
            state.newTitles = [];
            state.newChapters = [];
            state.collapsedGroups = {};
            state.blogDescriptionLinks = [];
            state.settings = {
              syncLikes: true,
              syncTitleFromUrl: true,
              autoMarkOpen: false,
              tabOrder: ['favorite', 'new', 'watching', 'all', 'completed', 'dropped'],
              zoom: 1.25,
              zoomMigrated: true,
              sidebarOpen: true,
              openTitlesInCurrentTab: true,
              openChaptersInFeed: true,
              groupAllViewed: true,
              forceVideoQuality: false,
              videoQuality: '1080p'
            };
            
            // Сбрасываем временные UI-параметры
            state.ui.activeTitle = null;
            state.ui.activeTab = 'favorite';
            try {
              sessionStorage.removeItem('lf_active_title');
              sessionStorage.removeItem('lf_active_tab');
            } catch(e) {}
            
            // Восстанавливаем дефолтный масштаб в DOM
            const sidebar = document.getElementById('lf-sidebar');
            if (sidebar) {
              sidebar.style.setProperty('--lf-zoom', 1.25);
            }
            
            // Перерисовываем интерфейс (появится экран первой синхронизации)
            render();
          });
        }
      });

      function resetDeleteButton() {
        if (deleteTimeout) clearTimeout(deleteTimeout);
        deleteDataBtn.removeAttribute('data-confirming');
        deleteDataBtn.textContent = t('settings_delete_data_btn');
        deleteDataBtn.style.backgroundColor = '';
        deleteDataBtn.style.color = '';
        deleteDataBtn.style.borderColor = '';
        
        const cancelBtn = document.getElementById('lf-delete-cancel-btn');
        if (cancelBtn) {
          cancelBtn.remove();
        }
      }
    }

    // Подключение полной принудительной синхронизации
    const fullSyncBtn = document.getElementById('lf-full-sync-btn');
    if (fullSyncBtn) {
      fullSyncBtn.addEventListener('click', () => {
        state.ui.activeTab = 'favorite'; // Переключаем на вкладку списков, чтобы пользователь сразу видел прогресс
        performFullSync();
      });
    }

    // Подключение событий чекбоксов
    const syncLikesCheckbox = document.getElementById('lf-setting-sync-likes');
    syncLikesCheckbox.addEventListener('change', (e) => {
      state.settings.syncLikes = e.target.checked;
      saveStateToStorage();
      showNotification(e.target.checked ? t('notify_sync_likes_on') : t('notify_sync_likes_off'));
    });

    const syncTitleFromUrlCheckbox = document.getElementById('lf-setting-sync-title-from-url');
    if (syncTitleFromUrlCheckbox) {
      syncTitleFromUrlCheckbox.addEventListener('change', (e) => {
        state.settings.syncTitleFromUrl = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? t('notify_sync_title_from_url_on') : t('notify_sync_title_from_url_off'));
      });
    }

    const autoMarkCheckbox = document.getElementById('lf-setting-auto-mark');
    autoMarkCheckbox.addEventListener('change', (e) => {
      state.settings.autoMarkOpen = e.target.checked;
      saveStateToStorage();
      showNotification(e.target.checked ? t('notify_auto_mark_on') : t('notify_auto_mark_off'));
    });

    const savePlayerCheckbox = document.getElementById('lf-setting-save-player');
    if (savePlayerCheckbox) {
      savePlayerCheckbox.addEventListener('change', (e) => {
        state.settings.savePlayerTime = e.target.checked;
        saveStateToStorage();
      });
    }

    const forceVideoQualityCheckbox = document.getElementById('lf-setting-force-video-quality');
    const videoQualitySelect = document.getElementById('lf-setting-video-quality');
    const videoQualityContainer = document.getElementById('lf-setting-video-quality-container');

    if (forceVideoQualityCheckbox) {
      forceVideoQualityCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        state.settings.forceVideoQuality = checked;
        saveStateToStorage();
        // Передаём настройку в page_script (применится к видео, открытым после изменения)
        window.postMessage({ type: 'LF_SET_QUALITY_PREF', enabled: checked, value: checked ? (state.settings.videoQuality || 'auto') : 'auto' }, '*');
        showNotification(checked ? t('notify_force_video_quality_on') : t('notify_force_video_quality_off'));

        if (videoQualitySelect) {
          videoQualitySelect.disabled = !checked;
        }
        if (videoQualityContainer) {
          videoQualityContainer.style.opacity = checked ? '1' : '0.5';
          videoQualityContainer.style.pointerEvents = checked ? 'auto' : 'none';
        }
      });
    }

    if (videoQualitySelect) {
      videoQualitySelect.addEventListener('change', (e) => {
        const val = e.target.value;
        state.settings.videoQuality = val;
        saveStateToStorage();
        // Передаём обновлённое качество в page_script (применится к следующим открытым видео)
        window.postMessage({ type: 'LF_SET_QUALITY_PREF', enabled: !!state.settings.forceVideoQuality, value: state.settings.forceVideoQuality ? val : 'auto' }, '*');
        showNotification(t('notify_video_quality_changed', val));
      });
    }

    const openTitlesCheckbox = document.getElementById('lf-setting-open-titles');
    if (openTitlesCheckbox) {
      openTitlesCheckbox.addEventListener('change', (e) => {
        state.settings.openTitlesInCurrentTab = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? t('notify_open_titles_current') : t('notify_open_titles_new'));
      });
    }

    const openChaptersCheckbox = document.getElementById('lf-setting-open-chapters-in-feed');
    if (openChaptersCheckbox) {
      openChaptersCheckbox.addEventListener('change', (e) => {
        state.settings.openChaptersInFeed = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? t('notify_chapters_feed_on') : t('notify_chapters_feed_off'));
      });
    }

    const groupAllViewedCheckbox = document.getElementById('lf-setting-group-all-viewed');
    if (groupAllViewedCheckbox) {
      groupAllViewedCheckbox.addEventListener('change', (e) => {
        state.settings.groupAllViewed = e.target.checked;
        saveStateToStorage();
        showNotification(e.target.checked ? t('notify_group_all_viewed_on') : t('notify_group_all_viewed_off'));
        render();
      });
    }

    // Подключение событий выбора масштаба
    const zoomSelect = document.getElementById('lf-setting-zoom');
    if (zoomSelect) {
      zoomSelect.addEventListener('change', (e) => {
        const newZoom = parseFloat(e.target.value);
        state.settings.zoom = newZoom;
        saveStateToStorage();
        
        const sidebar = document.getElementById('lf-sidebar');
        if (sidebar) {
          sidebar.style.setProperty('--lf-zoom', newZoom);
        }
        
        showNotification(t('notify_zoom_changed', Math.round(newZoom * 80)));
        render();
      });
    }

    // Подключение событий изменения порядка вкладок
    container.querySelectorAll('.lf-tab-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        moveTab(idx, -1);
      });
    });

    container.querySelectorAll('.lf-tab-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        moveTab(idx, 1);
      });
    });

    // Подключение Drag and Drop для порядка вкладок
    let draggedIndex = null;
    const dragItems = container.querySelectorAll('.lf-tab-order-item');
    
    dragItems.forEach(item => {
      const handle = item.querySelector('.lf-drag-handle');
      
      // Делаем элемент перетаскиваемым только при зажатии ручки
      handle.addEventListener('mousedown', () => {
        item.draggable = true;
      });
      
      handle.addEventListener('mouseup', () => {
        item.draggable = false;
      });
      
      item.addEventListener('dragstart', (e) => {
        draggedIndex = parseInt(item.dataset.index);
        item.classList.add('lf-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedIndex);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('lf-dragging');
        item.draggable = false;
        dragItems.forEach(i => i.classList.remove('lf-drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
      });

      item.addEventListener('dragenter', () => {
        item.classList.add('lf-drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('lf-drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.stopPropagation();
        const targetIndex = parseInt(item.dataset.index);
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
          dragAndDropReorder(draggedIndex, targetIndex);
        }
        return false;
      });
    });

    // Переключатель сворачивания порядка вкладок
    const toggleHeader = document.getElementById('lf-toggle-tab-order');
    if (toggleHeader) {
      toggleHeader.addEventListener('click', () => {
        state.ui.tabOrderExpanded = !state.ui.tabOrderExpanded;
        render();
      });
    }

    // Переключатель сворачивания блока синхронизации и бэкапа
    const toggleSyncBackup = document.getElementById('lf-toggle-sync-backup');
    if (toggleSyncBackup) {
      toggleSyncBackup.addEventListener('click', () => {
        state.ui.syncBackupExpanded = !state.ui.syncBackupExpanded;
        render();
      });
    }

    // Кнопка перехода в раздел "О расширении и авторе"
    const aboutBtn = document.getElementById('lf-about-btn');
    if (aboutBtn) {
      aboutBtn.addEventListener('click', () => {
        state.ui.activeTab = 'about';
        render();
      });
    }
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА РАЗДЕЛА О РАСШИРЕНИИ И АВТОРЕ
  // -------------------------------------------------------------
  function renderAboutContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    // Сбрасываем скролл наверх
    container.scrollTop = 0;

    let version = '0.9.0';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
        const manifest = chrome.runtime.getManifest();
        if (manifest && manifest.version) {
          version = manifest.version;
        }
      }
    } catch (e) {
      console.warn('Failed to get manifest version:', e);
    }

    container.innerHTML = aboutContentTemplate(version);

    document.getElementById('lf-about-back').addEventListener('click', () => {
      state.ui.activeTab = 'settings';
      render();
    });

    // Открытие модального окна USDT
    const usdtBtn = document.getElementById('lf-support-usdt');
    if (usdtBtn) {
      usdtBtn.addEventListener('click', () => {
        let modal = document.getElementById('lf-usdt-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'lf-usdt-modal';
          modal.className = 'lf-modal-overlay';
          modal.innerHTML = usdtModalTemplate();
          const sidebar = document.getElementById('lf-sidebar');
          if (sidebar) {
            sidebar.appendChild(modal);
          }

          // Настраиваем события
          const closeBtn = modal.querySelector('#lf-modal-close-btn');
          const copyBtn = modal.querySelector('#lf-modal-copy-btn');
          const inlineCopyBtn = modal.querySelector('#lf-modal-inline-copy-btn');
          const addressVal = modal.querySelector('#lf-modal-address');
          const qrContainer = modal.querySelector('.lf-modal-qr-container');

          const originalAddress = getUsdtAddress();
          // Наблюдатель MutationObserver для защиты адреса кошелька от изменения в DOM сторонними скриптами
          const addressObserver = new MutationObserver(() => {
            if (addressVal && addressVal.textContent !== originalAddress) {
              addressVal.textContent = originalAddress;
            }
          });
          if (addressVal) {
            addressObserver.observe(addressVal, { characterData: true, childList: true, subtree: true });
          }

          // Также защитим QR-код от подмены картинки
          const qrImage = qrContainer ? qrContainer.querySelector('img') : null;
          const originalQrSrc = qrImage ? qrImage.getAttribute('src') : '';
          const qrObserver = new MutationObserver(() => {
            if (qrImage && qrImage.getAttribute('src') !== originalQrSrc) {
              qrImage.setAttribute('src', originalQrSrc);
            }
          });
          if (qrImage) {
            qrObserver.observe(qrImage, { attributes: true, attributeFilter: ['src'] });
          }

          const closeModal = () => {
            addressObserver.disconnect();
            qrObserver.disconnect();
            modal.classList.remove('lf-show');
            setTimeout(() => {
              modal.remove();
            }, 200);
          };

          closeBtn.addEventListener('click', closeModal);
          modal.addEventListener('click', (e) => {
            if (e.target === modal) {
              closeModal();
            }
          });

          // Общая функция копирования с визуальной обратной связью
          const performCopy = () => {
            navigator.clipboard.writeText(addressVal.innerText).then(() => {
              // Глобальный тост-нотификация
              showNotification(t('about_support_copied'));

              // Анимация текста на основной кнопке копирования
              const textSpan = copyBtn.querySelector('span');
              if (textSpan) {
                const originalText = textSpan.innerText;
                textSpan.innerText = t('about_support_copied');
                copyBtn.style.backgroundColor = '#26a17b';
                copyBtn.style.pointerEvents = 'none';
                setTimeout(() => {
                  textSpan.innerText = originalText;
                  copyBtn.style.backgroundColor = '';
                  copyBtn.style.pointerEvents = 'auto';
                }, 2000);
              }

              // Анимация цвета на встроенной иконке копирования
              const originalInlineColor = inlineCopyBtn.style.color;
              inlineCopyBtn.style.color = '#26a17b';
              inlineCopyBtn.style.pointerEvents = 'none';
              setTimeout(() => {
                inlineCopyBtn.style.color = originalInlineColor;
                inlineCopyBtn.style.pointerEvents = 'auto';
              }, 2000);
            });
          };

          // Копирование по клику на кнопки
          copyBtn.addEventListener('click', performCopy);
          inlineCopyBtn.addEventListener('click', performCopy);

          // Копирование по двойному клику на адрес и QR-код
          addressVal.addEventListener('dblclick', performCopy);
          qrContainer.addEventListener('dblclick', performCopy);
        }

        setTimeout(() => {
          modal.classList.add('lf-show');
        }, 10);
      });
    }
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА СПИСКА ТАЙТЛОВ
  // -------------------------------------------------------------
  function renderListContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;

    if (state.ui.activeTab === 'about') {
      renderAboutContent();
      return;
    }
    
    if (state.ui.activeTab === 'settings') {
      renderSettingsContent();
      return;
    }
    
    if (state.posts.length === 0) {
      container.innerHTML = `
        <div class="lf-empty-state">
          <svg class="lf-logo-large" viewBox="550 450 850 1020" style="width: 64px; height: 64px; margin-bottom: 8px;">
            <defs>
              <linearGradient id="boostyGradientLarge" gradientUnits="userSpaceOnUse" x1="1379" y1="266" x2="538" y2="2653">
                <stop offset="0" style="stop-color:#EE7829"/>
                <stop offset="0.2792" style="stop-color:#EF692A"/>
                <stop offset="0.6279" style="stop-color:#F05E2C"/>
                <stop offset="1" style="stop-color:#F05A2C"/>
              </linearGradient>
            </defs>
            <!-- оранжевая подложка под молнию -->
            <rect class="lf-logo-rect" x="700" y="500" width="450" height="630" fill="url(#boostyGradientLarge)" />
            <!-- белая закладка с вырезанной молнией -->
            <path class="lf-logo-path" fill="#ffffff" d="${BOOKMARK_SVG_PATH}" />
          </svg>
          <div>${t('empty_db_notice')}</div>
          <button id="lf-empty-sync-btn" style="padding: 8px 16px; background-color: var(--lf-primary); border: none; border-radius: var(--lf-border-radius); color: #fff; cursor: pointer; font-weight: 600;">${t('empty_db_run_btn')}</button>
        </div>
      `;
      document.getElementById('lf-empty-sync-btn').addEventListener('click', performFullSync);
      return;
    }
    
    const allTitles = getGroupedTitles();
    const query = state.ui.searchQuery.toLowerCase().trim();
    
    // Фильтруем тайтлы по вкладке и поисковому запросу
    let filtered = allTitles.filter(t => {
      // Фильтр поиска
      if (query && !t.name.toLowerCase().includes(query)) return false;
      
      // Фильтр вкладки
      switch (state.ui.activeTab) {
        case 'watching':
          return t.status === 'watching';
        case 'favorite':
          return t.status === 'favorite';
        case 'completed':
          return t.status === 'completed';
        case 'dropped':
          return t.status === 'dropped';
        case 'new':
          return t.isNewTitle || t.hasNewChapters;
        case 'all':
        default:
          return t.status !== 'dropped'; // На вкладке «Все» не показываем брошенные
      }
    });
    
    // Сортировка тайтлов на основе выбранного режима (вкладка «Новые» всегда сортируется по дате последних обновлений по убыванию)
    const isNewTab = state.ui.activeTab === 'new';
    const sortType = isNewTab ? 'new_desc' : (state.settings.titleSort || 'name_asc');
    filtered.sort((a, b) => {
      switch (sortType) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'new_desc': {
          const aTime = a.posts.length > 0 ? a.posts[a.posts.length - 1].publishTime : 0;
          const bTime = b.posts.length > 0 ? b.posts[b.posts.length - 1].publishTime : 0;
          return bTime - aTime;
        }
        case 'new_asc': {
          const aTime = a.posts.length > 0 ? a.posts[a.posts.length - 1].publishTime : 0;
          const bTime = b.posts.length > 0 ? b.posts[b.posts.length - 1].publishTime : 0;
          return aTime - bTime;
        }
        case 'chapters_desc':
          return b.posts.length - a.posts.length;
        case 'chapters_asc':
          return a.posts.length - b.posts.length;
        case 'progress_desc': {
          if (b.readCount !== a.readCount) {
            return b.readCount - a.readCount;
          }
          const aPercent = a.posts.length > 0 ? a.readCount / a.posts.length : 0;
          const bPercent = b.posts.length > 0 ? b.readCount / b.posts.length : 0;
          if (bPercent !== aPercent) {
            return bPercent - aPercent;
          }
          return a.name.localeCompare(b.name);
        }
        case 'progress_asc': {
          if (a.readCount !== b.readCount) {
            return a.readCount - b.readCount;
          }
          const aPercent = a.posts.length > 0 ? a.readCount / a.posts.length : 0;
          const bPercent = b.posts.length > 0 ? b.readCount / b.posts.length : 0;
          if (aPercent !== bPercent) {
            return aPercent - bPercent;
          }
          return a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="lf-empty-state">
          <svg viewBox="0 0 24 24">
            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
          </svg>
          <div>${t('empty_search_results')}</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    
    // Если мы на вкладке «Новые», выведем плоский список
    if (state.ui.activeTab === 'new') {
      const newTitles = filtered.filter(t => t.isNewTitle);
      const newChapters = filtered.filter(t => t.hasNewChapters && !t.isNewTitle);
      
      if (newTitles.length > 0) {
        renderGroup(container, 'Новые тайтлы', newTitles);
      }
      if (newChapters.length > 0) {
        renderGroup(container, 'Новые главы', newChapters);
      }

      const hasNew = (state.newTitles && state.newTitles.length > 0) || (state.newChapters && state.newChapters.length > 0);
      if (hasNew) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'lf-new-tab-actions';
        
        const clearAllBtn = document.createElement('button');
        clearAllBtn.id = 'lf-clear-all-new-btn';
        clearAllBtn.className = 'lf-clear-all-new-btn';
        clearAllBtn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/>
          </svg>
          ${t('btn_clear_new_short')}
        `;
        
        let confirmTimeout = null;
        let isConfirmStage = false;
        
        const resetConfirmState = () => {
          isConfirmStage = false;
          clearAllBtn.classList.remove('lf-confirming');
          clearAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
              <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/>
            </svg>
            ${t('btn_clear_new_short')}
          `;
          if (confirmTimeout) {
            clearTimeout(confirmTimeout);
            confirmTimeout = null;
          }
        };

        clearAllBtn.addEventListener('click', () => {
          if (!isConfirmStage) {
            isConfirmStage = true;
            clearAllBtn.classList.add('lf-confirming');
            clearAllBtn.innerHTML = `
              <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              ${t('confirm_clear_all_new_short')}
            `;
            confirmTimeout = setTimeout(resetConfirmState, 3000);
          } else {
            resetConfirmState();
            state.newTitles = [];
            state.newChapters = [];
            state.lastVisit = Date.now();
            if (DEV && devSettings.enabled && devSettings.cutoffDate) {
              state.lastVisit = new Date(devSettings.cutoffDate).getTime();
            }
            saveStateToStorage();
            render();
          }
        });
        actionsDiv.appendChild(clearAllBtn);
        container.appendChild(actionsDiv);
      }
      return;
    }
    
    // Для вкладки «Смотрю» отделяем завершенные тома и все просмотренные в свёрнутые группы внизу
    if (state.ui.activeTab === 'watching') {
      const isVolFinished = t => t.isVolumeFinished && t.readCount === t.posts.length && t.posts.length > 0;
      const isAllViewed = t => !t.isVolumeFinished && t.readCount === t.posts.length && t.posts.length > 0;

      const volumeFinishedWatching = filtered.filter(isVolFinished);
      const allViewedWatching = state.settings.groupAllViewed ? filtered.filter(isAllViewed) : [];
      const normalWatching = filtered.filter(t => !isVolFinished(t) && !(state.settings.groupAllViewed && isAllViewed(t)));

      if (normalWatching.length > 0 || (volumeFinishedWatching.length === 0 && allViewedWatching.length === 0)) {
        const listDiv = document.createElement('div');
        listDiv.className = 'lf-group-container';
        listDiv.style.backgroundColor = 'transparent';
        listDiv.style.border = 'none';

        const listContent = document.createElement('div');
        listContent.className = 'lf-group-list';

        normalWatching.forEach(manga => {
          listContent.appendChild(createMangaRow(manga));
        });

        listDiv.appendChild(listContent);
        container.appendChild(listDiv);
      }

      if (allViewedWatching.length > 0) {
        renderGroup(container, 'Просмотрены все главы', allViewedWatching);
      }

      if (volumeFinishedWatching.length > 0) {
        renderGroup(container, 'Завершен том', volumeFinishedWatching);
      }
      return;
    }

    // Для вкладок «Избранное», «Завершено», «Брошено» выводим простым списком
    if (['favorite', 'completed', 'dropped'].includes(state.ui.activeTab)) {
      const listDiv = document.createElement('div');
      listDiv.className = 'lf-group-container';
      listDiv.style.backgroundColor = 'transparent';
      listDiv.style.border = 'none';
      
      const listContent = document.createElement('div');
      listContent.className = 'lf-group-list';
      
      filtered.forEach(manga => {
        listContent.appendChild(createMangaRow(manga));
      });
      
      listDiv.appendChild(listContent);
      container.appendChild(listDiv);
      return;
    }
    
    // Для вкладки «Все» группируем по уровням подписки (категориям)
    const categories = [
      'Все',
      'Полностью озвучено',
      'Завершен том'
    ];
    
    // Динамически собираем уникальные категории тайтлов, исключая системные
    const uniqueUserCategories = new Set();
    filtered.forEach(t => {
      if (t.category && t.category !== 'Бесплатные' && t.category !== 'Объявления') {
        uniqueUserCategories.add(t.category);
      }
    });
    
    // Сортируем пользовательские категории по алфавиту
    const sortedUserCategories = Array.from(uniqueUserCategories).sort((a, b) => a.localeCompare(b));
    categories.push(...sortedUserCategories);
    
    categories.push('Бесплатные', 'Объявления');
    
    categories.forEach(catName => {
      let catTitles = [];
      if (catName === 'Все') {
        catTitles = filtered;
      } else if (catName === 'Полностью озвучено') {
        catTitles = filtered.filter(t => t.isFullyFinished);
      } else if (catName === 'Завершен том') {
        catTitles = filtered.filter(t => t.isVolumeFinished);
      } else {
        catTitles = filtered.filter(t => t.category === catName);
      }
      
      if (catTitles.length > 0) {
        renderGroup(container, catName, catTitles);
      }
    });
  }

  // Отрисовка одной группы тайтлов (выпадающий список)
  function renderGroup(parent, groupName, titles) {
    const groupContainer = document.createElement('div');
    const query = state.ui.searchQuery.toLowerCase().trim();
    // При наличии поискового запроса принудительно раскрываем категорию
    const isDefaultExpanded = groupName === 'Новые тайтлы' || groupName === 'Новые главы';
    const isCollapsed = query ? false : (isDefaultExpanded ? state.collapsedGroups[groupName] === true : state.collapsedGroups[groupName] !== false);
    groupContainer.className = `lf-group-container ${isCollapsed ? 'lf-collapsed' : ''}`;
    
    const header = document.createElement('div');
    header.className = 'lf-group-header';
    
    let countHtml = `<span class="lf-group-count">${titles.length}</span>`;
    if (groupName === 'Объявления' && titles.length > 0) {
      countHtml = `<span class="lf-group-count">${titles[0].readCount}/${titles[0].posts.length}</span>`;
    }
    
    header.innerHTML = `
      <div class="lf-group-header-left">
        <svg class="lf-group-arrow" viewBox="0 0 24 24">
          <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
        </svg>
        <span>${tCategory(groupName)}</span>
      </div>
      ${countHtml}
    `;
    
    header.addEventListener('click', () => {
      const collapsed = !groupContainer.classList.contains('lf-collapsed');
      if (collapsed) {
        groupContainer.classList.add('lf-collapsed');
        state.collapsedGroups[groupName] = true;
      } else {
        groupContainer.classList.remove('lf-collapsed');
        state.collapsedGroups[groupName] = false;
      }
      saveStateToStorage();
    });
    
    const list = document.createElement('div');
    list.className = 'lf-group-list';
    
    if (groupName === 'Объявления' && titles.length > 0) {
      const manga = titles[0];
      const sortedPosts = [...manga.posts];
      const readSet = new Set((manga.readPosts || []).map(String));
      
      const sortType = state.settings.titleSort || 'name_asc';
      sortedPosts.sort((a, b) => {
        const isReadA = readSet.has(String(a.id)) || (state.settings.syncLikes && a.isLiked);
        const isReadB = readSet.has(String(b.id)) || (state.settings.syncLikes && b.isLiked);
        
        switch (sortType) {
          case 'name_asc':
            return a.title.localeCompare(b.title);
          case 'name_desc':
            return b.title.localeCompare(a.title);
          case 'new_desc':
            return b.publishTime - a.publishTime;
          case 'new_asc':
            return a.publishTime - b.publishTime;
          case 'progress_desc':
            if (isReadA !== isReadB) {
              return (isReadB ? 1 : 0) - (isReadA ? 1 : 0);
            }
            return b.publishTime - a.publishTime;
          case 'progress_asc':
            if (isReadA !== isReadB) {
              return (isReadA ? 1 : 0) - (isReadB ? 1 : 0);
            }
            return b.publishTime - a.publishTime;
          default:
            return b.publishTime - a.publishTime;
        }
      });
      const tagUrl = manga.tagId 
        ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
        : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
        
      sortedPosts.forEach(post => {
        const row = document.createElement('div');
        row.className = 'lf-chapter-row';
        
        const isLiked = state.settings.syncLikes && post.isLiked;
        const isChecked = readSet.has(String(post.id)) || isLiked;
        const dateStr = formatDate(post.publishTime);
        
        const chapterUrl = `https://boosty.to/lightfoxmanga/posts/${post.id}`;
        const targetAttr = state.settings.openTitlesInCurrentTab ? '' : 'target="_blank"';
        
        const progress = getPlayerProgressForPost(String(post.id));
        const hasProgress = progress && typeof progress.time === 'number';
        let progressHtml = '';
        if (hasProgress && !isChecked) {
          const timeStr = formatSeconds(progress.time);
          if (typeof progress.duration === 'number' && progress.duration > 0) {
            const durationStr = formatSeconds(progress.duration);
            progressHtml = `<span class="lf-chapter-player-progress" title="${escapeHtml(t('player_progress_tooltip'))}">
              <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
              ${escapeHtml(t('player_progress_watched', timeStr, durationStr))}
            </span>`;
          } else {
            progressHtml = `<span class="lf-chapter-player-progress" title="${escapeHtml(t('player_progress_tooltip'))}">
              <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
              ${escapeHtml(t('player_progress_stopped', timeStr))}
            </span>`;
          }
        }

        row.innerHTML = `
          <input type="checkbox" class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? `title="${escapeHtml(t('post_liked_on_boosty'))}"` : ''}>
          <div class="lf-chapter-title-container">
            <a class="lf-chapter-title-link" href="${chapterUrl}" ${targetAttr} title="${escapeHtml(post.title === 'Без названия' ? t('untitled_post') : post.title)}">
              ${escapeHtml(post.title === 'Без названия' ? t('untitled_post') : post.title)}
            </a>
            ${progressHtml}
          </div>
          <span class="lf-chapter-date">${dateStr}</span>
        `;
        
        const checkbox = row.querySelector('.lf-chapter-checkbox');
        checkbox.addEventListener('change', (e) => {
          if (e.target.classList.contains('lf-liked-checkbox') && !e.target.checked) {
            e.target.classList.remove('lf-liked-checkbox');
          } else if (e.target.checked) {
            e.target.classList.add('lf-liked-checkbox');
          }

          const postId = String(e.target.dataset.postId);
          const hasProg = getPlayerProgressForPost(postId) !== null;
          if (e.target.checked) {
            const progressEl = row.querySelector('.lf-chapter-player-progress');
            if (progressEl) progressEl.style.display = 'none';
          } else {
            if (hasProg) {
              let progressEl = row.querySelector('.lf-chapter-player-progress');
              if (!progressEl) {
                const prog = getPlayerProgressForPost(postId);
                if (prog && typeof prog.time === 'number') {
                  const container = row.querySelector('.lf-chapter-title-container');
                  if (container) {
                    progressEl = document.createElement('span');
                    progressEl.className = 'lf-chapter-player-progress';
                    progressEl.title = t('player_progress_tooltip');
                    const timeStr = formatSeconds(prog.time);
                    const durationStr = (typeof prog.duration === 'number' && prog.duration > 0) ? formatSeconds(prog.duration) : null;
                    const text = durationStr ? t('player_progress_watched', timeStr, durationStr) : t('player_progress_stopped', timeStr);
                    progressEl.innerHTML = `
                      <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
                      ${text}
                    `;
                    container.appendChild(progressEl);
                  }
                }
              }
              if (progressEl) progressEl.style.display = '';
            }
          }
          
          setPostReadState(manga.name, postId, e.target.checked);
          saveStateToStorage();

          if (e.target.checked) {
            sendBoostyReaction(postId);
            window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: true }, '*');
          } else {
            removeBoostyReaction(postId);
            window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: false }, '*');
          }
          
          const updatedManga = getGroupedTitles().find(t => t.name === manga.name);
          if (updatedManga) {
            const groupCountSpan = header.querySelector('.lf-group-count');
            if (groupCountSpan) {
              groupCountSpan.textContent = `${updatedManga.readCount}/${updatedManga.posts.length}`;
            }
          }
        });
        
        const link = row.querySelector('.lf-chapter-title-link');
        link.addEventListener('click', (e) => {
          if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.classList.contains('lf-liked-checkbox')) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
          }
          
          if (state.settings.openTitlesInCurrentTab) {
            if (e.ctrlKey || e.metaKey || e.button === 1) {
              return;
            }
            e.preventDefault();
            const relativeUrl = chapterUrl.replace('https://boosty.to', '');
            try {
              history.pushState({}, '', relativeUrl);
              window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            } catch (err) {
              window.location.href = chapterUrl;
            }
          }
        });
        
        list.appendChild(row);
      });
    } else {
      titles.forEach(manga => {
        list.appendChild(createMangaRow(manga));
      });
    }
    
    groupContainer.appendChild(header);
    groupContainer.appendChild(list);
    parent.appendChild(groupContainer);
  }

  function clearTitleNovelty(manga) {
    // Новизна хранится по стабильному tagId (фолбэк — имя), плюс старые записи могли
    // храниться по имени. Снимаем по всем возможным ключам тайтла.
    const keys = (typeof manga === 'string'
      ? [manga]
      : [manga && manga.tagId, manga && manga.name]).filter(Boolean);
    if (keys.length === 0) return;
    let changed = false;
    if (Array.isArray(state.newTitles)) {
      const next = state.newTitles.filter(k => !keys.includes(k));
      if (next.length !== state.newTitles.length) { state.newTitles = next; changed = true; }
    }
    if (Array.isArray(state.newChapters)) {
      const next = state.newChapters.filter(k => !keys.includes(k));
      if (next.length !== state.newChapters.length) { state.newChapters = next; changed = true; }
    }
    if (changed) {
      saveStateToStorage();
    }
  }

  // Создание строки тайтла
  function createMangaRow(manga) {
    const row = document.createElement('div');
    row.className = 'lf-manga-row';
    const isNewTab = state.ui.activeTab === 'new';
    
    row.innerHTML = `
      <div class="lf-manga-info">
        <div class="lf-status-dot lf-${manga.statusColor}" title="${getStatusTooltip(manga.statusColor)}"></div>
        <span class="lf-manga-title" title="${escapeHtml(manga.name === 'Объявления' ? tCategory(manga.name) : manga.name)}">${escapeHtml(manga.name === 'Объявления' ? tCategory(manga.name) : manga.name)}</span>
      </div>
      <div class="lf-manga-meta ${isNewTab ? 'lf-has-delete' : ''}">
        <span class="lf-manga-progress">${manga.readCount}/${manga.posts.length}</span>
        ${isNewTab ? `
          <button class="lf-manga-delete-new-btn" title="${t('btn_clear_all_new') /* или используем локализацию или кастомную подсказку */}">
            <svg viewBox="0 0 24 24">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
            </svg>
          </button>
        ` : ''}
      </div>
    `;
    
    row.addEventListener('click', () => {
      state.ui.activeTitle = manga.name;
      if (manga.name === 'Объявления') {
        state.ui.sortAsc = false;
      }
      clearTitleNovelty(manga);
      render();
    });

    if (isNewTab) {
      const deleteBtn = row.querySelector('.lf-manga-delete-new-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTitleNovelty(manga);
          render();
        });
      }
    }
    
    return row;
  }

  // -------------------------------------------------------------
  // ОТРИСОВКА ДЕТАЛЬНОГО ВИДА ТАЙТЛА
  // -------------------------------------------------------------
  function renderDetailContent() {
    const container = document.getElementById('lf-body-content');
    if (!container) return;
    
    const manga = getGroupedTitles().find(t => t.name === state.ui.activeTitle);
    if (!manga) {
      state.ui.activeTitle = null;
      render();
      return;
    }
    
    // Формируем правильную ссылку на тег (используя ID тега, если он есть)
    const tagUrl = manga.tagId 
      ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
      : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
      
    const targetAttr = state.settings.openTitlesInCurrentTab ? '' : 'target="_blank"';
    const isAnnouncements = manga.name === 'Объявления';
    
    container.innerHTML = `
      <div class="lf-detail">
        <!-- Кнопка Назад -->
        <div class="lf-detail-back" id="lf-detail-back">
          <svg viewBox="0 0 24 24">
            <path d="M20,11H7.83L13.41,5.41L12,4L4,12L12,20L13.41,18.59L7.83,13H20V11Z" />
          </svg>
          ${t('detail_back_btn')}
        </div>
        
        <!-- Заголовок -->
        <h2 class="lf-detail-title">
          ${isAnnouncements 
            ? `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(tCategory(manga.name))}</span>`
            : `<a class="lf-detail-title-link" href="${tagUrl}" ${targetAttr} title="${t('detail_title_tag_tooltip')}">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(manga.name)}</span>
                <svg viewBox="0 0 24 24">
                  <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                </svg>
              </a>`
          }
        </h2>
        
        <div class="lf-detail-category">${manga.category ? escapeHtml(tCategory(manga.category)) : t('detail_category_undefined')}</div>
        
        <!-- Статус -->
        ${isAnnouncements ? '' : `
          <div class="lf-status-container">
            <span class="lf-field-label">${t('detail_tracking_status_label')}</span>
            <select class="lf-status-select" id="lf-status-select">
              <option value="favorite" ${manga.status === 'favorite' ? 'selected' : ''}>${t('detail_status_favorite')}</option>
              <option value="watching" ${manga.status === 'watching' ? 'selected' : ''}>${t('detail_status_watching')}</option>
              <option value="completed" ${manga.status === 'completed' ? 'selected' : ''}>${t('detail_status_completed')}</option>
              <option value="dropped" ${manga.status === 'dropped' ? 'selected' : ''}>${t('detail_status_dropped')}</option>
              <option value="none" ${manga.status === 'none' ? 'selected' : ''}>${t('detail_status_none')}</option>
            </select>
          </div>
        `}
        
        <!-- Блокнот -->
        <div class="lf-notes-container">
          <span class="lf-field-label">${t('detail_notes_label')}</span>
          <textarea class="lf-notes-textarea" id="lf-notes-textarea" placeholder="${t('detail_notes_placeholder')}">${escapeHtml(manga.notes)}</textarea>
        </div>
        
        <!-- Раздел глав -->
        <div>
          <div class="lf-chapters-header">
            <span class="lf-field-label">${t('detail_chapters_count_label', manga.readCount, manga.posts.length)}</span>
            <button class="lf-sort-btn" id="lf-sort-btn">
              <svg viewBox="0 0 24 24" style="transform: ${state.ui.sortAsc ? 'none' : 'rotate(180deg)'}">
                <path d="M10,18H14V16H10V18M3,6V8H21V6H3M6,13H18V11H6V13Z" />
              </svg>
              ${state.ui.sortAsc ? t('detail_chapters_sort_oldest') : t('detail_chapters_sort_newest')}
            </button>
          </div>
          
          <div class="lf-chapters-list" id="lf-chapters-list" style="margin-top: 10px;">
            <!-- Список постов рендерится ниже -->
          </div>
        </div>
      </div>
    `;

    // Подключение событий
    document.getElementById('lf-detail-back').addEventListener('click', () => {
      state.ui.activeTitle = null;
      render();
    });
    
    // Изменение статуса
    const statusSelect = document.getElementById('lf-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        const userData = ensureUserData(manga.name);
        userData.status = newStatus;
        userData.updatedAt = Date.now();
        saveStateToStorage();
        
        // Показываем уведомление о переносе тайтла
        if (newStatus !== 'none') {
          showNotification(t('notify_title_moved', t('status_' + newStatus)));
        }
      });
    }
    
    // Блокнот
    const notesTextarea = document.getElementById('lf-notes-textarea');
    notesTextarea.addEventListener('input', (e) => {
      const userData = ensureUserData(manga.name);
      userData.notes = e.target.value;
      userData.updatedAt = Date.now();
      debounceSave();
    });
    
    // Сортировка глав
    const sortChaptersBtn = document.getElementById('lf-sort-btn');
    if (sortChaptersBtn) {
      sortChaptersBtn.addEventListener('click', () => {
        state.ui.sortAsc = !state.ui.sortAsc;
        renderDetailContent(); // Перерисовываем полностью
      });
    }

    // SPA-переход при клике на тег в текущей вкладке (без перезагрузки страницы)
    const titleLink = container.querySelector('.lf-detail-title-link');
    if (titleLink) {
      titleLink.addEventListener('click', (e) => {
        // Если открываем в новой вкладке (зажата клавиша Ctrl/Cmd, или средняя кнопка мыши, или настройка "открывать в текущей" выключена)
        if (!state.settings.openTitlesInCurrentTab || e.ctrlKey || e.metaKey || e.button === 1) {
          // Позволяем браузеру выполнить стандартное поведение (открыть в новой вкладке)
          return;
        }
        
        // Отменяем стандартную перезагрузку страницы
        e.preventDefault();
        
        // Получаем путь относительно домена
        const relativeUrl = tagUrl.replace('https://boosty.to', '');
        
        // Делаем плавный SPA-переход
        try {
          history.pushState({}, '', relativeUrl);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        } catch (err) {
          // Если что-то пошло не так, переходим с перезагрузкой
          window.location.href = tagUrl;
        }
      });
    }
    
    // Рендер самих глав
    renderChaptersList(manga);
  }

  // Отрисовка списка глав
  function renderChaptersList(manga) {
    const container = document.getElementById('lf-chapters-list');
    if (!container) return;
    
    // Формируем правильную ссылку на тег (используя ID тега, если он есть)
    const tagUrl = manga.tagId 
      ? `https://boosty.to/lightfoxmanga?postsTagsIds=${manga.tagId}` 
      : `https://boosty.to/lightfoxmanga?media=all&tag=${encodeURIComponent(manga.name)}`;
      
    // Копируем посты для сортировки
    const sortedPosts = [...manga.posts];
    if (!state.ui.sortAsc) {
      sortedPosts.reverse();
    }
    
    container.innerHTML = '';
    const readSet = new Set((manga.readPosts || []).map(String));
    const isAnnouncements = manga.name === 'Объявления';
    
    sortedPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'lf-chapter-row';
      
      const isLiked = state.settings.syncLikes && post.isLiked;
      const isChecked = readSet.has(String(post.id)) || isLiked;
      
      const dateStr = formatDate(post.publishTime);
      
      let chapterUrl;
      let targetAttr;

      if (state.settings.openChaptersInFeed && !isAnnouncements) {
        chapterUrl = `${tagUrl}#post-${post.id}`;
        targetAttr = state.settings.openTitlesInCurrentTab ? '' : 'target="_blank"';
      } else {
        chapterUrl = `https://boosty.to/lightfoxmanga/posts/${post.id}`;
        targetAttr = state.settings.openTitlesInCurrentTab ? '' : 'target="_blank"';
      }

      const progress = getPlayerProgressForPost(String(post.id));
      const hasProgress = progress && typeof progress.time === 'number';
      let progressHtml = '';
      if (hasProgress && !isChecked) {
        const timeStr = formatSeconds(progress.time);
        if (typeof progress.duration === 'number' && progress.duration > 0) {
          const durationStr = formatSeconds(progress.duration);
          progressHtml = `<span class="lf-chapter-player-progress" title="${escapeHtml(t('player_progress_tooltip'))}">
            <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
            ${escapeHtml(t('player_progress_watched', timeStr, durationStr))}
          </span>`;
        } else {
          progressHtml = `<span class="lf-chapter-player-progress" title="${escapeHtml(t('player_progress_tooltip'))}">
            <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
            ${escapeHtml(t('player_progress_stopped', timeStr))}
          </span>`;
        }
      }

      row.innerHTML = `
        <input type="checkbox" class="lf-chapter-checkbox ${isLiked ? 'lf-liked-checkbox' : ''}" data-post-id="${post.id}" ${isChecked ? 'checked' : ''} ${isLiked ? `title="${escapeHtml(t('post_liked_on_boosty'))}"` : ''}>
        <div class="lf-chapter-title-container">
          <a class="lf-chapter-title-link" href="${chapterUrl}" ${targetAttr} title="${escapeHtml(post.title === 'Без названия' ? t('untitled_post') : post.title)}">
            ${escapeHtml(post.title === 'Без названия' ? t('untitled_post') : post.title)}
          </a>
          ${progressHtml}
        </div>
        <span class="lf-chapter-date">${dateStr}</span>
      `;
      
      // Клик по чекбоксу
      const checkbox = row.querySelector('.lf-chapter-checkbox');
      checkbox.addEventListener('change', (e) => {
        // Мы больше не блокируем снятие галочки для пролайканных постов
        if (e.target.classList.contains('lf-liked-checkbox') && !e.target.checked) {
          e.target.classList.remove('lf-liked-checkbox');
        } else if (e.target.checked) {
          e.target.classList.add('lf-liked-checkbox');
        }

        const postId = String(e.target.dataset.postId);
        const hasProg = getPlayerProgressForPost(postId) !== null;
        if (e.target.checked) {
          const progressEl = row.querySelector('.lf-chapter-player-progress');
          if (progressEl) progressEl.style.display = 'none';
        } else {
          if (hasProg) {
            let progressEl = row.querySelector('.lf-chapter-player-progress');
            if (!progressEl) {
              const prog = getPlayerProgressForPost(postId);
              if (prog && typeof prog.time === 'number') {
                const container = row.querySelector('.lf-chapter-title-container');
                if (container) {
                  progressEl = document.createElement('span');
                  progressEl.className = 'lf-chapter-player-progress';
                  progressEl.title = t('player_progress_tooltip');
                  const timeStr = formatSeconds(prog.time);
                  const durationStr = (typeof prog.duration === 'number' && prog.duration > 0) ? formatSeconds(prog.duration) : null;
                  const text = durationStr ? t('player_progress_watched', timeStr, durationStr) : t('player_progress_stopped', timeStr);
                  progressEl.innerHTML = `
                    <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
                    ${text}
                  `;
                  container.appendChild(progressEl);
                }
              }
            }
            if (progressEl) progressEl.style.display = '';
          }
        }
        
        setPostReadState(manga.name, postId, e.target.checked);
        saveStateToStorage();

        // Отправляем прямой запрос на обновление лайка на сервере Boosty
        if (e.target.checked) {
          sendBoostyReaction(postId);
          // Дополнительно отправляем запрос в page_script.js для визуального обновления DOM
          window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: true }, '*');
        } else {
          removeBoostyReaction(postId);
          // Дополнительно отправляем запрос в page_script.js для визуального обновления DOM
          window.postMessage({ type: 'LF_TOGGLE_LIKE_DOM', postId, isLiked: false }, '*');
        }
        
        // Обновляем циферки прогресса в заголовке
        const updatedManga = getGroupedTitles().find(t => t.name === manga.name);
        if (updatedManga) {
          const headerLabel = document.querySelector('.lf-chapters-header .lf-field-label');
          if (headerLabel) {
            headerLabel.textContent = t('detail_chapters_count_label', updatedManga.readCount, updatedManga.posts.length);
          }
        }
      });
      
      // Клик по ссылке на главу
      const link = row.querySelector('.lf-chapter-title-link');
      link.addEventListener('click', (e) => {
        // Автоматическое помечание как просмотренного при переходе по ссылке
        if (state.settings.autoMarkOpen && !checkbox.checked && !checkbox.classList.contains('lf-liked-checkbox')) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change'));
        }

        // SPA-переход, если включен openTitlesInCurrentTab
        const shouldSpa = state.settings.openTitlesInCurrentTab;
        if (shouldSpa) {
          // Исключаем открытие в новой вкладке (Ctrl/Cmd/средний клик)
          if (e.ctrlKey || e.metaKey || e.button === 1) {
            return;
          }
          e.preventDefault();
          
          const relativeUrl = chapterUrl.replace('https://boosty.to', '');
          try {
            history.pushState({}, '', relativeUrl);
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
          } catch (err) {
            window.location.href = chapterUrl;
          }
        }
      });
      
      container.appendChild(row);
    });
  }

  // Изменение порядка вкладок
  function moveTab(index, direction) {
    const newOrder = [...state.settings.tabOrder];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newOrder.length) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;
      
      state.settings.tabOrder = newOrder;
      saveStateToStorage();
      render();
    }
  }

  // Изменение порядка вкладок с помощью Drag and Drop
  function dragAndDropReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const newOrder = [...state.settings.tabOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    
    state.settings.tabOrder = newOrder;
    saveStateToStorage();
    render();
  }


export {
  render,
  renderListContent,
  renderDetailContent,
  renderSettingsContent,
  renderAboutContent,
  renderGroup,
  renderChaptersList,
  createMangaRow,
  createSidebar,
  createTriggerButton,
  detectAndApplyTheme,
  showNotification,
  debounceSave,
  clearTitleNovelty,
  moveTab,
  dragAndDropReorder,
  setSidebarDeps,
  cleanupHeaderObserver
};
