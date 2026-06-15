const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const TMP_DIR = path.join(__dirname, '.tmp_build');
const RELEASE_ZIP = path.join(__dirname, 'boosty-bookmark-release.zip');

// Файлы и папки, которые нужно включить в расширение
const INCLUDE_PATHS = [
  'icons',
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css',
  'jszip.min.js',
  'webdav-sync.js',
  'locales.js',
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

  // 1. Очищаем старые следы
  if (fs.existsSync(TMP_DIR)) {
    deleteFolderRecursive(TMP_DIR);
  }
  if (fs.existsSync(RELEASE_ZIP)) {
    fs.unlinkSync(RELEASE_ZIP);
  }

  fs.mkdirSync(TMP_DIR);

  // 2. Копируем и обрабатываем файлы
  for (const item of INCLUDE_PATHS) {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(TMP_DIR, item);

    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠️ Предупреждение: Путь ${item} не найден, пропускаем.`);
      continue;
    }

    const stat = fs.lstatSync(srcPath);

    if (stat.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      // Если это js или css, вырезаем отладочный код
      if (item.endsWith('.js') || item.endsWith('.css')) {
        let content = fs.readFileSync(srcPath, 'utf8');
        content = cleanDevCode(content);
        fs.writeFileSync(destPath, content, 'utf8');
        console.log(`🧹 Очищен от DEV-кода: ${item}`);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

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
