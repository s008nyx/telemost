const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');

// На Linux WM_CLASS окна берётся из имени приложения и должен совпадать
// со StartupWMClass в .desktop-файле, иначе в доке не будет иконки.
if (process.platform === 'linux') {
  app.setName('Telemost');
}

// Защита от множественного запуска: второй экземпляр лишь
// разворачивает уже открытое окно и завершается.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;

    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });
}

let tray = null;
let win = null;
let isQuitting = false;
let hasUnread = null;
let unreadNotification = null;
let unreadNotificationTimer = null;

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

// Функция для обновления иконки трея
function updateTrayIcon(hasUnread) {
  if (!tray) return;

  const iconPath = hasUnread ? ICON_UNREAD : ICON_NORMAL;
  // nativeImage.createFromPath корректно загрузит PNG [citation:1]
  const icon = nativeImage.createFromPath(iconPath);
  tray.setImage(icon);
}

// Закрывает текущее уведомление о непрочитанных сообщениях
function closeUnreadNotification() {
  if (unreadNotificationTimer) {
    clearTimeout(unreadNotificationTimer);
    unreadNotificationTimer = null;
  }

  if (unreadNotification) {
    unreadNotification.close();
    unreadNotification = null;
  }
}

// Отправляет системное уведомление о новых сообщениях.
// Уведомление живёт ограниченное время и закрывается при прочтении.
function showUnreadNotification() {
  if (!Notification.isSupported()) return;

  closeUnreadNotification();

  const notification = new Notification({
    title: 'Telemost',
    body: 'Новые сообщения',
    icon: ICON_NORMAL,
    silent: false,
    timeoutType: 'never',
  });

  unreadNotification = notification;
  notification.show();

  // Автоматически закрываем через 15 секунд, если сообщения не прочитали.
  unreadNotificationTimer = setTimeout(() => {
    closeUnreadNotification();
  }, 15000);
}

function openExternally(url) {
  const protocol = new URL(url).protocol;
  if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
}

ipcMain.on('telemost-unread-change', (event, value) => {
  // Принимаем сообщения только от нашего окна
  if (event.sender !== win?.webContents) return;

  const unread = Boolean(value);

  // Первая проверка задаёт базовое состояние, чтобы не уведомлять
  // о старых непрочитанных сообщениях при открытии приложения.
  if (hasUnread === null) {
    hasUnread = unread;
    updateTrayIcon(unread);
    return;
  }

  if (unread && !hasUnread) {
    showUnreadNotification();
  } else if (!unread && hasUnread) {
    // Сообщения прочитали — убираем уведомление.
    closeUnreadNotification();
  }

  hasUnread = unread;
  updateTrayIcon(unread);
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

if (gotTheLock) {
  app.whenReady().then(() => {
    createWindow();
  });

  app.on('window-all-closed', () => {
    // Окно скрывается в трей, а не закрывается, поэтому здесь ничего не делаем.
  });

  app.on('before-quit', () => {
    closeUnreadNotification();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (win && !win.isVisible()) {
      win.show();
      win.focus();
    }
  });
}
