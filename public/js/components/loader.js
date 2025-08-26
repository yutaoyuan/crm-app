/**
 * 组件加载器
 * 统一管理和初始化所有优化组件
 */
class ComponentLoader {
  constructor() {
    this.components = new Map();
    this.loadOrder = [
      'errorHandler',
      'toast', 
      'skeleton',
      'validator',
      'cache',
      'performance',
      'virtualScroll'
    ];
    this.loaded = new Set();
    this.basePath = '/js/components/';
  }

  // 加载所有组件
  async loadAll() {
    console.log('开始加载优化组件...');
    
    // 强制清除任何可能存在的缓存提示
    this.clearCachedToasts();
    
    try {
      // 按顺序加载组件
      for (const componentName of this.loadOrder) {
        await this.loadComponent(componentName);
      }
      
      // 初始化组件
      this.initializeComponents();
      
      console.log('所有优化组件加载完成');
      
      // 触发组件加载完成事件
      this.dispatchLoadedEvent();
      
    } catch (error) {
      console.error('组件加载失败:', error);
      this.handleLoadError(error);
    }
  }

  // 清除缓存的Toast提示
  clearCachedToasts() {
    try {
      // 清除所有可能的toast容器
      const toastContainers = document.querySelectorAll('.toast-container, .swal2-container, .ant-message');
      toastContainers.forEach(container => {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      });
      
      // 清除所有可能的toast元素
      const toasts = document.querySelectorAll('.toast, .swal2-popup, .ant-message-notice');
      toasts.forEach(toast => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      });
      
      // 重置Toast实例（如果存在）
      if (window.toast && typeof window.toast.clear === 'function') {
        window.toast.clear();
      }
      
      console.log('已清除所有缓存的Toast提示');
    } catch (error) {
      console.warn('清除缓存Toast时出错:', error);
    }
  }

  // 加载单个组件
  async loadComponent(name) {
    if (this.loaded.has(name)) {
      return;
    }

    const script = document.createElement('script');
    // 添加缓存破坏参数确保获取最新版本
    script.src = `${this.basePath}${name}.js?v=${Date.now()}`;
    script.async = false; // 保证加载顺序

    return new Promise((resolve, reject) => {
      script.onload = () => {
        this.loaded.add(name);
        console.log(`组件 ${name} 加载完成`);
        resolve();
      };

      script.onerror = () => {
        console.error(`组件 ${name} 加载失败`);
        reject(new Error(`Failed to load component: ${name}`));
      };

      document.head.appendChild(script);
    });
  }

  // 初始化组件
  initializeComponents() {
    // 错误处理器已自动初始化
    if (window.errorHandler) {
      console.log('✓ 错误处理器已就绪');
    }

    // Toast已自动初始化
    if (window.toast) {
      console.log('✓ Toast提示组件已就绪');
    }

    // 骨架屏已自动初始化
    if (window.skeleton) {
      console.log('✓ 骨架屏组件已就绪');
    }

    // 表单验证器已自动初始化
    if (window.formValidator) {
      console.log('✓ 表单验证器已就绪');
    }

    // 缓存管理器已自动初始化
    if (window.cacheManager) {
      console.log('✓ 缓存管理器已就绪');
    }

    // 性能监控器已自动初始化
    if (window.performanceMonitor) {
      console.log('✓ 性能监控器已就绪');
    }

    // 虚拟滚动组件已就绪
    if (window.createVirtualTable) {
      console.log('✓ 虚拟滚动组件已就绪');
    }

    // 设置全局快捷方法
    this.setupGlobalMethods();
  }

  // 设置全局快捷方法
  setupGlobalMethods() {
    // Toast快捷方法
    if (window.toast) {
      window.showSuccess = (msg) => window.toast.success(msg);
      window.showError = (msg) => window.toast.error(msg);
      window.showWarning = (msg) => window.toast.warning(msg);
      window.showInfo = (msg) => window.toast.info(msg);
    }

    // 骨架屏快捷方法
    if (window.skeleton) {
      window.showTableSkeleton = (container, rows, cols) => 
        window.skeleton.showTable(container, rows, cols);
      window.hideSkeleton = (container) => 
        window.skeleton.hide(container);
    }

    // 缓存快捷方法
    if (window.cacheManager) {
      window.setCache = (key, data, options) => 
        window.cacheManager.set(key, data, options);
      window.getCache = (key, params) => 
        window.cacheManager.get(key, params);
      window.clearCache = (pattern) => 
        window.cacheManager.deleteByPrefix(pattern);
    }

    // 性能监控快捷方法
    if (window.performanceMonitor) {
      window.markPerformance = (name) => {
        if (window.performance?.markStart) {
          window.performance.markStart(name);
        }
      };
      window.markPerformanceEnd = (name) => {
        if (window.performance?.markEnd) {
          window.performance.markEnd(name);
        }
      };
    }
  }

  // 处理加载错误
  handleLoadError(error) {
    // 使用原生alert作为后备
    if (window.toast) {
      window.toast.error('组件加载失败，部分功能可能不可用');
    } else {
      console.warn('组件加载失败，但系统仍可正常使用');
    }
  }

  // 触发组件加载完成事件
  dispatchLoadedEvent() {
    const event = new CustomEvent('componentsLoaded', {
      detail: {
        loadedComponents: Array.from(this.loaded),
        totalComponents: this.loadOrder.length
      }
    });
    document.dispatchEvent(event);
  }

  // 检查组件是否已加载
  isLoaded(componentName) {
    return this.loaded.has(componentName);
  }

  // 获取加载状态
  getLoadStatus() {
    return {
      total: this.loadOrder.length,
      loaded: this.loaded.size,
      pending: this.loadOrder.filter(name => !this.loaded.has(name)),
      complete: this.loaded.size === this.loadOrder.length
    };
  }

  // 重新加载组件
  async reloadComponent(name) {
    if (this.loaded.has(name)) {
      this.loaded.delete(name);
    }
    await this.loadComponent(name);
  }
}

// 创建全局组件加载器
window.componentLoader = new ComponentLoader();

// 页面加载完成后自动加载组件
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.componentLoader.loadAll();
  });
} else {
  // 页面已经加载完成
  window.componentLoader.loadAll();
}

// 监听组件加载完成事件
document.addEventListener('componentsLoaded', (event) => {
  console.log('所有优化组件加载完成:', event.detail);
  
  // 延迟清理，确保所有可能的提示都被移除
  setTimeout(() => {
    window.componentLoader.clearCachedToasts();
    
    // 额外检查：移除任何包含"系统优化"或"已启用"文本的元素
    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      if (el.textContent && (
        el.textContent.includes('系统优化功能已启用') ||
        el.textContent.includes('优化功能已启用') ||
        el.textContent.includes('功能已启用')
      )) {
        console.log('发现并移除缓存的提示元素:', el.textContent);
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
    });
  }, 1000);
  
  // 可以在这里添加额外的初始化逻辑
  // Toast提示已移除，避免干扰用户
});

// 导出组件加载器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComponentLoader;
}