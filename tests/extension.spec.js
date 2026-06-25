import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

// __dirname недоступен в ESM ("type": "module") — восстанавливаем из import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('E2E-тесты расширения Boosty Bookmark', () => {
  let context;
  let page;

  test.beforeEach(async () => {
    const pathToExtension = path.resolve(__dirname, '../');
    context = await chromium.launchPersistentContext('', {
      headless: false, // Расширения стабильно работают только в headful режиме
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    
    page = await context.newPage();

    // Логируем все сообщения из консоли браузера для отладки
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Перехватываем сам запрос к странице boosty.to, чтобы тест работал полностью локально и стабильно
    await page.route('https://boosty.to/lightfoxmanga', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>Boosty Page Mock</title>
            </head>
            <body>
              <div id="root">Boosty Mock Content</div>
            </body>
          </html>
        `
      });
    });

    // Перехватываем и подменяем запросы к API Boosty, чтобы тесты проходили быстро и без авторизации
    await page.route('**/v1/blog/lightfoxmanga', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 12345,
          name: 'lightfoxmanga',
          title: 'LightFox',
          description: [
            {
              type: 'link',
              url: 'https://boosty.to/lightfoxmanga?postsTagsIds=777',
              content: 'Реинкарнация бездельника'
            }
          ]
        })
      });
    });

    await page.route('**/v1/blog/lightfoxmanga/post/?limit=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'post-1',
              title: 'Реинкарнация бездельника — Том 1 Глава 1',
              publishTime: 1779921600,
              isLiked: false,
              subscriptionLevel: { id: 111, name: 'Любитель' },
              tags: [{ id: 777, title: 'Реинкарнация бездельника' }]
            },
            {
              id: 'post-2',
              title: 'Реинкарнация бездельника — Том 1 Глава 2',
              publishTime: 1779925200,
              isLiked: true,
              subscriptionLevel: { id: 111, name: 'Любитель' },
              tags: [{ id: 777, title: 'Реинкарнация бездельника' }]
            }
          ],
          extra: { isLast: true }
        })
      });
    });
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
  });

  test('Кнопка-триггер и сайдбар должны корректно инициализироваться', async () => {
    // Переходим на страницу автора
    await page.goto('https://boosty.to/lightfoxmanga');

    // Проверяем, что кнопка-триггер добавлена в DOM
    const triggerBtn = page.locator('#lf-trigger-btn');
    await expect(triggerBtn).toBeVisible();

    // Сайдбар по умолчанию должен быть закрыт (не иметь класс lf-open)
    const sidebar = page.locator('#lf-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).not.toHaveClass(/lf-open/);

    // Кликаем по кнопке-триггеру
    await triggerBtn.click();

    // Сайдбар должен открыться (получить класс lf-open)
    await expect(sidebar).toHaveClass(/lf-open/);

    // Кнопка-триггер должна стать невидимой (style="display: none;")
    await expect(triggerBtn).not.toBeVisible();
  });

  test('Посты и главы должны корректно рендериться в сайдбаре', async () => {
    // Переходим на страницу автора
    await page.goto('https://boosty.to/lightfoxmanga');

    // Открываем сайдбар
    await page.click('#lf-trigger-btn');

    // База изначально пуста, запускаем синхронизацию
    const startSyncBtn = page.locator('#lf-empty-sync-btn');
    await expect(startSyncBtn).toBeVisible();
    await startSyncBtn.click();

    // Ожидаем завершения синхронизации (исчезновения оверлея загрузки)
    const loadingOverlay = page.locator('.lf-loading-overlay');
    await expect(loadingOverlay).toBeVisible();
    await expect(loadingOverlay).toBeHidden({ timeout: 15000 });

    // Кликаем по вкладке "Все", чтобы увидеть наш тайтл
    const allTab = page.locator('.lf-tab-btn:has-text("Все")');
    await allTab.click();

    // Поскольку группы свернуты по умолчанию, раскрываем группу "Все"
    const groupHeader = page.locator('.lf-group-header-left span', { hasText: 'Все' }).first();
    await groupHeader.click();

    // Находим тайтл "Реинкарнация бездельника" в списке (выбираем первый, так как он может рендериться в нескольких группах)
    const mangaTitle = page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first();
    await expect(mangaTitle).toBeVisible();

    // Проверяем счетчик прогресса у тайтла: 1/2
    const progressText = page.locator('.lf-manga-progress:has-text("1/2")').first();
    await expect(progressText).toBeVisible();

    // Кликаем по тайтлу для перехода в детальный вид
    await mangaTitle.click();

    // Должен открыться детальный вид с заголовком глав
    const chaptersHeader = page.locator('.lf-chapters-header:has-text("Список глав")');
    await expect(chaptersHeader).toBeVisible();

    // Проверяем наличие двух глав в списке
    const chapter1 = page.locator('.lf-chapter-row:has-text("Том 1 Глава 1")');
    const chapter2 = page.locator('.lf-chapter-row:has-text("Том 1 Глава 2")');
    await expect(chapter1).toBeVisible();
    await expect(chapter2).toBeVisible();

    // Проверяем состояние чекбоксов:
    // У Том 1 Глава 1 чекбокс не должен быть отмечен
    const checkbox1 = chapter1.locator('.lf-chapter-checkbox');
    await expect(checkbox1).not.toBeChecked();

    // У Том 1 Глава 2 чекбокс должен быть отмечен (так как isLiked: true)
    const checkbox2 = chapter2.locator('.lf-chapter-checkbox');
    await expect(checkbox2).toBeChecked();
  });

  test('Поиск должен фильтровать тайтлы и раскрывать группы', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Запускаем синхронизацию
    await page.click('#lf-empty-sync-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });

    // Кликаем по вкладке "Все", чтобы увидеть наш тайтл
    await page.locator('.lf-tab-btn:has-text("Все")').click();

    // Вводим поисковый запрос
    const searchInput = page.locator('#lf-search');
    await searchInput.fill('бездельника');

    // Кнопка очистки должна стать видимой
    const clearBtn = page.locator('#lf-search-clear');
    await expect(clearBtn).toBeVisible();

    // При активном поиске группа должна быть раскрыта автоматически,
    // проверяем видимость тайтла без клика по заголовку группы
    const mangaTitle = page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first();
    await expect(mangaTitle).toBeVisible();

    // Очищаем поиск через кнопку сброса
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
  });

  test('Блокнот должен сохранять заметки для тайтла', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Синхронизируем
    await page.click('#lf-empty-sync-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });

    // Открываем группу "Все" и тайтл
    await page.locator('.lf-tab-btn:has-text("Все")').click();
    await page.locator('.lf-group-header-left span', { hasText: 'Все' }).first().click();
    await page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first().click();

    // Пишем заметку в textarea
    const textarea = page.locator('#lf-notes-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Тестовая заметка для проверки блокнота');
    // Имитируем уход фокуса (blur) для автосохранения
    await textarea.blur();

    // Возвращаемся назад
    await page.click('#lf-detail-back');

    // Снова открываем тайтл и проверяем, что заметка сохранилась
    await page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first().click();
    await expect(textarea).toHaveValue('Тестовая заметка для проверки блокнота');
  });

  test('Изменение статуса отслеживания тайтла', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Синхронизируем
    await page.click('#lf-empty-sync-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });

    // Открываем тайтл
    await page.locator('.lf-tab-btn:has-text("Все")').click();
    await page.locator('.lf-group-header-left span', { hasText: 'Все' }).first().click();
    await page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first().click();

    // Выбираем статус "Смотрю"
    const statusSelect = page.locator('#lf-status-select');
    await statusSelect.selectOption('watching');

    // Возвращаемся назад
    await page.click('#lf-detail-back');

    // Переключаемся на вкладку "Смотрю"
    await page.locator('.lf-tab-btn:has-text("Смотрю")').click();

    // Находим тайтл во вкладке "Смотрю"
    const mangaTitle = page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first();
    await expect(mangaTitle).toBeVisible();
  });

  test('Очистка новинок с двухэтапным подтверждением', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Включаем эмуляцию даты и ставим отсечку на 2026-05-10 (постов от 15 мая еще нет в выборке)
    const devBtn = page.locator('#lf-dev-trigger-btn');
    if (await devBtn.isVisible()) {
      await devBtn.click();
    }
    await page.locator('#lf-dev-enabled').check();
    await page.locator('#lf-dev-cutoff-date').fill('2026-05-10');
    await page.click('#lf-dev-save-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });

    // Сдвигаем отсечку на 2026-06-01 (появляются посты от 15 мая)
    await page.locator('#lf-dev-cutoff-date').fill('2026-06-01');
    await page.click('#lf-dev-save-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });
    await page.click('.lf-dev-close');

    // Переходим на вкладку "Новые"
    const newTab = page.locator('.lf-tab-btn:has-text("Новые")');
    await newTab.click();

    // Группа "Новые тайтлы" должна быть развернута, проверяем наличие тайтла
    const mangaTitle = page.locator('.lf-manga-title:has-text("Реинкарнация бездельника")').first();
    await expect(mangaTitle).toBeVisible();

    // Кнопка очистки должна быть видна
    const clearBtn = page.locator('#lf-clear-all-new-btn');
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).not.toHaveClass(/lf-confirming/);

    // Первый клик: кнопка переходит в режим подтверждения
    await clearBtn.click();
    await expect(clearBtn).toHaveClass(/lf-confirming/);

    // Второй клик: очистка
    await clearBtn.click();

    // Новинки должны исчезнуть
    await expect(mangaTitle).not.toBeVisible();
    await expect(clearBtn).not.toBeVisible();
  });

  test('Сброс данных с двухэтапным подтверждением', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Синхронизируем
    await page.click('#lf-empty-sync-btn');
    await expect(page.locator('.lf-loading-overlay')).toBeHidden({ timeout: 15000 });

    // Переходим в настройки
    await page.click('#lf-settings-btn');

    // Нажимаем на кнопку сброса в первый раз
    const deleteBtn = page.locator('#lf-delete-data-btn');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Кнопка должна перейти в режим подтверждения и появиться кнопка "Отмена"
    await expect(deleteBtn).toHaveAttribute('data-confirming', 'true');
    const cancelBtn = page.locator('#lf-delete-cancel-btn');
    await expect(cancelBtn).toBeVisible();

    // Нажимаем отмену и проверяем сброс состояния подтверждения
    await cancelBtn.click();
    await expect(deleteBtn).not.toHaveAttribute('data-confirming', 'true');
    await expect(cancelBtn).not.toBeVisible();

    // Нажимаем еще раз и подтверждаем удаление (второй клик по той же кнопке)
    await deleteBtn.click();
    await deleteBtn.click();

    // Сайдбар должен вернуться к начальному состоянию с кнопкой запуска
    const startSyncBtn = page.locator('#lf-empty-sync-btn');
    await expect(startSyncBtn).toBeVisible();
  });

  test('Отображение модального окна USDT и QR-кода', async () => {
    await page.goto('https://boosty.to/lightfoxmanga');
    await page.click('#lf-trigger-btn');

    // Переходим в настройки
    await page.click('#lf-settings-btn');

    // Переходим во вкладку "О расширении"
    const aboutBtn = page.locator('#lf-about-btn');
    await expect(aboutBtn).toBeVisible();
    await aboutBtn.click();

    // Кликаем по кнопке поддержки USDT
    const usdtBtn = page.locator('#lf-support-usdt');
    await expect(usdtBtn).toBeVisible();
    await usdtBtn.click();

    // Проверяем открытие модального окна
    const usdtModal = page.locator('#lf-usdt-modal');
    await expect(usdtModal).toBeVisible();
    await expect(usdtModal).toHaveClass(/lf-show/);

    // Проверяем наличие контейнера QR-кода и изображение внутри
    const qrContainer = usdtModal.locator('.lf-modal-qr-container');
    await expect(qrContainer).toBeVisible();

    const qrImage = qrContainer.locator('img');
    await expect(qrImage).toBeVisible();
    
    // Проверяем валидность src изображения (должен содержать полный base64 QR-кода)
    const qrSrc = await qrImage.getAttribute('src');
    expect(qrSrc).not.toBeNull();
    expect(qrSrc).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMYAAADGAQAAAACh4MLw');
    expect(qrSrc?.replace(/\s/g, '').length).toBe(654);

    // Проверяем отображение адреса кошелька
    const addressElement = usdtModal.locator('#lf-modal-address');
    await expect(addressElement).toBeVisible();
    await expect(addressElement).toHaveText('TGswBbQEFexfDmhHusXMhWiYMVkinjL6cq');

    // Проверяем наличие предупреждения о сети и красного блока верификации адреса
    const warningBox = usdtModal.locator('.lf-modal-info-box').first();
    const dangerBox = usdtModal.locator('.lf-modal-danger-box');
    await expect(warningBox).toBeVisible();
    await expect(dangerBox).toBeVisible();

    // Проверяем защиту от подмены адреса в DOM (MutationObserver)
    await addressElement.evaluate(node => {
      node.textContent = 'TFakeWalletAddress12345678901234567';
    });
    // MutationObserver должен мгновенно вернуть правильный адрес
    await expect(addressElement).toHaveText('TGswBbQEFexfDmhHusXMhWiYMVkinjL6cq');

    // Проверяем защиту от подмены QR-кода в DOM (MutationObserver)
    await qrImage.evaluate(node => {
      node.setAttribute('src', 'data:image/png;base64,fake_qr_code_base64_data');
    });
    // MutationObserver должен мгновенно вернуть исходный QR-код
    const qrSrcAfterTamper = await qrImage.getAttribute('src');
    expect(qrSrcAfterTamper).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMYAAADGAQAAAACh4MLw');

    // Проверяем наличие надписи "memo не требуется"
    const memoText = usdtModal.locator('text=memo не требуется');
    await expect(memoText).toBeVisible();

    // Закрываем модальное окно
    const closeBtn = usdtModal.locator('#lf-modal-close-btn');
    await closeBtn.click();

    // Убеждаемся, что окно исчезло из DOM
    await expect(usdtModal).not.toBeVisible();
  });
});
