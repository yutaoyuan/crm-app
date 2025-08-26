// 自动更新UI组件
class AutoUpdater {
    constructor() {
        this.init();
    }

    init() {
        // 监听主进程发送的更新事件
        window.electron.ipcRenderer.on('update-available', (event, info) => {
            this.showUpdateAvailable(info);
        });

        window.electron.ipcRenderer.on('update-not-available', (event, info) => {
            this.showUpdateNotAvailable(info);
        });

        window.electron.ipcRenderer.on('download-progress', (event, progressObj) => {
            this.showDownloadProgress(progressObj);
        });

        window.electron.ipcRenderer.on('update-downloaded', (event, info) => {
            this.showUpdateDownloaded(info);
        });

        window.electron.ipcRenderer.on('update-error', (event, error) => {
            this.showUpdateError(error);
        });

        // 页面加载完成后检查更新
        this.checkForUpdates();
    }

    // 检查更新
    checkForUpdates() {
        window.electron.ipcRenderer.send('check-for-updates');
    }

    // 显示发现新版本
    showUpdateAvailable(info) {
        this.showNotification('发现新版本', `版本 ${info.version} 现在可更新`, 'info');
    }

    // 显示当前已是最新版本
    showUpdateNotAvailable(info) {
        this.showNotification('已是最新版本', `当前版本 ${info.version} 已是最新`, 'success');
    }

    // 显示下载进度
    showDownloadProgress(progressObj) {
        const message = `下载进度: ${Math.round(progressObj.percent)}%`;
        this.showNotification('正在下载更新', message, 'info', true);
    }

    // 显示更新下载完成
    showUpdateDownloaded(info) {
        this.showNotification('更新下载完成', '新版本已准备好，重启应用即可完成更新', 'success');
    }

    // 显示更新错误
    showUpdateError(error) {
        this.showNotification('更新失败', error, 'error');
    }

    // 显示通知
    showNotification(title, message, type, autoClose = false) {
        // 如果页面中有Ant Design的message组件，使用它
        if (window.antd && window.antd.message) {
            switch (type) {
                case 'success':
                    window.antd.message.success(message);
                    break;
                case 'error':
                    window.antd.message.error(message);
                    break;
                case 'info':
                default:
                    window.antd.message.info(message);
                    break;
            }
        } else {
            // 否则使用浏览器原生通知
            console.log(`[${type}] ${title}: ${message}`);
            // 可以在这里添加自定义的通知UI
            alert(`${title}: ${message}`);
        }
    }
}

// 初始化自动更新器
document.addEventListener('DOMContentLoaded', () => {
    window.autoUpdater = new AutoUpdater();
});