const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

// На Ubuntu 24.04 внутри AppImage SUID-песочница Chromium не работает (см. README).
// Отключаем песочницу только для упакованного AppImage, чтобы приложение запускалось без ошибки.
if (process.platform === 'linux' && process.env.APPIMAGE) {
  app.commandLine.appendSwitch('no-sandbox');
}

let tray = null;
let win = null;
let isQuitting = false;

const APP_URL = "https://telemost.360.yandex.ru";
const APP_ORIGIN = new URL(APP_URL).origin;

const ICON_NORMAL = path.join(__dirname, 'icon.png');
const ICON_UNREAD = path.join(__dirname, 'icon-unread.png');

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
    if (url.includes('passport.yandex.ru') || url.includes('oauth.yandex.ru') || url.includes('telemost.360.yandex.ru')) {
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

    if (targetOrigin !== APP_ORIGIN) {
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
