/* ui/templates.js — Чистые HTML-шаблоны интерфейса (без побочных эффектов).
 * Функции только читают состояние/локаль и возвращают строку разметки;
 * никаких обращений к DOM, хранилищу или мутаций state. */

import { t } from '../locales.js';
import { BOOKMARK_SVG_PATH, TAB_NAMES, getUsdtAddress, escapeHtml } from '../utils.js';
import { state } from '../state.js';

// Иконка кнопки-триггера (закладка с молнией)
function triggerButtonIcon() {
  return `<svg viewBox="550 450 850 1020"><path fill="#ffffff" d="${BOOKMARK_SVG_PATH}" /></svg>`;
}

// Оверлей загрузки на время полной синхронизации
function sidebarLoadingTemplate() {
  return `
        <div class="lf-loading-overlay">
          <div class="lf-spinner"></div>
          <div class="lf-loading-text">${t('loading_db')}<br>${t('loading_page', Math.round(state.ui.syncProgress / 7))}</div>
          <div class="lf-loading-progress">
            <div class="lf-loading-progress-bar" style="width: ${state.ui.syncProgress}%"></div>
          </div>
          <div style="font-size: 11px; color: var(--lf-text-muted);">${t('loading_once_notice')}</div>
        </div>
      `;
}

// Каркас сайдбара: хедер (логотип, кнопки настроек/синхронизации/закрытия),
// статистика, строка поиска с сортировкой, вкладки и контейнер контента
function sidebarShellTemplate(uniqueTagCount) {
  return `
      <div class="lf-header">
        <div class="lf-header-top">
          <div class="lf-title-container">
            <svg class="lf-logo" viewBox="550 450 850 1020">
              <defs>
                <linearGradient id="boostyGradient" gradientUnits="userSpaceOnUse" x1="1379" y1="266" x2="538" y2="2653">
                  <stop offset="0" style="stop-color:#EE7829"/>
                  <stop offset="0.2792" style="stop-color:#EF692A"/>
                  <stop offset="0.6279" style="stop-color:#F05E2C"/>
                  <stop offset="1" style="stop-color:#F05A2C"/>
                </linearGradient>
              </defs>
              <!-- оранжевая подложка под молнию -->
              <rect class="lf-logo-rect" x="700" y="500" width="450" height="630" fill="url(#boostyGradient)" />
              <!-- белая закладка с вырезанной молнией -->
              <path class="lf-logo-path" fill="#ffffff" d="${BOOKMARK_SVG_PATH}" />
            </svg>
            <h1 class="lf-title">Boosty Bookmark</h1>
          </div>
          <div class="lf-header-buttons">
            <!-- Кнопка настроек -->
            <button id="lf-settings-btn" class="lf-btn-icon ${state.ui.activeTab === 'settings' ? 'lf-active' : ''}" title="${t('settings_btn_tooltip')}">
              <svg viewBox="0 0 24 24">
                <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.34 14.86,5.08L14.47,2.42C14.43,2.18 14.22,2 13.97,2H9.97C9.72,2 9.51,2.18 9.47,2.42L9.08,5.08C8.47,5.34 7.9,5.66 7.38,6.05L4.89,5.05C4.67,4.96 4.4,5.05 4.28,5.27L2.28,8.73C2.16,8.95 2.21,9.22 2.4,9.37L4.51,11C4.47,11.34 4.45,11.67 4.45,12C4.45,12.33 4.47,12.65 4.51,12.97L2.4,14.63C2.21,14.78 2.16,15.05 2.28,15.27L4.28,18.73C4.4,18.95 4.67,19.04 4.89,18.95L7.38,17.95C7.9,18.34 8.47,18.66 9.08,18.92L9.47,21.58C9.51,21.82 9.72,22 9.97,22H13.97C14.22,22 14.43,21.82 14.47,21.58L14.86,18.92C15.47,18.66 16.04,18.34 16.56,17.95L19.05,18.95C19.27,19.04 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
              </svg>
            </button>
            <!-- Кнопка синхронизации -->
            <button id="lf-sync-btn" class="lf-btn-icon" title="${t('sync_btn_tooltip')}">
              <svg viewBox="0 0 24 24">
                <path d="M19,8L15,12H18A6,6 0 0,1 12,18C11,18 10.1,17.65 9.35,17L7.9,18.45C9,19.45 10.45,20 12,20A8,8 0 0,0 20,12H23L19,8M6,12A6,6 0 0,1 12,6C13,6 13.9,6.35 14.65,7L16.1,5.55C15,4.55 13.55,4 12,4A8,8 0 0,0 4,12H1L5,16L9,12H6Z" />
              </svg>
            </button>
            <!-- Кнопка закрытия -->
            <button id="lf-close-btn" class="lf-btn-icon" title="${t('close_btn_tooltip')}">
              <svg viewBox="0 0 24 24">
                <path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="lf-stats">${t('header_titles')}${uniqueTagCount}${t('header_posts')}${state.posts.length}</div>
        
        <!-- Строка поиска (отображается только в списке и не на вкладке настроек) -->
        ${(!state.ui.activeTitle && state.ui.activeTab !== 'settings') ? `
          <div class="lf-search-row">
            <div class="lf-search-container">
              <svg class="lf-search-icon" viewBox="0 0 24 24">
                <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
              </svg>
              <input type="text" id="lf-search" class="lf-search-input" placeholder="${t('search_placeholder')}" value="${escapeHtml(state.ui.searchQuery)}">
              <button id="lf-search-clear" class="lf-search-clear-btn" style="${state.ui.searchQuery ? 'display: flex;' : 'display: none;'}" title="${t('search_clear_tooltip')}">
                <svg viewBox="0 0 24 24">
                  <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                </svg>
              </button>
            </div>
            
            <!-- Сортировка тайтлов -->
            <div class="lf-dropdown" id="lf-sort-dropdown-container">
              <button id="lf-sort-btn" class="lf-btn-icon" title="${t('sort_btn_tooltip')}">
                <svg viewBox="0 0 24 24">
                  <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
                </svg>
              </button>
              <div class="lf-dropdown-content" id="lf-sort-dropdown" style="right: 0; min-width: 190px;">
                <button class="lf-dropdown-item ${state.settings.titleSort === 'name_asc' ? 'lf-active' : ''}" data-sort="name_asc">${t('sort_name_asc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'name_desc' ? 'lf-active' : ''}" data-sort="name_desc">${t('sort_name_desc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'new_desc' ? 'lf-active' : ''}" data-sort="new_desc">${t('sort_new_desc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'new_asc' ? 'lf-active' : ''}" data-sort="new_asc">${t('sort_new_asc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'chapters_desc' ? 'lf-active' : ''}" data-sort="chapters_desc">${t('sort_chapters_desc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'chapters_asc' ? 'lf-active' : ''}" data-sort="chapters_asc">${t('sort_chapters_asc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'progress_desc' ? 'lf-active' : ''}" data-sort="progress_desc">${t('sort_progress_desc')}</button>
                <button class="lf-dropdown-item ${state.settings.titleSort === 'progress_asc' ? 'lf-active' : ''}" data-sort="progress_asc">${t('sort_progress_asc')}</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Вкладки (только в списке) -->
      ${!state.ui.activeTitle ? `
        <div class="lf-tabs">
          ${state.settings.tabOrder.filter(tabKey => tabKey !== 'completed' && tabKey !== 'dropped').map(tabKey => {
            const isNewTab = tabKey === 'new';
            const count = isNewTab ? ((state.newTitles ? state.newTitles.length : 0) + (state.newChapters ? state.newChapters.length : 0)) : 0;
            const badgeHtml = count > 0 ? ` <span class="lf-tab-badge">${count}</span>` : '';
            return `<button class="lf-tab-btn ${state.ui.activeTab === tabKey ? 'lf-active' : ''}" data-tab="${tabKey}">${TAB_NAMES[tabKey] || tabKey}${badgeHtml}</button>`;
          }).join('')}
          <div class="lf-dropdown">
            <button id="lf-archive-btn" class="lf-tab-btn lf-dropdown-trigger ${['completed', 'dropped'].includes(state.ui.activeTab) ? 'lf-active' : ''}">
              ${state.ui.activeTab === 'dropped' ? t('tab_dropped') : (state.ui.activeTab === 'completed' ? t('tab_completed') : t('tab_archive'))} <span class="lf-arrow">▼</span>
            </button>
            <div class="lf-dropdown-content" id="lf-archive-dropdown">
              <button class="lf-dropdown-item ${state.ui.activeTab === 'completed' ? 'lf-active' : ''}" data-tab="completed">${t('tab_completed')}</button>
              <button class="lf-dropdown-item ${state.ui.activeTab === 'dropped' ? 'lf-active' : ''}" data-tab="dropped">${t('tab_dropped')}</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="lf-body-content" id="lf-body-content">
        <!-- Сюда рендерится динамическое содержимое -->
      </div>
    `;
}

// Модальное окно с реквизитами USDT (TRC-20)
function usdtModalTemplate() {
  return `
            <div class="lf-modal-content">
              <div class="lf-modal-header">
                <h3 class="lf-modal-title">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-1H9v-2h4v-1H9c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h2V6h2v1h2v2h-4v1h4c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-2v1z"/>
                  </svg>
                  ${t('about_support_usdt_modal_title')}
                </h3>
                <button id="lf-modal-close-btn" class="lf-modal-close">&times;</button>
              </div>
              <div class="lf-modal-body">
                <div class="lf-modal-qr-container" style="cursor: pointer;" title="${t('about_support_usdt_modal_double_click_tooltip')}">
                  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMYAAADGAQAAAACh4MLwAAABn0lEQVR4nO2YQYobQQxFX7UavKyGHMBHkW9mfLPqo8wBBtRLg8zPouwwkAmELDJajFbVaPOR9L++uonP47H8IQHfGUABYOF0ScM0C+lZAptLMo3EFU6XSYoK2Fag4YBpf2xwXDg2e6/Q01fmuLbNV7D4KgS/x/p67LDb+3b/EWslbIIVLPbHWY0LXRwVsC2wt9bAOa72drHg0VrbKmBDM8ITNw17fqsAT1G4wpks6JpyV0NDFvoNkEZ2Kfa1K/EyPR2mwVwQfdizhhXqhjQSzz7oI8EC06gxbwtgGqe3qwUWnpBTWb4e2+TpyD4sAM9eZ9cvHO2xcQroyj5OQXZZ1KjbdEfTgQSSgBrzNrmASaZhGrO/2WtgC588VXgCXYBVqZsU/rJGrkBSDX1bgBUSFEi3dh4r+30rwgWyjzlvChLAKTJvLx9i8dxZCqpgC3ha8bkU3KKID/lwZ3XRx6RDDQ153VnHhb4Due4NTlmEC850vOEKrJiGAOD3861t/iikIb/urP3S0bHleslG/kcEf8NTk/iwuQr0tH3/4/qnzE8LUjn+ePnLogAAAABJRU5ErkJggg==" alt="USDT QR Code" />
                </div>

                <div class="lf-modal-info-box">
                  <strong style="color: var(--lf-primary); display: block; margin-bottom: 4px;">${t('about_support_usdt_modal_warning_title')}</strong>
                  <div style="opacity: 0.95; line-height: 1.4;">
                    ${t('about_support_usdt_modal_desc')}
                  </div>
                </div>

                <div class="lf-modal-info-box lf-modal-danger-box">
                  <strong style="color: #d32f2f; display: block; margin-bottom: 4px;">${t('about_support_usdt_modal_verify_title')}</strong>
                  <div style="opacity: 0.95; line-height: 1.4;">
                    ${t('about_support_usdt_modal_verify_desc')}
                  </div>
                </div>

                <div class="lf-modal-address-block">
                  <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;">
                    <div class="lf-modal-address-label">${t('about_support_usdt_modal_address_label')}</div>
                    <div id="lf-modal-address" class="lf-modal-address-value" style="cursor: pointer;" title="${t('about_support_usdt_modal_double_click_tooltip')}">${getUsdtAddress()}</div>
                  </div>
                  <button id="lf-modal-inline-copy-btn" class="lf-modal-inline-copy-btn" title="${t('about_support_usdt_modal_copy_btn')}">
                    <svg viewBox="0 0 24 24">
                      <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                    </svg>
                  </button>
                </div>

                <div style="font-size: 10px; color: var(--lf-text-muted); text-align: center; margin-top: -4px;">
                  ${t('about_support_usdt_modal_memo_not_required')}
                </div>

                <button id="lf-modal-copy-btn" class="lf-modal-copy-btn">
                  <svg viewBox="0 0 24 24">
                    <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                  </svg>
                  <span>${t('about_support_usdt_modal_copy_btn')}</span>
                </button>
              </div>
            </div>
          `;
}

// Экран «О расширении» (информация об авторе, лицензии и блок поддержки)
function aboutContentTemplate(version) {
  return `
      <div class="lf-detail" style="gap: 8px;">
        <div class="lf-detail-back" id="lf-about-back" style="margin-bottom: 4px;">
          <svg viewBox="0 0 24 24">
            <path d="M20,11H7.83L13.41,5.41L12,4L4,12L12,20L13.41,18.59L7.83,13H20V11Z" />
          </svg>
          ${t('about_back_btn')}
        </div>

        <!-- Единая карточка о расширении -->
        <div class="lf-settings-section" style="padding: 10px; display: flex; flex-direction: column; gap: 10px; line-height: 1.5; font-size: 12px;">
          <div>
            <strong style="font-size: 14px; color: var(--lf-text);">Boosty Bookmark</strong>
            <span style="font-size: 10px; color: var(--lf-text-muted); margin-left: 6px;">v${version}</span>
          </div>

          <div style="color: var(--lf-text-muted);">
            ${t('about_desc')}
          </div>

          <div style="border-top: 1px solid var(--lf-border); padding-top: 8px; font-size: 11px; color: var(--lf-text-muted); display: flex; flex-direction: column; gap: 4px; line-height: 1.4;">
            <div>${t('about_author')}<strong style="color: var(--lf-text);">Akai</strong></div>
            <div>${t('about_license')}<strong style="color: var(--lf-text);">MIT</strong></div>
            <div>${t('about_privacy')}<strong style="color: var(--lf-text);">${t('about_privacy_desc')}</strong></div>
            <div style="font-size: 10px; margin-top: 2px; font-style: italic; color: var(--lf-text-muted);">${t('about_disclaimer')}</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: var(--lf-text-muted);">
                <path d="M12,2A10,10 0 0,0 2,12C2,16.42 4.87,20.17 8.84,21.5C9.34,21.58 9.5,21.27 9.5,21C9.5,20.77 9.5,20.14 9.5,19.31C6.73,19.91 6.14,17.97 6.14,17.97C5.68,16.81 5.03,16.5 5.03,16.5C4.12,15.88 5.1,15.9 5.1,15.9C6.1,15.97 6.63,16.93 6.63,16.93C7.5,18.45 8.97,18 9.54,17.76C9.63,17.11 9.89,16.67 10.17,16.42C7.95,16.17 5.62,15.31 5.62,11.5C5.62,10.39 6,9.5 6.65,8.79C6.55,8.54 6.2,7.5 6.75,6.15C6.75,6.15 7.59,5.88 9.5,7.17C10.29,6.95 11.15,6.84 12,6.84C12.85,6.84 13.71,6.95 14.5,7.17C16.41,5.88 17.25,6.15 17.25,6.15C17.8,7.5 17.45,8.54 17.35,8.79C18,9.5 18.38,10.39 18.38,11.5C18.38,15.32 16.04,16.16 13.81,16.41C14.17,16.72 14.5,17.33 14.5,18.26C14.5,19.6 14.5,20.68 14.5,21C14.5,21.27 14.66,21.59 15.17,21.5C19.14,20.16 22,16.42 22,12A10,10 0 0,0 12,2Z" />
              </svg>
              <a href="https://github.com/akai2211/boosty-bookmark" target="_blank" style="color: var(--lf-primary); text-decoration: none; font-weight: 600;">${t('about_github')}</a>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: var(--lf-text-muted);">
                <path d="M20,2H4C2.9,2,2,2.9,2,4v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z M12,14c-1.1,0-2-0.9-2-2c0-1.1,0.9-2,2-2s2,0.9,2,2C14,13.1,13.1,14,12,14z M13,9h-2V5h2V9z" />
              </svg>
              <a href="https://boosty.to/akai2211?openChat=true" target="_blank" style="color: var(--lf-primary); text-decoration: none; font-weight: 600;">${t('about_feedback')}</a>
            </div>
          </div>
        </div>

        <!-- Поддержать проект -->
        <div class="lf-settings-section" style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--lf-text-muted);">${t('about_support')}</div>

          <div class="lf-support-grid">
            <!-- Ряд 1: Boosty (Subscribe & News) -->
            <div class="lf-support-row-full">
              <a href="https://boosty.to/akai2211" target="_blank" class="lf-support-btn lf-support-boosty">
                <svg viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                <span>${t('about_support_boosty')}</span>
              </a>
            </div>

            <!-- Ряд 2: USDT (TRC-20) -->
            <div class="lf-support-row-full">
              <div id="lf-support-usdt" class="lf-support-btn lf-support-usdt" data-address="${getUsdtAddress()}">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-1H9v-2h4v-1H9c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h2V6h2v1h2v2h-4v1h4c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-2v1z"/>
                </svg>
                <span>${t('about_support_usdt')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
}

// Подсказка-тултип для индикатора статуса тайтла
function getStatusTooltip(color) {
  switch (color) {
    case 'green': return t('tooltip_completed');
    case 'yellow': return t('tooltip_watching');
    case 'red': return t('tooltip_dropped');
    case 'grey':
    default: return t('tooltip_none');
  }
}

export {
  triggerButtonIcon,
  sidebarLoadingTemplate,
  sidebarShellTemplate,
  usdtModalTemplate,
  aboutContentTemplate,
  getStatusTooltip
};
