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

// 创建主窗口
function createWindow() {
  console.log('开始创建主窗口');
  
  // 创建持久化的 session
  const persistentSession = session.fromPartition('persist:main', {
    cache: true
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 先不显示窗口，等页面加载完成后再显示
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 使用持久化的 session
      session: persistentSession,
      // 在开发环境中禁用缓存
      cache: !process.env.ELECTRON_DEV
    }
  });

  console.log('主窗口对象已创建');

  // 等待页面加载完成后再显示窗口
  mainWindow.once('ready-to-show', () => {
    console.log('窗口准备显示');
    mainWindow.show();
    mainWindow.focus();
    console.log('窗口已显示');
  });

  // 处理窗口关闭事件
  mainWindow.on('closed', function () {
    console.log('窗口已关闭');
    mainWindow = null;
  });

  // 处理页面加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
  });

  // 处理页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');
  });

  return mainWindow;
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
        console.log('创建目录成功:', dir);
      } catch (err) {
        console.error('创建目录失败:', dir, err);
      }
    } else {
      console.log('目录已存在:', dir);
    }
  });
}

// 在应用启动时立即创建目录
console.log('开始确保必要目录存在');
ensureDirectoriesExist();
console.log('目录检查完成');

app.whenReady().then(async () => {
  console.log('Electron应用已就绪');
  
  // 设置 session 存储路径
  const sessionPath = path.join(process.resourcesPath, 'databaseFolder', 'sessions');
  session.defaultSession.setPreloads([path.join(__dirname, 'preload.js')]);
  console.log('Session预加载设置完成');

  // 在开发环境中彻底清除所有缓存和存储数据
  if (process.env.ELECTRON_DEV) {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log('已清除开发环境所有缓存和存储数据');
  }

  try {
    console.log('开始启动Express服务器');
    const { app: serverApp, PORT } = require('../app');
    console.log('Express应用已加载，端口:', PORT);

    // 创建主窗口
    console.log('开始创建主窗口');
    mainWindow = createWindow();
    console.log('主窗口创建完成');

    // 启动 Express 服务器
    serverApp.listen(PORT, () => {
      console.log(`服务器启动成功，端口: ${PORT}`);
    });

    // 加载应用
    console.log('开始加载应用URL');
    mainWindow.loadURL(`http://localhost:${PORT}`);
    console.log('应用URL加载命令已发送');

    // 应用加载完成后检查更新
    mainWindow.webContents.once('dom-ready', () => {
      console.log('DOM已准备就绪，开始检查更新');
      checkForUpdates();
    });
  } catch (error) {
    console.error('应用启动过程中发生错误:', error);
  }
});

app.on('window-all-closed', function () {
  console.log('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    console.log('正在退出应用');
    app.quit();
  }
});

app.on('activate', function () {
  console.log('应用激活事件');
  if (mainWindow === null) {
    console.log('重新创建窗口');
    mainWindow = createWindow();
  }
});

app.on('before-quit', () => {
  console.log('应用即将退出');
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('quit', () => {
  console.log('应用已退出');
});

// 监听来自渲染进程的更新检查请求
const { ipcMain } = require('electron');
ipcMain.on('check-for-updates', () => {
  checkForUpdates();
}); 