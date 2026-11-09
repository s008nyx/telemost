# Telemost

Десктопное приложение-обёртка для [Яндекс Телемоста](https://telemost.360.yandex.ru) на базе Electron.

## Возможности

- Открывает веб-версию Телемоста в отдельном окне.
- Сворачивание в системный трей вместо закрытия окна.
- Индикация непрочитанных сообщений в иконке трея.
- Открытие внешних ссылок в системном браузере.

## Требования

- Node.js
- npm

## Установка

```bash
npm install
```

## Запуск

```bash
npm start
```

## Сборка

```bash
npm run pack
```

Готовые установщики появятся в каталоге `dist`:

- macOS — `dmg`
- Windows — `nsis`
- Linux — `AppImage`

## Известные проблемы

### Ошибка SUID sandbox на Ubuntu 24.04

При запуске собранного AppImage может появиться ошибка:

```
FATAL:setuid_sandbox_host.cc(163)] The SUID sandbox helper binary was found, but is not configured correctly...
```

Причина — в Ubuntu 24.04 по умолчанию AppArmor ограничивает небезопасные
пользовательские пространства имён (user namespaces), из-за чего Chromium
пытается использовать SUID-песочницу, которая не работает внутри AppImage.

**Исправление в коде приложения.** В [`main.js`](main.js:1) добавлено автоматическое отключение песочницы при запуске из AppImage (`process.env.APPIMAGE`), поэтому после пересборки:

```bash
npm run pack
./dist/Telemost-1.0.0.AppImage
```

AppImage запускается без ошибки даже без дополнительных флагов.

**Быстрый запуск** (без изменения системы и без пересборки):

```bash
./dist/Telemost-1.0.0.AppImage --no-sandbox
```

или

```bash
ELECTRON_DISABLE_SANDBOX=1 ./dist/Telemost-1.0.0.AppImage
```

**Постоянное исправление** (рекомендуется):

```bash
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

Чтобы сохранить настройку после перезагрузки:

```bash
echo 'kernel.apparmor_restrict_unprivileged_userns=0' | sudo tee /etc/sysctl.d/60-apparmor-userns.conf
```

## Структура проекта

| Файл | Назначение |
|------|-----------|
| [`main.js`](main.js:1) | Главный процесс Electron: окно, трей, IPC, навигация |
| [`preload.js`](preload.js:1) | Preload-скрипт: мониторинг непрочитанных сообщений |
| `icon.png` / `icon-unread.png` | Иконки трея |
| `icon.svg` | Векторная иконка |
