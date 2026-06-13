import { test, expect } from '@playwright/test';
import path from 'path';
import { chromium } from 'playwright';

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
});
