const { app, BrowserWindow, session, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 自动更新模块
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;

// 设置应用数据路径
const userDataPath = path.join(process.resourcesPath, 'databaseFolder');
app.setPath('userData', userDataPath);

// 配置自动更新
autoUpdater.autoDownload = false; // 不自动下载更新
autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装更新

// 检查更新
function checkForUpdates() {
  if (process.env.NODE_ENV === 'development') {
    console.log('开发环境中跳过更新检查');
    return;
  }
  
  autoUpdater.checkForUpdates().then((result) => {
    console.log('检查更新完成', result);
  }).catch((error) => {
    console.error('检查更新失败', error);
  });
}

// 自动更新事件处理
autoUpdater.on('error', (error) => {
  console.error('自动更新错误:', error);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', error.message || '更新失败');
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('发现新版本:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
    
    // 显示更新对话框
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否现在更新？`,
      detail: info.releaseNotes || '点击"是"立即开始更新',
      buttons: ['是', '否']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('当前已是最新版本:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log('下载进度:', progressObj);
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('更新下载完成:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
    
    // 显示安装更新对话框
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新准备就绪',
      message: '新版本已下载完成，是否立即重启应用以完成更新？',
      buttons: ['是', '否']
    }).then((result) => {
      if (result.response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall());
      }
    });
  }
});

// 确保必要的目录存在
function ensureDirectoriesExist() {
  const directories = [
    userDataPath,
    path.join(userDataPath, 'uploads'),
    path.join(userDataPath, 'sessions')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
      }
    }
  });
}

// 在应用启动时立即创建目录
ensureDirectoriesExist();

app.whenReady().then(async () => {
  // 设置 session 存储路径
  const sessionPath = path.join(process.resourcesPath, 'databaseFolder', 'sessions');
  session.defaultSession.setPreloads([path.join(__dirname, 'preload.js')]);

  // 在开发环境中彻底清除所有缓存和存储数据
  if (process.env.ELECTRON_DEV) {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log('已清除开发环境所有缓存和存储数据');
  }

  const { app: serverApp, PORT } = require('../app');

  // 创建持久化的 session
  const persistentSession = session.fromPartition('persist:main', {
    cache: true
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 使用持久化的 session
      session: persistentSession,
      // 在开发环境中禁用缓存
      cache: !process.env.ELECTRON_DEV
    }
  });

  // 启动 Express 服务器
  serverApp.listen(PORT, () => {
  });

  // 加载应用
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 应用加载完成后检查更新
  mainWindow.webContents.once('dom-ready', () => {
    checkForUpdates();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// 监听来自渲染进程的更新检查请求
const { ipcMain } = require('electron');
ipcMain.on('check-for-updates', () => {
  checkForUpdates();
}); 