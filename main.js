const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// На Linux WM_CLASS окна берётся из имени приложения и должен совпадать
// со StartupWMClass в .desktop-файле, иначе в доке не будет иконки.
if (process.platform === 'linux') {
  app.setName('Telemost');
}

let tray = null;
let win = null;
let isQuitting = false;

const APP_URL = "https://telemost.360.yandex.ru";
const APP_ORIGIN = new URL(APP_URL).origin;

// Основной домен может редиректить на telemost.yandex.ru.
// Оба origin считаем внутренними, чтобы они открывались в окне приложения.
const ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  'https://telemost.yandex.ru',
]);

const ICON_NORMAL = path.join(__dirname, 'icon.png');
const ICON_UNREAD = path.join(__dirname, 'icon-unread.png');

// Устанавливает .desktop-файл и иконку в пользовательские каталоги,
// чтобы у запущенного AppImage была иконка в доке Ubuntu/GNOME.
function installDesktopIntegration() {
  if (process.platform !== 'linux') return;

  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath) return;

  const appDir = process.env.APPDIR;
  const home = os.homedir();
  const applicationsDir = path.join(home, '.local', 'share', 'applications');
  const iconsDir = path.join(home, '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
  const desktopFilePath = path.join(applicationsDir, 'telemost.desktop');
  const iconTargetPath = path.join(iconsDir, 'telemost.png');
  const iconSourcePath = appDir
    ? path.join(appDir, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps', 'telemost.png')
    : null;

  const desktopEntry = [
    '[Desktop Entry]',
    'Name=Telemost',
    `Exec="${appImagePath}" %U`,
    'Terminal=false',
    'Type=Application',
    `Icon=${iconTargetPath}`,
    'StartupWMClass=Telemost',
    'Categories=Network;Chat;',
    'Comment=Yandex Telemost',
    '',
  ].join('\n');

  try {
    fs.mkdirSync(applicationsDir, { recursive: true });
    fs.mkdirSync(iconsDir, { recursive: true });

    if (iconSourcePath && fs.existsSync(iconSourcePath)) {
      fs.copyFileSync(iconSourcePath, iconTargetPath);
    }

    if (!fs.existsSync(desktopFilePath) || fs.readFileSync(desktopFilePath, 'utf8') !== desktopEntry) {
      fs.writeFileSync(desktopFilePath, desktopEntry);
    }

    // Обновляем кэши, чтобы GNOME сразу увидел иконку и ярлык.
    try {
      execFileSync('gtk-update-icon-cache', ['-f', '-t', path.join(home, '.local', 'share', 'icons', 'hicolor')], { stdio: 'ignore' });
    } catch {
      // Утилита может отсутствовать — это не критично.
    }
    try {
      execFileSync('update-desktop-database', [applicationsDir], { stdio: 'ignore' });
    } catch {
      // Утилита может отсутствовать — это не критично.
    }
  } catch (error) {
    console.error('Не удалось установить интеграцию с рабочим столом:', error);
  }
}

// Функция для обновления иконки трея
function updateTrayIcon(hasUnread) {
  if (!tray) return;

  const iconPath = hasUnread ? ICON_UNREAD : ICON_NORMAL;
  // nativeImage.createFromPath корректно загрузит PNG [citation:1]
  const icon = nativeImage.createFromPath(iconPath);
  tray.setImage(icon);
}

function openExternally(url) {
  const protocol = new URL(url).protocol;
  if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
}

ipcMain.on('telemost-unread-change', (event, hasUnread) => {
  // Принимаем сообщения только от нашего окна
  if (event.sender !== win?.webContents) return;

  updateTrayIcon(hasUnread);
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Telemost",
    icon: ICON_NORMAL,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.loadURL(APP_URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('passport.yandex.ru') ||
      url.includes('oauth.yandex.ru') ||
      url.includes('telemost.360.yandex.ru') ||
      url.includes('telemost.yandex.ru')
    ) {
      return { action: 'allow' };
    }

    openExternally(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    let targetOrigin;
    try {
      targetOrigin = new URL(url).origin;
    } catch {
      // Невалидный URL (about:blank и т.п.) — не блокируем
      return;
    }

    if (!ALLOWED_ORIGINS.has(targetOrigin)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  const initialIcon = nativeImage.createFromPath(ICON_NORMAL);
  tray = new Tray(initialIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать/Скрыть',
      click: () => {
        if (win) {
          if (win.isVisible() && !win.isDestroyed()) {
            win.hide();
          } else {
            win.show();
            win.focus();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // (Опционально) Всплывающая подсказка
  tray.setToolTip('Yandex Telemost');
}

app.whenReady().then(() => {
  installDesktopIntegration();
  createWindow();
});
app.on('window-all-closed', () => {
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
