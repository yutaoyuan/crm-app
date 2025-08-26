/**
 * 性能监控系统
 * 收集和分析前端性能指标，包括页面加载、API响应、用户交互等
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = [];
    this.config = {
      enabled: true,
      sampleRate: 1.0, // 采样率 0-1
      reportInterval: 30000, // 30秒报告一次
      maxMetrics: 1000, // 最大保存指标数量
      autoReport: false // 禁用自动报告
    };
    this.init();
  }

  // 初始化性能监控
  init() {
    // 性能监控已禁用，避免不必要的API调用
    console.log('性能监控组件已加载但未启用自动报告');
    return;
    
    if (!this.config.enabled) return;

    this.setupNavigationTiming();
    this.setupResourceTiming();
    this.setupUserTiming();
    this.setupObservers();
    this.setupApiMonitoring();
    this.setupUserInteractionMonitoring();
    if (this.config.autoReport) {
      this.startReporting();
    }
  }

  // 页面导航性能监控
  setupNavigationTiming() {
    if (!window.performance || !window.performance.timing) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const timing = performance.timing;
        const navigationStart = timing.navigationStart;

        const metrics = {
          // DNS查询时间
          dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
          // TCP连接时间
          tcpConnect: timing.connectEnd - timing.connectStart,
          // SSL连接时间
          sslConnect: timing.secureConnectionStart > 0 ? 
            timing.connectEnd - timing.secureConnectionStart : 0,
          // 请求响应时间
          request: timing.responseEnd - timing.requestStart,
          // DOM解析时间
          domParse: timing.domContentLoadedEventStart - timing.responseEnd,
          // 资源加载时间
          resourceLoad: timing.loadEventStart - timing.domContentLoadedEventStart,
          // 总加载时间
          totalLoad: timing.loadEventEnd - navigationStart,
          // 首字节时间
          ttfb: timing.responseStart - navigationStart,
          // DOM Ready时间
          domReady: timing.domContentLoadedEventEnd - navigationStart,
          // 页面完全加载时间
          pageLoad: timing.loadEventEnd - navigationStart
        };

        this.recordMetric('navigation', metrics);
      }, 100);
    });
  }

  // 资源加载性能监控
  setupResourceTiming() {
    if (!window.performance || !window.performance.getEntriesByType) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const resources = performance.getEntriesByType('resource');
        const resourceMetrics = {
          totalResources: resources.length,
          totalSize: 0,
          averageLoadTime: 0,
          slowestResource: null,
          resourceTypes: {}
        };

        let totalLoadTime = 0;
        let slowestTime = 0;

        resources.forEach(resource => {
          const loadTime = resource.responseEnd - resource.startTime;
          const size = resource.transferSize || 0;

          totalLoadTime += loadTime;
          resourceMetrics.totalSize += size;

          if (loadTime > slowestTime) {
            slowestTime = loadTime;
            resourceMetrics.slowestResource = {
              name: resource.name,
              loadTime: Math.round(loadTime),
              size
            };
          }

          // 按类型统计
          const type = this.getResourceType(resource.name);
          if (!resourceMetrics.resourceTypes[type]) {
            resourceMetrics.resourceTypes[type] = { count: 0, totalSize: 0, totalTime: 0 };
          }
          resourceMetrics.resourceTypes[type].count++;
          resourceMetrics.resourceTypes[type].totalSize += size;
          resourceMetrics.resourceTypes[type].totalTime += loadTime;
        });

        resourceMetrics.averageLoadTime = Math.round(totalLoadTime / resources.length);
        this.recordMetric('resources', resourceMetrics);
      }, 100);
    });
  }

  // 用户自定义性能标记
  setupUserTiming() {
    // 提供便捷的性能标记方法
    window.performance.markStart = (name) => {
      if (performance.mark) {
        performance.mark(`${name}-start`);
      }
    };

    window.performance.markEnd = (name) => {
      if (performance.mark && performance.measure) {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
        
        const measure = performance.getEntriesByName(name, 'measure')[0];
        if (measure) {
          this.recordMetric('userTiming', {
            name,
            duration: Math.round(measure.duration),
            timestamp: Date.now()
          });
        }
      }
    };
  }

  // 设置性能观察器
  setupObservers() {
    // Largest Contentful Paint (LCP)
    if (window.PerformanceObserver) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.recordMetric('lcp', {
            value: Math.round(lastEntry.startTime),
            element: lastEntry.element?.tagName || 'unknown'
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (e) {
        console.warn('LCP observer not supported');
      }

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            this.recordMetric('fid', {
              value: Math.round(entry.processingStart - entry.startTime),
              eventType: entry.name
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (e) {
        console.warn('FID observer not supported');
      }

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          this.recordMetric('cls', { value: Math.round(clsValue * 1000) / 1000 });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (e) {
        console.warn('CLS observer not supported');
      }
    }
  }

  // API监控
  setupApiMonitoring() {
    if (!window.fetch) return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0];

      try {
        const response = await originalFetch.apply(window, args);
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        // 只监控API请求
        if (typeof url === 'string' && url.includes('/api/')) {
          this.recordMetric('api', {
            url: url.replace(window.location.origin, ''),
            method: args[1]?.method || 'GET',
            status: response.status,
            duration,
            success: response.ok,
            timestamp: Date.now()
          });
        }

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        if (typeof url === 'string' && url.includes('/api/')) {
          this.recordMetric('api', {
            url: url.replace(window.location.origin, ''),
            method: args[1]?.method || 'GET',
            duration,
            success: false,
            error: error.message,
            timestamp: Date.now()
          });
        }

        throw error;
      }
    };
  }

  // 用户交互监控
  setupUserInteractionMonitoring() {
    let interactionCount = 0;
    let totalInteractionTime = 0;

    // 点击事件监控
    document.addEventListener('click', (e) => {
      const startTime = performance.now();
      
      setTimeout(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        interactionCount++;
        totalInteractionTime += duration;

        this.recordMetric('interaction', {
          type: 'click',
          target: e.target.tagName,
          duration: Math.round(duration),
          totalInteractions: interactionCount,
          averageTime: Math.round(totalInteractionTime / interactionCount)
        });
      }, 0);
    });

    // 表单提交监控
    document.addEventListener('submit', (e) => {
      const startTime = performance.now();
      
      setTimeout(() => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordMetric('formSubmit', {
          formId: e.target.id || 'unknown',
          duration: Math.round(duration),
          timestamp: Date.now()
        });
      }, 0);
    });
  }

  // 记录性能指标
  recordMetric(type, data) {
    if (Math.random() > this.config.sampleRate) return;

    const metric = {
      type,
      data,
      timestamp: Date.now(),
      url: window.location.pathname,
      userAgent: navigator.userAgent
    };

    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }

    const typeMetrics = this.metrics.get(type);
    typeMetrics.push(metric);

    // 限制指标数量
    if (typeMetrics.length > this.config.maxMetrics) {
      typeMetrics.shift();
    }
  }

  // 获取资源类型
  getResourceType(url) {
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
      return 'image';
    } else if (['css'].includes(extension)) {
      return 'stylesheet';
    } else if (['js'].includes(extension)) {
      return 'script';
    } else if (['woff', 'woff2', 'ttf', 'eot'].includes(extension)) {
      return 'font';
    } else {
      return 'other';
    }
  }

  // 获取性能报告
  getPerformanceReport() {
    const report = {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metrics: {}
    };

    for (const [type, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      switch (type) {
        case 'api':
          report.metrics.api = this.analyzeApiMetrics(metrics);
          break;
        case 'navigation':
          report.metrics.navigation = metrics[metrics.length - 1]?.data;
          break;
        case 'resources':
          report.metrics.resources = metrics[metrics.length - 1]?.data;
          break;
        case 'lcp':
          report.metrics.lcp = metrics[metrics.length - 1]?.data;
          break;
        case 'fid':
          report.metrics.fid = metrics[metrics.length - 1]?.data;
          break;
        case 'cls':
          report.metrics.cls = metrics[metrics.length - 1]?.data;
          break;
        case 'interaction':
          report.metrics.interaction = this.analyzeInteractionMetrics(metrics);
          break;
        default:
          report.metrics[type] = metrics.slice(-10); // 最近10条记录
      }
    }

    return report;
  }

  // 分析API指标
  analyzeApiMetrics(metrics) {
    const recentMetrics = metrics.slice(-50); // 最近50次API调用
    const totalCalls = recentMetrics.length;
    const successfulCalls = recentMetrics.filter(m => m.data.success).length;
    const failedCalls = totalCalls - successfulCalls;
    
    const durations = recentMetrics.map(m => m.data.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate: Math.round((successfulCalls / totalCalls) * 100),
      avgDuration: Math.round(avgDuration),
      maxDuration,
      minDuration,
      slowestCalls: recentMetrics
        .filter(m => m.data.duration > avgDuration * 2)
        .slice(-5)
        .map(m => ({
          url: m.data.url,
          duration: m.data.duration,
          status: m.data.status
        }))
    };
  }

  // 分析交互指标
  analyzeInteractionMetrics(metrics) {
    const recentMetrics = metrics.slice(-20);
    if (recentMetrics.length === 0) return null;

    const lastMetric = recentMetrics[recentMetrics.length - 1];
    return {
      totalInteractions: lastMetric.data.totalInteractions,
      averageTime: lastMetric.data.averageTime,
      recentInteractions: recentMetrics.length
    };
  }

  // 开始定期报告
  startReporting() {
    setInterval(() => {
      if (this.shouldSendReport()) {
        this.sendReport();
      }
    }, this.config.reportInterval);

    // 页面卸载时发送报告
    window.addEventListener('beforeunload', () => {
      this.sendReport(true);
    });
  }

  // 判断是否应该发送报告
  shouldSendReport() {
    return this.metrics.size > 0 && Math.random() <= this.config.sampleRate;
  }

  // 发送性能报告
  async sendReport(isBeforeUnload = false) {
    try {
      const report = this.getPerformanceReport();
      
      if (isBeforeUnload && navigator.sendBeacon) {
        // 使用sendBeacon确保数据发送
        navigator.sendBeacon('/api/performance/report', JSON.stringify(report));
      } else {
        // 使用fetch发送
        await fetch('/api/performance/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(report)
        }).catch(error => {
          console.warn('Failed to send performance report:', error);
        });
      }

      // 清空已发送的指标
      this.metrics.clear();
    } catch (error) {
      console.warn('Failed to generate performance report:', error);
    }
  }

  // 获取当前性能状态
  getCurrentStats() {
    return {
      metricsCount: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
      memoryUsage: this.getMemoryUsage(),
      connectionType: this.getConnectionType(),
      deviceInfo: this.getDeviceInfo()
    };
  }

  // 获取内存使用情况
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }

  // 获取连接类型
  getConnectionType() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt
      };
    }
    return null;
  }

  // 获取设备信息
  getDeviceInfo() {
    return {
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency
    };
  }

  // 清空所有指标
  clear() {
    this.metrics.clear();
  }

  // 销毁监控器
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics.clear();
  }
}

// 创建全局性能监控实例
window.performanceMonitor = new PerformanceMonitor();

// 便捷方法
window.perfMark = (name) => window.performance.markStart?.(name);
window.perfMarkEnd = (name) => window.performance.markEnd?.(name);

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}