/**
 * 前端缓存管理系统
 * 提供智能缓存、数据版本控制和自动清理功能
 */
class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.storagePrefix = 'crm_cache_';
    this.versionKey = 'crm_cache_version';
    this.maxMemoryItems = 100;
    this.defaultTTL = 5 * 60 * 1000; // 5分钟默认TTL
    this.init();
  }

  // 初始化缓存管理器
  init() {
    this.checkStorageSupport();
    this.cleanExpiredItems();
    this.setupVersionControl();
    
    // 定期清理过期数据
    setInterval(() => {
      this.cleanExpiredItems();
    }, 60 * 1000); // 每分钟清理一次

    // 监听页面可见性变化，隐藏时清理内存缓存
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.memoryCache.clear();
      }
    });
  }

  // 检查存储支持
  checkStorageSupport() {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      this.localStorageSupported = true;
    } catch (e) {
      this.localStorageSupported = false;
      console.warn('LocalStorage not supported, using memory cache only');
    }
  }

  // 设置版本控制
  setupVersionControl() {
    const currentVersion = this.getCurrentVersion();
    const storedVersion = this.getStoredVersion();
    
    // 如果版本不匹配，清空所有缓存
    if (currentVersion !== storedVersion) {
      this.clearAllCache();
      this.setStoredVersion(currentVersion);
    }
  }

  // 获取当前版本（可以基于应用版本、用户等）
  getCurrentVersion() {
    const user = localStorage.getItem('username') || 'anonymous';
    const appVersion = '1.0.0'; // 可以从配置中获取
    return `${appVersion}_${user}`;
  }

  // 获取存储的版本
  getStoredVersion() {
    if (!this.localStorageSupported) return null;
    return localStorage.getItem(this.versionKey);
  }

  // 设置存储版本
  setStoredVersion(version) {
    if (!this.localStorageSupported) return;
    localStorage.setItem(this.versionKey, version);
  }

  // 生成缓存键
  generateKey(key, params = {}) {
    const paramString = Object.keys(params).length > 0 
      ? '_' + JSON.stringify(params)
      : '';
    return `${this.storagePrefix}${key}${paramString}`;
  }

  // 设置缓存
  set(key, data, options = {}) {
    const {
      ttl = this.defaultTTL,
      storage = 'auto', // 'memory', 'localStorage', 'auto'
      params = {}
    } = options;

    const cacheKey = this.generateKey(key, params);
    const cacheItem = {
      data,
      timestamp: Date.now(),
      ttl,
      key: cacheKey
    };

    // 决定存储位置
    const useLocalStorage = storage === 'localStorage' || 
      (storage === 'auto' && this.shouldUseLocalStorage(data));

    if (useLocalStorage && this.localStorageSupported) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
        this.memoryCache.set(cacheKey, cacheItem);
      }
    } else {
      this.memoryCache.set(cacheKey, cacheItem);
      
      // 限制内存缓存大小
      if (this.memoryCache.size > this.maxMemoryItems) {
        const oldestKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(oldestKey);
      }
    }

    return cacheItem;
  }

  // 获取缓存
  get(key, params = {}) {
    const cacheKey = this.generateKey(key, params);
    let cacheItem = null;

    // 首先从内存缓存查找
    if (this.memoryCache.has(cacheKey)) {
      cacheItem = this.memoryCache.get(cacheKey);
    } 
    // 然后从localStorage查找
    else if (this.localStorageSupported) {
      try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) {
          cacheItem = JSON.parse(stored);
          // 将频繁访问的数据移到内存缓存
          this.memoryCache.set(cacheKey, cacheItem);
        }
      } catch (e) {
        console.warn('Failed to parse cached data:', e);
      }
    }

    // 检查是否过期
    if (cacheItem && this.isExpired(cacheItem)) {
      this.delete(key, params);
      return null;
    }

    return cacheItem ? cacheItem.data : null;
  }

  // 检查缓存是否存在且未过期
  has(key, params = {}) {
    return this.get(key, params) !== null;
  }

  // 删除缓存
  delete(key, params = {}) {
    const cacheKey = this.generateKey(key, params);
    
    this.memoryCache.delete(cacheKey);
    
    if (this.localStorageSupported) {
      localStorage.removeItem(cacheKey);
    }
  }

  // 清空指定前缀的缓存
  deleteByPrefix(prefix) {
    const fullPrefix = this.storagePrefix + prefix;
    
    // 清理内存缓存
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.memoryCache.delete(key);
      }
    }

    // 清理localStorage
    if (this.localStorageSupported) {
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => localStorage.removeItem(key));
    }
  }

  // 清空所有缓存
  clearAllCache() {
    this.memoryCache.clear();
    
    if (this.localStorageSupported) {
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => localStorage.removeItem(key));
    }
  }

  // 检查是否过期
  isExpired(cacheItem) {
    return Date.now() - cacheItem.timestamp > cacheItem.ttl;
  }

  // 决定是否使用localStorage
  shouldUseLocalStorage(data) {
    // 大于100KB的数据不存储到localStorage
    const dataSize = JSON.stringify(data).length;
    return dataSize < 100 * 1024;
  }

  // 清理过期项目
  cleanExpiredItems() {
    // 清理内存缓存
    for (const [key, item] of this.memoryCache.entries()) {
      if (this.isExpired(item)) {
        this.memoryCache.delete(key);
      }
    }

    // 清理localStorage
    if (this.localStorageSupported) {
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (this.isExpired(item)) {
              keysToDelete.push(key);
            }
          } catch (e) {
            // 解析失败的项目也删除
            keysToDelete.push(key);
          }
        }
      }
      keysToDelete.forEach(key => localStorage.removeItem(key));
    }
  }

  // 获取缓存统计信息
  getStats() {
    let localStorageSize = 0;
    let localStorageCount = 0;

    if (this.localStorageSupported) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          localStorageCount++;
          localStorageSize += localStorage.getItem(key).length;
        }
      }
    }

    return {
      memoryItems: this.memoryCache.size,
      localStorageItems: localStorageCount,
      localStorageSizeKB: Math.round(localStorageSize / 1024),
      version: this.getCurrentVersion()
    };
  }

  // 预加载数据
  async preload(key, dataLoader, options = {}) {
    if (!this.has(key, options.params)) {
      try {
        const data = await dataLoader();
        this.set(key, data, options);
        return data;
      } catch (error) {
        console.warn('Preload failed:', error);
        return null;
      }
    }
    return this.get(key, options.params);
  }

  // 智能缓存：先返回缓存数据，然后在后台更新
  async smartCache(key, dataLoader, options = {}) {
    const cached = this.get(key, options.params);
    
    // 如果有缓存，立即返回
    if (cached) {
      // 异步刷新数据
      dataLoader().then(newData => {
        this.set(key, newData, options);
      }).catch(error => {
        console.warn('Background refresh failed:', error);
      });
      
      return cached;
    }

    // 没有缓存，等待数据加载
    try {
      const data = await dataLoader();
      this.set(key, data, options);
      return data;
    } catch (error) {
      console.error('Data loading failed:', error);
      throw error;
    }
  }
}

// 创建全局缓存管理器实例
window.cacheManager = new CacheManager();

// API缓存装饰器
class ApiCache {
  constructor(cacheManager) {
    this.cache = cacheManager;
  }

  // 缓存GET请求
  async cachedGet(url, options = {}) {
    const {
      ttl = 5 * 60 * 1000, // 5分钟
      params = {},
      forceRefresh = false
    } = options;

    const cacheKey = `api_${url}`;
    
    if (!forceRefresh && this.cache.has(cacheKey, params)) {
      return this.cache.get(cacheKey, params);
    }

    try {
      const response = await fetchWithAuth(url, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // 只缓存成功的响应
      if (data.success) {
        this.cache.set(cacheKey, data, { ttl, params });
      }

      return data;
    } catch (error) {
      // 如果请求失败但有缓存，返回缓存数据
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        console.warn('Using cached data due to request failure:', error);
        return cached;
      }
      throw error;
    }
  }

  // 清除API缓存
  invalidateApi(pattern) {
    this.cache.deleteByPrefix(`api_${pattern}`);
  }

  // 清除所有API缓存
  clearApiCache() {
    this.cache.deleteByPrefix('api_');
  }
}

// 创建API缓存实例
window.apiCache = new ApiCache(window.cacheManager);

// 增强fetchWithAuth函数
if (window.fetchWithAuth) {
  const originalFetchWithAuth = window.fetchWithAuth;
  
  // 添加缓存功能的fetchWithAuth
  window.fetchWithAuthCached = async function(url, options = {}) {
    const { cache = false, ...fetchOptions } = options;
    
    if (cache && fetchOptions.method === 'GET') {
      return window.apiCache.cachedGet(url, cache);
    }
    
    // 对于非GET请求或非缓存请求，使用原始函数
    const result = await originalFetchWithAuth(url, fetchOptions);
    
    // 如果是修改操作，清除相关缓存
    if (['POST', 'PUT', 'DELETE'].includes(fetchOptions.method?.toUpperCase())) {
      const pathSegments = url.split('/');
      if (pathSegments.length > 2) {
        const resource = pathSegments[pathSegments.length - 1];
        window.apiCache.invalidateApi(resource);
      }
    }
    
    return result;
  };
}

// 导出缓存管理器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CacheManager, ApiCache };
}