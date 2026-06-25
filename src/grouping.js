/* grouping.js — Группировка постов по тайтлам (тегам) и вычисление прогресса.
   Импортирует только state/utils — самодостаточный модуль данных, без dep-инъекций. */

import { TAGS_BLACKLIST } from './utils.js';
import { state, saveStateToStorage } from './state.js';
import { mergeReadState } from './webdav-sync.js';

// Группировка постов по тайтлам (тегам)
function getGroupedTitles() {
  return getGroupedTitlesInternal(state.posts);
}

function getGroupedTitlesInternal(posts) {
  const titlesMap = {};
  const tagNamesMap = {};
  const postNamesMap = {};
  let hasMigration = false;
  
  // Сначала извлекаем сопоставления из сохраненных ссылок описания блога
  if (Array.isArray(state.blogDescriptionLinks)) {
    state.blogDescriptionLinks.forEach(link => {
      const urlStr = link.url;
      const cleanName = link.title;
      try {
        const urlObj = new URL(urlStr, 'https://boosty.to');
        const postsTagsIds = urlObj.searchParams.get('postsTagsIds');
        if (postsTagsIds) {
          tagNamesMap[postsTagsIds] = cleanName;
        } else {
          const postMatch = urlObj.pathname.match(/\/posts\/([a-f0-9-]+)/i);
          if (postMatch && postMatch[1]) {
            postNamesMap[postMatch[1]] = cleanName;
          }
        }
      } catch (e) {
        // Игнорируем некорректные URL
      }
    });
  }
  
  // Если ссылка ведет на пост, связываем теги этого поста с красивым именем
  posts.forEach(post => {
    if (postNamesMap[post.id]) {
      const cleanName = postNamesMap[post.id];
      const cleanTags = post.tags.filter(t => !TAGS_BLACKLIST.includes(t.title.toLowerCase()));
      cleanTags.forEach(tagObj => {
        if (tagObj.id && !tagNamesMap[tagObj.id]) {
          tagNamesMap[tagObj.id] = cleanName;
        }
      });
    }
  });

  posts.forEach(post => {
    // Находим все чистые теги поста (исключая технические из черного списка)
    const cleanTags = post.tags
      .filter(t => !TAGS_BLACKLIST.includes(t.title.toLowerCase()));
    
    // Если после фильтрации тегов не осталось, относим к категории "Объявления"
    if (cleanTags.length === 0) {
      cleanTags.push({ id: '', title: 'Объявления' });
    }
    
    // Добавляем пост во все соответствующие группы тегов
    cleanTags.forEach(tagObj => {
      const defaultName = tagObj.title.charAt(0).toUpperCase() + tagObj.title.slice(1);
      let titleName = defaultName;
      
      if (tagObj.id && tagNamesMap[tagObj.id]) {
        titleName = tagNamesMap[tagObj.id];
      }
      
      // Миграция данных прогресса со старого названия на красивое новое
      if (titleName !== defaultName && state.user_data[defaultName]) {
        if (!state.user_data[titleName]) {
          state.user_data[titleName] = state.user_data[defaultName];
          state.user_data[titleName].updatedAt = Date.now();
          delete state.user_data[defaultName];
          hasMigration = true;
        } else {
          // Если существуют оба ключа, сливаем их на основе таймстампов
          const oldData = state.user_data[defaultName];
          const newData = state.user_data[titleName];
          
          const oldTime = oldData.updatedAt || 0;
          const newTime = newData.updatedAt || 0;

          const { readPosts: mergedReadPosts, readMarks, unreadMarks } = mergeReadState(oldData, newData);
          const mergedStatus = newTime >= oldTime ? newData.status : oldData.status;
          const mergedNotes = newTime >= oldTime ? (newData.notes || '') : (oldData.notes || '');
          const mergedUpdatedAt = Math.max(oldTime, newTime);

          const mergedEntry = {
            status: mergedStatus,
            notes: mergedNotes,
            readPosts: mergedReadPosts,
            updatedAt: mergedUpdatedAt
          };
          if (Object.keys(readMarks).length) mergedEntry.readMarks = readMarks;
          if (Object.keys(unreadMarks).length) mergedEntry.unreadMarks = unreadMarks;
          state.user_data[titleName] = mergedEntry;

          delete state.user_data[defaultName];
          hasMigration = true;
        }
      }

      if (!titlesMap[titleName]) {
        titlesMap[titleName] = {
          name: titleName,
          tagId: tagObj.id,
          posts: [],
          subscriptionLevels: new Set()
        };
      }
      // Если у существующего тайтла не был сохранен ID тега (например, из-за первого поста с пустым ID), сохраняем его
      if (!titlesMap[titleName].tagId && tagObj.id) {
        titlesMap[titleName].tagId = tagObj.id;
      }
      titlesMap[titleName].posts.push(post);
      if (post.subscriptionLevel && post.subscriptionLevel.name) {
        titlesMap[titleName].subscriptionLevels.add(post.subscriptionLevel.name);
      }
    });
  });
  
  if (hasMigration) {
    saveStateToStorage();
  }
  
  // Формируем финальный массив тайтлов с подсчетом прогресса и метаданных
  return Object.values(titlesMap).map(title => {
    // Сортируем посты внутри тайтла по времени публикации (по умолчанию по возрастанию для хронологии глав)
    title.posts.sort((a, b) => a.publishTime - b.publishTime);
    
    const userTitleData = state.user_data[title.name] || { status: 'none', notes: '', readPosts: [] };
    
    // Подсчет количества просмотренных постов
    const readSet = new Set((userTitleData.readPosts || []).map(String));
    let readCount = 0;
    
    title.posts.forEach(post => {
      const isRead = readSet.has(String(post.id)) || (state.settings.syncLikes && post.isLiked);
      if (isRead) readCount++;
    });
    
    // Определяем цвет индикатора
    let statusColor = 'grey'; // По умолчанию - не начато
    if (userTitleData.status === 'dropped') {
      statusColor = 'red';
    } else if (readCount === title.posts.length && title.posts.length > 0) {
      statusColor = 'green';
    } else if (readCount > 0) {
      statusColor = 'yellow';
    }
    
    // Новизна хранится по СТАБИЛЬНОМУ ключу тайтла (tagId), а не по отображаемому имени:
    // иначе при переименовании тайтла («красивые имена» из описания блога) запись осиротеет
    // и тайтл самопроизвольно пропадёт с вкладки «Новые». У «Объявлений» tagId пустой —
    // для них ключ это константное имя. Доп. проверка по имени — обратная совместимость
    // со старыми записями, которые хранились по имени.
    const isNovel = (list) => Array.isArray(list) &&
      ((title.tagId && list.includes(title.tagId)) || list.includes(title.name));

    // Вычисляем является ли тайтл Новым (добавлен после нашего последнего захода)
    const isNewTitle = isNovel(state.newTitles);

    // Проверяем есть ли новые главы
    const hasNewChapters = isNovel(state.newChapters);
    
    // Определяем категорию (тир подписки) тайтла на основе подписок его постов
    let category = 'Бесплатные';
    const lowercaseName = title.name.toLowerCase();
    
    let isFullyFinished = false;
    let isVolumeFinished = false;

    // 1. Попытка определить по примечанию (note) из описания блога
    let blogNote = '';
    if (state.blogDescriptionLinks && state.blogDescriptionLinks.length > 0) {
      const match = state.blogDescriptionLinks.find(link => 
        link.title.toLowerCase().trim() === title.name.toLowerCase().trim() ||
        (title.posts.length > 0 && link.url.includes(title.posts[0].id))
      );
      if (match && match.note) {
        blogNote = match.note.toLowerCase();
      }
    }

    if (blogNote) {
      if (blogNote.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(blogNote) || blogNote.includes('🔥')) {
        if (blogNote.includes('том')) {
          isVolumeFinished = true;
        } else {
          isFullyFinished = true;
        }
      }
    }

    // 2. Проверка самого имени тайтла
    if (!isFullyFinished && !isVolumeFinished) {
      if (lowercaseName.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(lowercaseName)) {
        if (lowercaseName.includes('том')) {
          isVolumeFinished = true;
        } else {
          isFullyFinished = true;
        }
      }
    }

    // 3. Проверка заголовка последнего поста (игнорируя одиночные смайлики 🔥)
    if (!isFullyFinished && !isVolumeFinished && title.posts.length > 0) {
      const lastPost = title.posts[title.posts.length - 1];
      const pTitle = lastPost.title.toLowerCase();
      if (pTitle.includes('полностью озвучен') || /(^|[^а-яё])(конец|заверш[её]н)([^а-яё]|$)/.test(pTitle)) {
        if (pTitle.includes('том')) {
          isVolumeFinished = true;
        } else {
          isFullyFinished = true;
        }
      }
    }

    if (lowercaseName === 'объявления') {
      category = 'Объявления';
    } else if (lowercaseName.includes('только для девушек') || lowercaseName.includes('охотник на охотника')) {
      category = 'Только для девушек';
    } else if (lowercaseName.includes('пик боевых искусств') || title.subscriptionLevels.has('Любители пика💥')) {
      category = 'Любители пика💥';
    } else if (title.subscriptionLevels.has('Любитель ютуба')) {
      category = 'Любитель ютуба';
    } else if (title.subscriptionLevels.has('Любитель манги😈')) {
      category = 'Любитель манги😈';
    } else if (title.subscriptionLevels.has('Лисямбы🦊')) {
      category = 'Лисямбы🦊';
    } else if (title.subscriptionLevels.has('Массонский орден шейхов💎')) {
      category = 'Массонский орден шейхов💎';
    } else if (title.subscriptionLevels.size > 0) {
      category = Array.from(title.subscriptionLevels)[0];
    }
    
    // Автоматическое присвоение статуса "Завершено" или "Смотрю" на основе прогресса
    let currentStatus = userTitleData.status || 'none';
    if (isFullyFinished && readCount === title.posts.length && title.posts.length > 0 && (currentStatus === 'none' || currentStatus === 'watching')) {
      currentStatus = 'completed';
      if (!state.user_data[title.name]) {
        state.user_data[title.name] = { status: 'completed', notes: '', readPosts: [], updatedAt: 0 };
      } else {
        state.user_data[title.name].status = 'completed';
      }
      hasMigration = true;
    } else if (currentStatus === 'none' && readCount > 1) {
      currentStatus = 'watching';
      if (!state.user_data[title.name]) {
        state.user_data[title.name] = { status: 'watching', notes: '', readPosts: [], updatedAt: 0 };
      } else {
        state.user_data[title.name].status = 'watching';
      }
      hasMigration = true;
    }
    
    return {
      ...title,
      status: currentStatus,
      notes: userTitleData.notes || '',
      readPosts: userTitleData.readPosts || [],
      readCount,
      statusColor,
      isNewTitle,
      hasNewChapters,
      category,
      isFullyFinished,
      isVolumeFinished
    };
  });
}

export { getGroupedTitles, getGroupedTitlesInternal };
