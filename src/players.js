/* players.js — Интеграция с медиаплеерами Boosty/VK: автозапоминание времени
 * воспроизведения (audio/video, в т.ч. сквозь Shadow DOM) и принудительное качество. */

import { t } from './locales.js';
import { formatSeconds } from './utils.js';
import { state, saveStateToStorage } from './state.js';

  // Рекурсивный поиск родительского элемента с поддержкой прохода сквозь границы Shadow DOM
  function getClosestElement(element, selector) {
    let current = element;
    while (current) {
      if (current instanceof Element && current.matches(selector)) {
        return current;
      }
      let parent = current.parentElement;
      if (!parent) {
        const root = current.getRootNode();
        if (root && root instanceof ShadowRoot) {
          parent = root.host;
        }
      }
      current = parent;
    }
    return null;
  }

  // Получение ID поста, в котором находится плеер
  function getPostIdForPlayer(player) {
    const postNode = getClosestElement(player, '[class*="Post-scss--module_root"]');
    if (postNode) {
      const link = postNode.querySelector('a[href*="/posts/"]');
      if (link) {
        const match = link.href.match(/posts\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      }
    }
    const urlMatch = window.location.pathname.match(/posts\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }

  // Получение прогресса плеера для конкретного поста
  function getPlayerProgressForPost(postId) {
    if (!state.playerTimestamps) return null;
    for (const key in state.playerTimestamps) {
      const entry = state.playerTimestamps[key];
      if (entry && typeof entry === 'object' && entry.postId === postId) {
        return entry;
      }
      if (key === `video_post_${postId}`) {
        if (typeof entry === 'number') {
          return { time: entry };
        } else if (typeof entry === 'object') {
          return entry;
        }
      }
    }
    return null;
  }

  // Обновление прогресса главы в интерфейсе сайдбара
  function updateChapterProgressInUI(postId, time, duration) {
    const checkbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postId}"]`);
    if (!checkbox) return;
    const row = checkbox.closest('.lf-chapter-row');
    if (!row) return;
    
    const container = row.querySelector('.lf-chapter-title-container');
    if (!container) return;
    
    let progressEl = container.querySelector('.lf-chapter-player-progress');
    const timeStr = formatSeconds(time);
    const durationStr = duration > 0 ? formatSeconds(duration) : null;
    const text = durationStr ? t('player_progress_watched', timeStr, durationStr) : t('player_progress_stopped', timeStr);
    
    if (progressEl) {
      progressEl.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
        ${text}
      `;
    } else {
      progressEl = document.createElement('span');
      progressEl.className = 'lf-chapter-player-progress';
      progressEl.title = t('player_progress_tooltip');
      progressEl.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z" /></svg>
        ${text}
      `;
      container.appendChild(progressEl);
    }

    if (checkbox.checked) {
      progressEl.style.display = 'none';
    } else {
      progressEl.style.display = '';
    }
  }

  // Получение уникального ключа плеера
  function getPlayerUniqueId(player) {
    if (player.tagName === 'AUDIO') {
      const src = player.getAttribute('src');
      if (src) {
        try {
          const url = new URL(src);
          return 'audio_' + url.pathname.split('/').pop();
        } catch (e) {
          return 'audio_' + src;
        }
      }
    } else if (player.tagName === 'VIDEO') {
      const playerWrapper = getClosestElement(player, '.player-wrapper, [class*="VideoPlayer_root"], [data-video-id], vk-video-player');
      if (playerWrapper) {
        const videoId = playerWrapper.getAttribute('data-video-id');
        if (videoId) return 'video_' + videoId;
      }
      const postNode = getClosestElement(player, '[class*="Post-scss--module_root"]');
      if (postNode) {
        const link = postNode.querySelector('a[href*="/posts/"]');
        if (link) {
          const match = link.href.match(/posts\/([a-zA-Z0-9_-]+)/);
          if (match) return 'video_post_' + match[1];
        }
      }
      const src = player.getAttribute('src');
      if (src) return 'video_src_' + src;
    }
    return null;
  }

  // Настройка слушателей на конкретный плеер
  function trackPlayerProgress(player) {
    if (!state.settings.savePlayerTime) return;

    setTimeout(() => {
      const uniqueId = getPlayerUniqueId(player);
      if (!uniqueId) return;

      const saved = state.playerTimestamps[uniqueId];
      let savedTime = null;
      if (saved) {
        if (typeof saved === 'number') {
          savedTime = saved;
        } else if (typeof saved === 'object' && typeof saved.time === 'number') {
          savedTime = saved.time;
        }
      }
      if (savedTime !== null && typeof savedTime === 'number') {
        if (player.currentTime < 1) {
          player.currentTime = savedTime;
        }
      }

      let previouslySavedTimestamp = savedTime || 0;

      const saveTimestamp = () => {
        if (!state.settings.savePlayerTime) return;
        
        const currentTimestamp = player.currentTime;
        const duration = player.duration;
        
        if (duration <= 60) return;
        if (Math.abs(currentTimestamp - previouslySavedTimestamp) < 10) return;
        if (currentTimestamp <= 10 || (duration && duration - currentTimestamp <= 10)) return;

        const postId = getPostIdForPlayer(player);

        state.playerTimestamps[uniqueId] = {
          time: currentTimestamp,
          duration: duration,
          postId: postId,
          updatedAt: Date.now()
        };
        previouslySavedTimestamp = currentTimestamp;
        saveStateToStorage();
        if (postId) {
          updateChapterProgressInUI(postId, currentTimestamp, duration);
        }
      };

      player.addEventListener('timeupdate', saveTimestamp);
      player.addEventListener('pause', saveTimestamp);
      
      player.addEventListener('ended', () => {
        if (!state.settings.savePlayerTime) return;
        if (state.playerTimestamps[uniqueId]) {
          delete state.playerTimestamps[uniqueId];
          saveStateToStorage();
        }
        const postId = getPostIdForPlayer(player);
        if (postId) {
          const checkbox = document.querySelector(`.lf-chapter-checkbox[data-post-id="${postId}"]`);
          if (checkbox) {
            const row = checkbox.closest('.lf-chapter-row');
            if (row) {
              const progressEl = row.querySelector('.lf-chapter-player-progress');
              if (progressEl) progressEl.remove();
            }
          }
        }
      });
    }, 1000);
  }

  /**
   * Передаёт настройку принудительного качества в page_script.js (main world).
   * Сам выбор качества делается там через подмену localStorage-ключа
   * `vk_player_preferred_quality`, который VK-плеер читает при инициализации
   * (кнопку настроек плеера нельзя открыть программно — нужен trusted-клик).
   * Качество применяется к видео, открываемым ПОСЛЕ установки настройки.
   */
  function sendVideoQualityPref() {
    try {
      window.postMessage({
        type: 'LF_SET_QUALITY_PREF',
        enabled: !!state.settings.forceVideoQuality,
        value: state.settings.forceVideoQuality ? (state.settings.videoQuality || 'auto') : 'auto'
      }, '*');
    } catch (e) {}
  }

  // Поиск новых плееров на странице
  function initPlayerTracking() {
    if (state.settings.savePlayerTime) {
      const mediaPlayers = document.querySelectorAll('audio, video');
      mediaPlayers.forEach(player => {
        if (!player.dataset.lfTracked) {
          player.dataset.lfTracked = 'true';
          trackPlayerProgress(player);
        }
      });
    }

    const vkPlayerContainers = document.querySelectorAll('vk-video-player .shadow-root-container');
    vkPlayerContainers.forEach(container => {
      // Инициализация сохранения прогресса для видео
      if (state.settings.savePlayerTime && !container.dataset.lfTracked) {
        if (container.shadowRoot) {
          const shadowVideo = container.shadowRoot.querySelector('video');
          if (shadowVideo) {
            container.dataset.lfTracked = 'true';
            shadowVideo.dataset.lfTracked = 'true';
            trackPlayerProgress(shadowVideo);
          }
        }
      }
    });
  }


export {
  getPlayerProgressForPost,
  initPlayerTracking,
  sendVideoQualityPref
};
