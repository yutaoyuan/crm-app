/**
 * 前端全局错误处理器
 * 统一处理JavaScript错误、Promise拒绝、网络错误等
 */
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 50; // 最大保存错误数量
    this.init();
  }

  // 初始化错误处理
  init() {
    this.setupGlobalErrorHandlers();
    this.setupFetchInterceptor();
  }

  // 设置全局错误处理器
  setupGlobalErrorHandlers() {
    // 捕获JavaScript运行时错误
    window.addEventListener('error', (event) => {
      this.handleError({
        type: 'JavaScript Error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date().toISOString()
      });
    });

    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: 'Unhandled Promise Rejection',
        message: event.reason?.message || event.reason,
        stack: event.reason?.stack,
        timestamp: new Date().toISOString()
      });
      
      // 阻止在控制台显示默认错误
      event.preventDefault();
    });

    // 捕获资源加载错误
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.handleError({
          type: 'Resource Load Error',
          message: `Failed to load: ${event.target.src || event.target.href}`,
          element: event.target.tagName,
          timestamp: new Date().toISOString()
        });
      }
    }, true);
  }

  // 设置fetch拦截器
  setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // 如果响应不成功，记录错误
        if (!response.ok) {
          const url = args[0];
          const errorData = await response.clone().json().catch(() => ({}));
          
          this.handleNetworkError({
            url,
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            timestamp: new Date().toISOString()
          });
        }
        
        return response;
      } catch (error) {
        // 网络错误
        this.handleNetworkError({
          url: args[0],
          message: error.message,
          type: 'Network Error',
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
  }

  // 处理一般错误
  handleError(errorInfo) {
    console.error('Frontend Error:', errorInfo);
    
    // 保存错误到本地存储
    this.saveError(errorInfo);
    
    // 显示用户友好的错误提示
    this.showUserError(errorInfo);
    
    // 如果是严重错误，可以发送到服务器
    if (this.isCriticalError(errorInfo)) {
      this.reportError(errorInfo);
    }
  }

  // 处理网络错误
  handleNetworkError(errorInfo) {
    console.error('Network Error:', errorInfo);
    
    // 保存错误
    this.saveError({ ...errorInfo, category: 'network' });
    
    // 根据错误类型显示不同提示
    if (errorInfo.status === 401) {
      window.toast?.error('登录已过期，请重新登录');
      // 重定向到登录页
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else if (errorInfo.status === 403) {
      window.toast?.error('您没有权限执行此操作');
    } else if (errorInfo.status === 404) {
      window.toast?.error('请求的资源不存在');
    } else if (errorInfo.status >= 500) {
      window.toast?.error('服务器错误，请稍后重试');
    } else if (errorInfo.type === 'Network Error') {
      window.toast?.error('网络连接失败，请检查网络设置');
    } else {
      window.toast?.error(`请求失败: ${errorInfo.statusText || '未知错误'}`);
    }
  }

  // 显示用户友好的错误提示
  showUserError(errorInfo) {
    let message = '操作失败，请稍后重试';
    
    if (errorInfo.type === 'JavaScript Error') {
      message = '页面出现异常，请刷新页面重试';
    } else if (errorInfo.type === 'Resource Load Error') {
      message = '资源加载失败，请刷新页面重试';
    }
    
    // 使用toast显示错误，如果toast不可用则使用alert
    if (window.toast) {
      window.toast.error(message);
    } else {
      console.warn('Toast component not available, using alert');
      alert(message);
    }
  }

  // 判断是否为严重错误
  isCriticalError(errorInfo) {
    const criticalTypes = [
      'JavaScript Error',
      'Unhandled Promise Rejection'
    ];
    
    return criticalTypes.includes(errorInfo.type) ||
           (errorInfo.message && errorInfo.message.includes('ReferenceError')) ||
           (errorInfo.message && errorInfo.message.includes('TypeError'));
  }

  // 保存错误到本地存储
  saveError(errorInfo) {
    try {
      this.errors.unshift(errorInfo);
      
      // 限制错误数量
      if (this.errors.length > this.maxErrors) {
        this.errors = this.errors.slice(0, this.maxErrors);
      }
      
      localStorage.setItem('frontend_errors', JSON.stringify(this.errors));
    } catch (e) {
      console.warn('Failed to save error to localStorage:', e);
    }
  }

  // 报告错误到服务器
  async reportError(errorInfo) {
    try {
      // 添加用户和环境信息
      const report = {
        ...errorInfo,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        user: this.getCurrentUser()
      };
      
      // 发送错误报告到服务器
      await fetch('/api/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(report)
      });
    } catch (e) {
      console.warn('Failed to report error to server:', e);
    }
  }

  // 获取当前用户信息
  getCurrentUser() {
    try {
      return localStorage.getItem('username') || 'anonymous';
    } catch (e) {
      return 'anonymous';
    }
  }

  // 获取保存的错误列表
  getErrors() {
    try {
      const errors = localStorage.getItem('frontend_errors');
      return errors ? JSON.parse(errors) : [];
    } catch (e) {
      return [];
    }
  }

  // 清空错误列表
  clearErrors() {
    this.errors = [];
    localStorage.removeItem('frontend_errors');
  }

  // 手动记录错误
  logError(message, type = 'Manual', extra = {}) {
    this.handleError({
      type,
      message,
      ...extra,
      timestamp: new Date().toISOString()
    });
  }
}

// 创建全局错误处理实例
window.errorHandler = new ErrorHandler();

// 增强fetchWithAuth函数的错误处理
if (window.fetchWithAuth) {
  const originalFetchWithAuth = window.fetchWithAuth;
  
  window.fetchWithAuth = async function(...args) {
    try {
      return await originalFetchWithAuth.apply(this, args);
    } catch (error) {
      // 这里的错误已经由fetch拦截器处理了
      throw error;
    }
  };
}

// 导出错误处理器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
}