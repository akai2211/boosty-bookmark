const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const esbuild = require('esbuild');

const isFirefox = process.argv.includes('--firefox');
const TMP_DIR = path.join(__dirname, '.tmp_build');

// Файлы и папки, которые нужно включить в расширение
// content.js собирается отдельно через esbuild (см. ниже); locales.js и webdav-sync.js
// забандлены внутрь content.js и в архив отдельными файлами не попадают.
const INCLUDE_PATHS = [
  'icons',
  isFirefox ? 'manifest.firefox.json' : 'manifest.json',
  'background.js',
  'styles.css',
  'jszip.min.js',
  'page_script.js'
];

// Функция рекурсивного удаления директории
function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

// Функция копирования директории
function copyFolderRecursiveSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach((element) => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderRecursiveSync(fromPath, toPath);
    } else {
      // Исключаем SVG-файлы из сборки релиза
      if (element.endsWith('.svg')) {
        console.log(`🚫 Исключен из сборки: ${path.join(path.basename(from), element)}`);
        return;
      }
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

// Очистка от блоков DEV_ONLY
function cleanDevCode(fileContent) {
  return fileContent.replace(/\/\*\s*DEV_ONLY_START\s*\*\/[\s\S]*?\/\*\s*DEV_ONLY_END\s*\*\//g, '');
}

async function build() {
  console.log('🚀 Начинаем сборку релиза...');

  // Считываем версию из manifest.json как единственного источника правды
  const manifestPath = path.join(__dirname, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json не найден!');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = manifest.version;
  console.log(`📌 Текущая версия в manifest.json: ${version}`);

  // Синхронизируем версию в manifest.firefox.json
  const firefoxManifestPath = path.join(__dirname, 'manifest.firefox.json');
  if (fs.existsSync(firefoxManifestPath)) {
    const ffManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
    if (ffManifest.version !== version) {
      ffManifest.version = version;
      fs.writeFileSync(firefoxManifestPath, JSON.stringify(ffManifest, null, 2) + '\n', 'utf8');
      console.log(`🔄 Версия в manifest.firefox.json успешно обновлена до ${version}`);
    }
  }

  // Синхронизируем версию в package.json
  const packagePath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (pkg.version !== version) {
      pkg.version = version;
      fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`🔄 Версия в package.json успешно обновлена до ${version}`);
    }
  }

  // Динамически формируем имя нового архива с версией
  const zipName = isFirefox 
    ? `boosty-bookmark-v${version}-firefox-release.zip` 
    : `boosty-bookmark-v${version}-release.zip`;
  const RELEASE_ZIP = path.join(__dirname, zipName);

  // 1. Очищаем старые следы
  if (fs.existsSync(TMP_DIR)) {
    deleteFolderRecursive(TMP_DIR);
  }

  // Находим и удаляем старые архивы релизов для ТЕКУЩЕЙ платформы в корне проекта
  fs.readdirSync(__dirname).forEach((file) => {
    if (file.endsWith('.zip') && file.startsWith('boosty-bookmark-')) {
      const isFileFirefox = file.includes('-firefox-release.zip');
      if (isFileFirefox === isFirefox) {
        const filePath = path.join(__dirname, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🧹 Удален старый архив: ${file}`);
        } catch (e) {
          console.warn(`⚠️ Не удалось удалить файл ${file}:`, e.message);
        }
      }
    }
  });

  fs.mkdirSync(TMP_DIR);

  // 2. Копируем и обрабатываем файлы
  for (const item of INCLUDE_PATHS) {
    const srcPath = path.join(__dirname, item);
    const destItemName = item === 'manifest.firefox.json' ? 'manifest.json' : item;
    const destPath = path.join(TMP_DIR, destItemName);

    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠️ Предупреждение: Путь ${item} не найден, пропускаем.`);
      continue;
    }

    const stat = fs.lstatSync(srcPath);

    if (stat.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      // DEV_ONLY-маркеры остались только в CSS. Dev-код в JS вырезается esbuild'ом
      // на этапе сборки content.js (--define:DEV=false --minify-syntax).
      if (item.endsWith('.css')) {
        let content = fs.readFileSync(srcPath, 'utf8');
        content = cleanDevCode(content);
        fs.writeFileSync(destPath, content, 'utf8');
        console.log(`🧹 Очищен от DEV-кода (CSS): ${item}`);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 2.5 Релизная сборка content.js: бандл esbuild с вырезанным dev-кодом (DEV=false).
  // --minify-syntax обязателен — иначе ветки if (false) {} не удаляются (см. split_plan.md, Стратегия 4).
  console.log('🔨 Сборка content.js через esbuild (DEV=false)...');
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'src', 'content.js')],
    bundle: true,
    define: { DEV: 'false' },
    minifySyntax: true,
    charset: 'utf8',
    outfile: path.join(TMP_DIR, 'content.js')
  });
  console.log('✅ content.js собран (релиз).');

  // 3. Создаем ZIP-архив
  console.log('📦 Создаем ZIP-архив релиза...');
  const output = fs.createWriteStream(RELEASE_ZIP);
  const archive = new ZipArchive({
    zlib: { level: 9 } // Максимальное сжатие
  });

  output.on('close', () => {
    console.log(`✨ Сборка успешно завершена! Создан архив: ${path.basename(RELEASE_ZIP)} (${archive.pointer()} байт)`);
    // 4. Удаляем временную директорию
    deleteFolderRecursive(TMP_DIR);
    console.log('🗑️ Временные файлы удалены.');
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(TMP_DIR, false);
  await archive.finalize();
}

build().catch((err) => {
  console.error('❌ Ошибка сборки:', err);
  if (fs.existsSync(TMP_DIR)) {
    deleteFolderRecursive(TMP_DIR);
  }
  process.exit(1);
});
