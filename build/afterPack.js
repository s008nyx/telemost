const fs = require('fs');
const path = require('path');

/**
 * Для AppImage: оборачиваем исполняемый файл Electron в скрипт-обёртку,
 * которая всегда добавляет --no-sandbox. Это нужно, чтобы собранный AppImage
 * запускался из терминала без ошибки SUID sandbox на Ubuntu 24.04,
 * где kernel.apparmor_restrict_unprivileged_userns = 1.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const executableName = context.packager.executableName;
  const appOutDir = context.appOutDir;
  const wrapperPath = path.join(appOutDir, executableName);
  const realBinaryPath = path.join(appOutDir, `${executableName}.bin`);

  // Повторный запуск не должен ломать уже обёрнутый бинарник.
  if (!fs.existsSync(wrapperPath) || fs.existsSync(realBinaryPath)) return;

  fs.renameSync(wrapperPath, realBinaryPath);

  const wrapperScript = [
    '#!/bin/bash',
    'set -e',
    `exec "$(dirname "$0")/${executableName}.bin" --no-sandbox "$@"`,
    '',
  ].join('\n');

  fs.writeFileSync(wrapperPath, wrapperScript);
  fs.chmodSync(wrapperPath, 0o755);
};
