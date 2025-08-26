const { app, BrowserWindow, session, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 自动更新模块
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;

// 显示错误对话框的函数
function showErrorDialog(message) {
  console.error('显示错误:', message);
  // 在应用准备就绪前显示错误
  if (app.isReady()) {
    dialog.showErrorBox('应用错误', message);
  } else {
    app.whenReady().then(() => {
      dialog.showErrorBox('应用错误', message);
    });
  }
}

// 设置应用数据路径
function setupAppPaths() {
  try {
    // 在生产环境中使用正确的资源路径
    let userDataPath;
    if (app.isPackaged) {
      // 生产环境
      userDataPath = path.join(app.getPath('userData'), 'databaseFolder');
    } else {
      // 开发环境
      userDataPath = path.join(process.resourcesPath, 'databaseFolder');
    }
    
    app.setPath('userData', userDataPath);
    console.log('应用数据路径设置为:', userDataPath);
    return userDataPath;
  } catch (error) {
    const errorMessage = `设置应用路径失败: ${error.message}`;
    console.error(errorMessage);
    showErrorDialog(errorMessage);
    throw error;
  }
}

const userDataPath = setupAppPaths();

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
    showErrorDialog(`检查更新失败: ${error.message}`);
  });
}

// 创建主窗口
function createWindow() {
  console.log('开始创建主窗口');
  
  try {
    // 创建持久化的 session
    const persistentSession = session.fromPartition('persist:main', {
      cache: true
    });

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true, // 立即显示窗口以确保可见性
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

    // 处理窗口关闭事件
    mainWindow.on('closed', function () {
      console.log('窗口已关闭');
      mainWindow = null;
    });

    // 处理页面加载失败
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      const errorMessage = `页面加载失败: ${errorCode} ${errorDescription} URL: ${validatedURL}`;
      console.error(errorMessage);
      showErrorDialog(errorMessage);
    });

    // 处理页面加载完成
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('页面加载完成');
    });

    // 处理未捕获的异常
    mainWindow.webContents.on('crashed', (event, killed) => {
      const errorMessage = `渲染进程崩溃: ${killed ? '被系统杀死' : '异常崩溃'}`;
      console.error(errorMessage);
      showErrorDialog(errorMessage);
    });

    return mainWindow;
  } catch (error) {
    const errorMessage = `创建窗口时发生错误: ${error.message}`;
    console.error(errorMessage);
    showErrorDialog(errorMessage);
    throw error;
  }
}

// 自动更新事件处理
autoUpdater.on('error', (error) => {
  console.error('自动更新错误:', error);
  showErrorDialog(`自动更新错误: ${error.message}`);
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
        const errorMessage = `创建目录失败: ${dir} 错误: ${err.message}`;
        console.error(errorMessage);
        showErrorDialog(errorMessage);
      }
    } else {
      console.log('目录已存在:', dir);
    }
  });
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  const errorMessage = `未捕获的异常: ${error.message}
堆栈: ${error.stack}`;
  console.error(errorMessage);
  showErrorDialog(errorMessage);
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMessage = `未处理的Promise拒绝: ${reason}`;
  console.error(errorMessage);
  showErrorDialog(errorMessage);
});

// 在应用启动时立即创建目录
console.log('开始确保必要目录存在');
ensureDirectoriesExist();
console.log('目录检查完成');

app.whenReady().then(async () => {
  console.log('Electron应用已就绪');
  
  try {
    // 设置 session 存储路径
    const sessionPath = path.join(userDataPath, 'sessions');
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

    console.log('开始启动Express服务器');
    
    // 动态导入app模块以确保正确的路径
    let serverApp, PORT;
    try {
      const appModule = require('../app');
      serverApp = appModule.app || appModule;
      PORT = appModule.PORT || 3000;
      console.log('Express应用已加载，端口:', PORT);
    } catch (error) {
      const errorMessage = `加载Express应用失败: ${error.message}
堆栈: ${error.stack}`;
      console.error(errorMessage);
      showErrorDialog(errorMessage);
      throw error;
    }

    // 创建主窗口
    console.log('开始创建主窗口');
    mainWindow = createWindow();
    console.log('主窗口创建完成');

    // 启动 Express 服务器
    try {
      serverApp.listen(PORT, () => {
        console.log(`服务器启动成功，端口: ${PORT}`);
      });
    } catch (error) {
      const errorMessage = `启动服务器失败: ${error.message}`;
      console.error(errorMessage);
      showErrorDialog(errorMessage);
      throw error;
    }

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
    const errorMessage = `应用启动过程中发生错误: ${error.message}
堆栈: ${error.stack}`;
    console.error(errorMessage);
    showErrorDialog(errorMessage);
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