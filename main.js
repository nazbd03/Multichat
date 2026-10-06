const { app, BrowserWindow, Tray, Menu, nativeImage, shell, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, appEvents } = require('./src/server');
const os = require('os');
const { checkForUpdates, downloadFile, applyInPlaceUpdate, CURRENT_VERSION } = require('./src/updater');

// Prevent background timer throttling so OBS WebSocket and alerts are always instant
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let serverInstance = null;
const PORT = 3333;
const isHiddenLaunch = process.argv.includes('--hidden') || process.argv.includes('--background') || process.argv.includes('-h');

function getTargetExePath() {
  if (process.env.PORTABLE_EXECUTABLE_FILE && fs.existsSync(process.env.PORTABLE_EXECUTABLE_FILE)) {
    return process.env.PORTABLE_EXECUTABLE_FILE;
  }
  const rootExe = path.join(__dirname, 'Multistream Chat.exe');
  if (fs.existsSync(rootExe)) {
    return rootExe;
  }
  return app.getPath('exe');
}

function showTrayNotification(title, content) {
  if (!tray) return;
  try {
    tray.displayBalloon({
      title: title || 'Multistream Chat Overlay',
      content: content || 'Activo en segundo plano para OBS Studio',
      iconType: 'info'
    });
  } catch (err) {
    // Windows balloon may not show if notifications are disabled in Windows settings
  }
}

function showAndFocusWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showAndFocusWindow();
  }
}

async function promptUpdateCheck(isManual = false) {
  try {
    const updateInfo = await checkForUpdates();
    if (updateInfo.updateAvailable) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const choice = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '🚀 Nueva Versión Disponible',
          message: `¡Hay una nueva versión disponible! (${updateInfo.latestVersion})`,
          detail: `Versión actual: v${updateInfo.currentVersion}\nNueva versión: ${updateInfo.latestVersion}\n\nNovedades:\n${updateInfo.releaseNotes}\n\n¿Deseas actualizar ahora? La app descargará la actualización, reemplazará este mismo archivo y se reiniciará automáticamente (sin instaladores ni ejecutables duplicados).`,
          buttons: ['Actualizar y Reiniciar Ahora', 'Más tarde'],
          defaultId: 0,
          cancelId: 1
        });

        if (choice.response === 0) {
          if (updateInfo.hasExeAsset) {
            showTrayNotification('Multichat', `Descargando versión ${updateInfo.latestVersion}...`);
            const tempExe = path.join(os.tmpdir(), `multichat_update_${Date.now()}.exe`);
            try {
              await downloadFile(updateInfo.downloadUrl, tempExe);
              const targetExe = getTargetExePath();
              applyInPlaceUpdate(tempExe, targetExe);
              app.isQuitting = true;
              app.quit();
            } catch (err) {
              dialog.showErrorBox('Error al Actualizar', 'No se pudo descargar la actualización: ' + err.message);
            }
          } else {
            shell.openExternal(updateInfo.htmlUrl);
          }
        }
      }
    } else if (isManual) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Multichat Actualizado',
          message: `Tienes la versión más reciente (v${CURRENT_VERSION}).`,
          detail: updateInfo.message || 'No hay nuevas actualizaciones disponibles en GitHub Releases.',
          buttons: ['Aceptar']
        });
      }
    }
  } catch (err) {
    console.warn('[Updater] Error checking updates:', err.message);
    if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Comprobación de Actualizaciones',
        message: 'No se pudo conectar con GitHub Releases.',
        detail: err.message,
        buttons: ['Aceptar']
      });
    }
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const isVisible = mainWindow && mainWindow.isVisible();
  let openAtLogin = false;
  try {
    openAtLogin = app.getLoginItemSettings().openAtLogin;
  } catch (e) {}

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '🔽 Ocultar a Segundo Plano' : '💻 Abrir Panel de Control',
      click: () => {
        toggleWindow();
      }
    },
    { type: 'separator' },
    {
      label: '📋 Copiar URL para OBS',
      click: () => {
        clipboard.writeText(`http://localhost:${PORT}/overlay`);
        showTrayNotification('Enlace Copiado', 'http://localhost:3333/overlay copiado al portapapeles.');
      }
    },
    {
      label: '📺 Ver Overlay en Navegador',
      click: () => {
        shell.openExternal(`http://localhost:${PORT}/overlay`);
      }
    },
    { type: 'separator' },
    {
      label: '🚀 Iniciar con Windows (Segundo Plano)',
      type: 'checkbox',
      checked: openAtLogin,
      click: (menuItem) => {
        try {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            args: ['--hidden']
          });
          showTrayNotification(
            'Inicio con Windows',
            menuItem.checked ? 'La app se iniciará en segundo plano al encender el PC.' : 'Inicio automático desactivado.'
          );
        } catch (e) {
          console.warn('[AutoStart] Error setting login item:', e.message);
        }
      }
    },
    { type: 'separator' },
    {
      label: '🔄 Buscar Actualizaciones',
      click: () => {
        promptUpdateCheck(true);
      }
    },
    { type: 'separator' },
    {
      label: '❌ Salir Completamente',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray(iconPath) {
  try {
    let trayImage;
    const pngPath = path.join(__dirname, 'public', 'icon.png');
    const icoPath = path.join(__dirname, 'public', 'app.ico');

    if (fs.existsSync(icoPath)) {
      trayImage = nativeImage.createFromPath(icoPath);
    } else if (fs.existsSync(pngPath)) {
      trayImage = nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 });
    } else {
      trayImage = nativeImage.createEmpty();
    }

    tray = new Tray(trayImage);
    tray.setToolTip('Multistream Chat Overlay (Activo en Segundo Plano)');

    updateTrayMenu();

    // Single click toggles window
    tray.on('click', () => {
      toggleWindow();
    });

    // Double click restores and focuses window
    tray.on('double-click', () => {
      showAndFocusWindow();
    });
  } catch (err) {
    console.warn('[Tray] Could not create system tray icon:', err.message);
  }
}

async function createWindow() {
  const iconPath = path.join(__dirname, 'public', 'app.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 950,
    minHeight: 650,
    title: 'Multistream Chat Overlay - Twitch, Kick, YouTube, TikTok',
    backgroundColor: '#0a0b10',
    icon: iconPath,
    show: !isHiddenLaunch,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  // Load the web dashboard
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Handle external links (open in user's default browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // When second instance is launched, focus current window
  app.on('second-instance', () => {
    showAndFocusWindow();
  });

  // Build desktop menu
  const menuTemplate = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Copiar URL de OBS',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            clipboard.writeText(`http://localhost:${PORT}/overlay`);
          }
        },
        {
          label: 'Abrir OBS Overlay en Navegador',
          click: () => {
            shell.openExternal(`http://localhost:${PORT}/overlay`);
          }
        },
        { type: 'separator' },
        {
          label: 'Ocultar a Segundo Plano',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            mainWindow.hide();
          }
        },
        {
          label: 'Salir Completamente',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar Panel', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'Forzar Recarga', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Pantalla Completa', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Herramientas de Desarrollador', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: '🔄 Buscar Actualizaciones en GitHub...',
          click: () => {
            promptUpdateCheck(true);
          }
        },
        { type: 'separator' },
        {
          label: 'Overlay para OBS: http://localhost:3333/overlay',
          click: () => {
            shell.openExternal(`http://localhost:${PORT}/overlay`);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Setup System Tray
  if (!tray) {
    createTray(iconPath);
  }

  // Update tray menu on show / hide
  mainWindow.on('show', () => updateTrayMenu());
  mainWindow.on('hide', () => updateTrayMenu());

  // Window close behavior: keep running in background for OBS Studio
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showTrayNotification(
        'Multistream Chat Overlay',
        'La aplicación sigue activa en segundo plano. Tu chat en OBS sigue funcionando.'
      );
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isHiddenLaunch) {
    showTrayNotification(
      'Multistream Chat Overlay',
      'Iniciado en segundo plano. El overlay para OBS está listo.'
    );
  }
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Start backend server
    serverInstance = await startServer(PORT);
    console.log('[Electron] Servidor backend listo.');
    await createWindow();

    // Check for updates on GitHub Releases (after 4 seconds)
    setTimeout(() => {
      promptUpdateCheck(false);
    }, 4000);

    // Wire application events from Express backend
    if (appEvents) {
      appEvents.on('hide-window', () => {
        if (mainWindow) {
          mainWindow.hide();
          showTrayNotification(
            'Multistream Chat Overlay',
            'Aplicación en segundo plano. Los directos y OBS siguen conectados.'
          );
        }
      });

      appEvents.on('show-window', () => {
        showAndFocusWindow();
      });

      appEvents.on('quit-app', () => {
        app.isQuitting = true;
        app.quit();
      });
    }
  } catch (err) {
    console.error('[Electron] Error al iniciar:', err);
  }

  app.on('activate', () => {
    showAndFocusWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// Do not quit when windows are closed/hidden - keep background server active for OBS
app.on('window-all-closed', () => {
  if (app.isQuitting) {
    app.quit();
  }
});
