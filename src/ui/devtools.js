/* ui/devtools.js — Панель разработчика (DEV-only). Весь модуль вырезается из
 * релизной сборки tree-shaking'ом: все точки входа в content.js гейтятся if (DEV),
 * поэтому экспорты остаются без ссылок при DEV=false. */

import { isExtensionContextValid } from '../utils.js';
import { state, saveStateToStorage } from '../state.js';
import { performIncrementalSync } from '../sync.js';
import { render, showNotification } from './sidebar.js';

// Внешняя зависимость formatSyncDate остаётся в content.js — внедряется через setDevtoolsDeps().
let formatSyncDate = () => '';
function setDevtoolsDeps(d) {
  if (d.formatSyncDate) formatSyncDate = d.formatSyncDate;
}

  let devSettings = {
    enabled: false,
    cutoffDate: '',
    hideAboutAuthor: true,
    alwaysShowReactions: true
  };

  function loadDevSettings() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.get(['lf_dev_settings'], (res) => {
          if (chrome.runtime.lastError) { resolve(); return; }
          const saved = res['lf_dev_settings'] || {};
          devSettings.enabled = saved.enabled !== undefined ? !!saved.enabled : false;
          devSettings.cutoffDate = saved.cutoffDate || '';
          devSettings.hideAboutAuthor = saved.hideAboutAuthor !== undefined ? !!saved.hideAboutAuthor : true;
          devSettings.alwaysShowReactions = saved.alwaysShowReactions !== undefined ? !!saved.alwaysShowReactions : true;
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function saveDevSettings() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) { resolve(); return; }
      try {
        chrome.storage.local.set({ 'lf_dev_settings': devSettings }, () => {
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  let devSidebarOpen = true;
  let devReactionsIntervalId = null;

  function isReactionElement(el) {
    if (!el) return false;
    let current = el;
    while (current && current !== document.body) {
      if (current.getAttribute && current.getAttribute('data-test-id') === 'COMMON_REACTIONS_REACTIONSPOST:ROOT') {
        return true;
      }
      if (current.classList && (
        Array.from(current.classList).some(cls => 
          cls.includes('ReactionSelector') || 
          cls.includes('TooltipContent') || 
          cls.includes('ReactionsPost') || 
          cls.includes('ReactionButton') ||
          cls.includes('Reaction')
        )
      )) {
        return true;
      }
      if (current.getAttribute && current.getAttribute('role') === 'tooltip') {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function handleReactionLeave(e) {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      if (isReactionElement(e.target) || isReactionElement(e.relatedTarget) || e.relatedTarget === null || e.toElement === null) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }
  }

  function handleGlobalClick(e) {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      setTimeout(autoOpenReactions, 150);
    }
  }

  let devScrollTimeout = null;

  function handleDevScroll() {
    if (typeof devSettings !== 'undefined' && devSettings.alwaysShowReactions) {
      if (devScrollTimeout) clearTimeout(devScrollTimeout);
      devScrollTimeout = setTimeout(autoOpenReactions, 150);
    }
  }

  function isPopoverOpenForBtn(btn) {
    // 1. Проверка по aria-describedby
    const popoverHolder = btn.hasAttribute('aria-describedby') ? btn : btn.querySelector('[aria-describedby]');
    const popoverId = popoverHolder ? popoverHolder.getAttribute('aria-describedby') : null;
    if (popoverId && document.getElementById(popoverId)) {
      return true;
    }

    // 2. Геометрическая проверка (поиск по близости открытого попапа в DOM)
    const popover = document.querySelector('[class*="ReactionSelector"], [class*="TooltipContent"]');
    if (!popover) return false;

    const btnRect = btn.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    const btnCenterX = btnRect.left + btnRect.width / 2;
    const popoverCenterX = popoverRect.left + popoverRect.width / 2;
    const distanceX = Math.abs(btnCenterX - popoverCenterX);

    // Если попап по горизонтали близко (в пределах 150px) и по вертикали рядом (в пределах 120px)
    if (distanceX < 150 && Math.abs(btnRect.top - popoverRect.bottom) < 120) {
      return true;
    }

    return false;
  }

  function autoOpenReactions() {
    if (typeof devSettings === 'undefined' || !devSettings.alwaysShowReactions) return;

    const reactionBtns = Array.from(document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]'));
    if (reactionBtns.length === 0) return;

    let bestBtn = null;
    let minDistance = Infinity;
    const centerY = window.innerHeight / 2;

    reactionBtns.forEach(btn => {
      const rect = btn.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const btnCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(btnCenterY - centerY);
        if (distance < minDistance) {
          minDistance = distance;
          bestBtn = btn;
        }
      }
    });

    if (bestBtn) {
      const isOpen = isPopoverOpenForBtn(bestBtn);

      if (!isOpen) {
        // Мягко закрываем другие поповеры на странице
        reactionBtns.forEach(btn => {
          if (btn !== bestBtn) {
            const evt = new MouseEvent('mouseleave', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            btn.dispatchEvent(evt);
          }
        });

        // Открываем активный поповер
        const events = ['pointerenter', 'pointerover', 'mouseenter', 'mouseover'];
        events.forEach(evtName => {
          const evt = new MouseEvent(evtName, {
            bubbles: true,
            cancelable: true,
            view: window
          });
          bestBtn.dispatchEvent(evt);
        });
      }
    }
  }

  function applyDevSettingsEffects() {
    if (devSettings.hideAboutAuthor) {
      document.body.classList.add('lf-dev-hide-about-author');
    } else {
      document.body.classList.remove('lf-dev-hide-about-author');
    }

    if (devSettings.alwaysShowReactions) {
      document.body.classList.add('lf-dev-always-show-reactions');
      
      window.removeEventListener('mouseleave', handleReactionLeave, true);
      window.removeEventListener('mouseout', handleReactionLeave, true);
      window.removeEventListener('pointerleave', handleReactionLeave, true);
      window.removeEventListener('pointerout', handleReactionLeave, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('scroll', handleDevScroll, { passive: true });
      
      window.addEventListener('mouseleave', handleReactionLeave, true);
      window.addEventListener('mouseout', handleReactionLeave, true);
      window.addEventListener('pointerleave', handleReactionLeave, true);
      window.addEventListener('pointerout', handleReactionLeave, true);
      window.addEventListener('click', handleGlobalClick, true);
      window.addEventListener('scroll', handleDevScroll, { passive: true });

      if (!devReactionsIntervalId) {
        devReactionsIntervalId = setInterval(autoOpenReactions, 1000);
      }
      autoOpenReactions();
    } else {
      document.body.classList.remove('lf-dev-always-show-reactions');
      
      if (devReactionsIntervalId) {
        clearInterval(devReactionsIntervalId);
        devReactionsIntervalId = null;
      }
      
      window.removeEventListener('mouseleave', handleReactionLeave, true);
      window.removeEventListener('mouseout', handleReactionLeave, true);
      window.removeEventListener('pointerleave', handleReactionLeave, true);
      window.removeEventListener('pointerout', handleReactionLeave, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('scroll', handleDevScroll, { passive: true });
      
      if (devScrollTimeout) {
        clearTimeout(devScrollTimeout);
        devScrollTimeout = null;
      }

      document.querySelectorAll('[data-test-id="COMMON_REACTIONS_REACTIONSPOST:ROOT"]').forEach(btn => {
        const evt = new MouseEvent('mouseleave', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(evt);
      });
    }
  }

  function initDevTools() {
    createDevTriggerButton();
    createDevSidebar();
    applyDevSettingsEffects();
  }

  function createDevTriggerButton() {
    if (document.getElementById('lf-dev-trigger-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'lf-dev-trigger-btn';
    btn.title = 'DevTools - Панель разработчика';
    btn.innerHTML = '🛠️';
    if (devSidebarOpen) {
      btn.style.display = 'none';
    }

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      devSidebarOpen = !devSidebarOpen;
      const devSidebar = document.getElementById('lf-dev-sidebar');
      if (devSidebar) {
        if (devSidebarOpen) {
          devSidebar.classList.add('lf-open');
          btn.style.display = 'none';
          renderDevSidebarContent();
        } else {
          devSidebar.classList.remove('lf-open');
        }
      }
    });

    document.body.appendChild(btn);
  }

  function createDevSidebar() {
    if (document.getElementById('lf-dev-sidebar')) return;

    const devSidebar = document.createElement('div');
    devSidebar.id = 'lf-dev-sidebar';
    devSidebar.className = 'lf-dark';
    if (devSidebarOpen) {
      devSidebar.classList.add('lf-open');
    }

    devSidebar.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.body.appendChild(devSidebar);
    if (devSidebarOpen) {
      renderDevSidebarContent();
    }
  }

  function renderDevSidebarContent() {
    const devSidebar = document.getElementById('lf-dev-sidebar');
    if (!devSidebar) return;

    const totalPosts = state.posts.length;
    let newestPostDate = 'Нет постов';
    if (totalPosts > 0) {
      const ts = state.posts[0].publishTime;
      newestPostDate = formatSyncDate(ts * 1000);
    }

    devSidebar.innerHTML = `
      <div class="lf-dev-header">
        <h3>Boosty Bookmark DevTools</h3>
        <span class="lf-dev-close">×</span>
      </div>
      <div class="lf-dev-body">
        <div class="lf-dev-section">
          <h4>📊 Статистика</h4>
          <p>Постов в базе: <strong>${totalPosts}</strong></p>
          <p>Последний пост: <small>${newestPostDate}</small></p>
        </div>
        
        <div class="lf-dev-section">
          <h4>📅 Эмуляция даты канала</h4>
          <div class="lf-dev-row">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-enabled" ${devSettings.enabled ? 'checked' : ''}>
              Включить эмуляцию
            </label>
          </div>
          <div class="lf-dev-row">
            <label style="display: block; margin-bottom: 4px;">Дата отсечки:</label>
            <input type="date" id="lf-dev-cutoff-date" style="width: 100%; padding: 6px; box-sizing: border-box; background-color: #2a2a2a; color: #ffffff; border: 1px solid #444; border-radius: 4px; color-scheme: dark;" value="${devSettings.cutoffDate || ''}">
          </div>
          <div class="lf-dev-row" style="margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-hide-about-author" ${devSettings.hideAboutAuthor ? 'checked' : ''}>
              Скрыть блок «Об авторе»
            </label>
          </div>
          <div class="lf-dev-row" style="margin-top: 10px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="lf-dev-always-show-reactions" ${devSettings.alwaysShowReactions ? 'checked' : ''}>
              Всегда раскрывать лайки (меню реакций)
            </label>
          </div>
          <button id="lf-dev-save-btn" class="lf-dev-btn">Сохранить настройки</button>
        </div>

        <div class="lf-dev-section">
          <h4>✂️ Очистка базы данных</h4>
          <button id="lf-dev-crop-btn" class="lf-dev-btn lf-dev-btn-danger">Обрезать посты новее даты</button>
          <p class="lf-dev-help">Удаляет из локальной базы все посты, которые были опубликованы позже выбранной даты отсечки.</p>
        </div>
      </div>
    `;

    devSidebar.querySelector('.lf-dev-close').addEventListener('click', () => {
      devSidebarOpen = false;
      devSidebar.classList.remove('lf-open');
      const devBtn = document.getElementById('lf-dev-trigger-btn');
      if (devBtn) {
        devBtn.style.display = '';
      }
    });

    devSidebar.querySelector('#lf-dev-save-btn').addEventListener('click', async () => {
      const enabledCheckbox = document.getElementById('lf-dev-enabled');
      const cutoffInput = document.getElementById('lf-dev-cutoff-date');
      const hideAboutAuthorCheckbox = document.getElementById('lf-dev-hide-about-author');
      const alwaysShowReactionsCheckbox = document.getElementById('lf-dev-always-show-reactions');
      
      devSettings.enabled = enabledCheckbox.checked;
      devSettings.cutoffDate = cutoffInput.value;
      devSettings.hideAboutAuthor = hideAboutAuthorCheckbox.checked;
      devSettings.alwaysShowReactions = alwaysShowReactionsCheckbox.checked;
      
      if (devSettings.enabled && devSettings.cutoffDate) {
        const cutoffTimeMs = new Date(devSettings.cutoffDate).getTime();
        if (!state.lastVisit || state.lastVisit > cutoffTimeMs) {
          state.lastVisit = cutoffTimeMs - 24 * 60 * 60 * 1000;
        }
      } else {
        state.lastVisit = Date.now();
      }
      state.newTitles = [];
      state.newChapters = [];
      await saveStateToStorage();
      
      await saveDevSettings();
      applyDevSettingsEffects();
      showNotification('Настройки DevTools сохранены!');
      renderDevSidebarContent();
      render(); // перерисовать, чтобы обновить списки во вкладках
      
      // Автоматически запускаем синхронизацию для применения новых настроек отсечки
      performIncrementalSync();
    });

    devSidebar.querySelector('#lf-dev-crop-btn').addEventListener('click', async () => {
      const cutoffInput = document.getElementById('lf-dev-cutoff-date');
      const dateVal = cutoffInput.value;
      if (!dateVal) {
        showNotification('Укажите дату отсечки!');
        return;
      }

      if (!confirm(`Вы уверены, что хотите удалить все локальные посты новее ${dateVal}?`)) {
        return;
      }

      const cutoffTime = new Date(dateVal).getTime() / 1000;
      const originalCount = state.posts.length;
      state.posts = state.posts.filter(p => p.publishTime <= cutoffTime);
      const deletedCount = originalCount - state.posts.length;

      state.collapsedGroups = {};
      
      await saveStateToStorage();
      render();
      renderDevSidebarContent();
      showNotification(`Успешно удалено ${deletedCount} постов!`);
    });
  }


// Полная остановка DevTools: интервалы, слушатели реакций и удаление DOM (вызывается из cleanup())
function cleanupDevTools() {
  if (devReactionsIntervalId) {
    clearInterval(devReactionsIntervalId);
    devReactionsIntervalId = null;
  }
  window.removeEventListener('mouseleave', handleReactionLeave, true);
  window.removeEventListener('mouseout', handleReactionLeave, true);
  window.removeEventListener('pointerleave', handleReactionLeave, true);
  window.removeEventListener('pointerout', handleReactionLeave, true);
  window.removeEventListener('click', handleGlobalClick, true);
  window.removeEventListener('scroll', handleDevScroll, { passive: true });
  if (devScrollTimeout) {
    clearTimeout(devScrollTimeout);
    devScrollTimeout = null;
  }
  const devBtn = document.getElementById('lf-dev-trigger-btn');
  const devSidebar = document.getElementById('lf-dev-sidebar');
  if (devBtn) devBtn.remove();
  if (devSidebar) devSidebar.remove();
}

// Показ DevTools-элементов на целевой странице (вызывается из checkUrlAndToggleVisibility)
function showDevToolsUI() {
  const devBtn = document.getElementById('lf-dev-trigger-btn');
  const devSidebar = document.getElementById('lf-dev-sidebar');
  if (devBtn) devBtn.style.display = devSidebarOpen ? 'none' : '';
  if (devSidebar) {
    devSidebar.style.display = '';
    if (devSidebarOpen) {
      devSidebar.classList.add('lf-open');
    } else {
      devSidebar.classList.remove('lf-open');
    }
  }
}

// Скрытие DevTools-элементов вне целевой страницы (вызывается из checkUrlAndToggleVisibility)
function hideDevToolsUI() {
  const devBtn = document.getElementById('lf-dev-trigger-btn');
  const devSidebar = document.getElementById('lf-dev-sidebar');
  if (devBtn) devBtn.style.display = 'none';
  if (devSidebar) {
    devSidebar.style.display = 'none';
    devSidebar.classList.remove('lf-open');
  }
}

export {
  devSettings,
  setDevtoolsDeps,
  loadDevSettings,
  saveDevSettings,
  applyDevSettingsEffects,
  initDevTools,
  cleanupDevTools,
  showDevToolsUI,
  hideDevToolsUI
};
