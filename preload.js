const { contextBridge, ipcRenderer } = require('electron');

// Отправляем в основной процесс сигнал "изменился ли статус непрочитанных"
function notifyUnreadChange(hasUnread) {
  ipcRenderer.send('telemost-unread-change', hasUnread);
}

// Логика мониторинга
// Селектор индикатора непрочитанных сообщений в Телемосте
const UNREAD_SELECTOR = '.ui-badge_primary';

function checkUnread() {
  // Проверяем, существует ли на странице индикатор непрочитанных, или извлекаем число
  const badge = document.querySelector(UNREAD_SELECTOR);
  const hasUnread = !!badge; // Или можно извлечь число: parseInt(badge?.textContent, 10) > 0

  notifyUnreadChange(hasUnread);
}

// После загрузки DOM начинаем наблюдение
window.addEventListener('DOMContentLoaded', () => {
  // Сначала проверяем один раз
  checkUnread();

  // Используем MutationObserver для отслеживания изменений DOM (изменения в списке чатов, появление новых сообщений и т.д.)
  const observer = new MutationObserver(() => {
    // Небольшая задержка для предотвращения частых срабатываний
    clearTimeout(window.__telemostUnreadTimer);
    window.__telemostUnreadTimer = setTimeout(checkUnread, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
});