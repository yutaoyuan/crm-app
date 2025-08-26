/**
 * Toast 提示组件
 * 提供成功、警告、错误、信息等类型的提示消息
 */
class Toast {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.createContainer();
  }

  // 创建Toast容器
  createContainer() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  // 显示Toast消息
  show(message, type = 'info', duration = 3000) {
    const toast = this.createToast(message, type);
    this.container.appendChild(toast);
    this.toasts.push(toast);

    // 动画显示
    setTimeout(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    }, 10);

    // 自动关闭
    if (duration > 0) {
      setTimeout(() => {
        this.hide(toast);
      }, duration);
    }

    return toast;
  }

  // 创建Toast元素
  createToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // 基础样式
    const baseStyle = `
      min-width: 300px;
      max-width: 500px;
      margin-bottom: 10px;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      line-height: 1.5;
      pointer-events: auto;
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease-in-out;
      position: relative;
      display: flex;
      align-items: center;
      word-wrap: break-word;
    `;

    // 类型特定样式
    const typeStyles = {
      success: `
        background-color: #f6ffed;
        border: 1px solid #b7eb8f;
        color: #389e0d;
      `,
      error: `
        background-color: #fff2f0;
        border: 1px solid #ffccc7;
        color: #cf1322;
      `,
      warning: `
        background-color: #fffbe6;
        border: 1px solid #ffe58f;
        color: #d46b08;
      `,
      info: `
        background-color: #e6f7ff;
        border: 1px solid #91d5ff;
        color: #0958d9;
      `
    };

    toast.style.cssText = baseStyle + (typeStyles[type] || typeStyles.info);

    // 图标
    const icon = this.getIcon(type);
    const iconElement = document.createElement('span');
    iconElement.innerHTML = icon;
    iconElement.style.cssText = `
      margin-right: 8px;
      font-size: 16px;
      flex-shrink: 0;
    `;

    // 消息内容
    const messageElement = document.createElement('span');
    messageElement.textContent = message;
    messageElement.style.cssText = 'flex: 1;';

    // 关闭按钮
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      margin-left: 8px;
      padding: 0;
      color: inherit;
      opacity: 0.7;
      flex-shrink: 0;
    `;
    closeButton.onclick = () => this.hide(toast);

    toast.appendChild(iconElement);
    toast.appendChild(messageElement);
    toast.appendChild(closeButton);

    return toast;
  }

  // 获取类型对应的图标
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  // 隐藏Toast
  hide(toast) {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }
    }, 300);
  }

  // 清空所有Toast
  clear() {
    this.toasts.forEach(toast => this.hide(toast));
  }

  // 便捷方法
  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 4000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }
}

// 创建全局Toast实例
window.toast = new Toast();

// 导出Toast类（如果需要）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Toast;
}