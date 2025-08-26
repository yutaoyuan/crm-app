/**
 * 安全中间件配置
 * 包括会话安全、CSRF防护、请求限流等
 */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// Helmet安全配置
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // 禁用以支持本地资源
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// 通用限流配置
const createRateLimit = (windowMs, max, message = '请求过于频繁，请稍后重试') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message
      }
    },
    standardHeaders: true, // 返回限流信息在 `RateLimit-*` headers
    legacyHeaders: false, // 禁用 `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('请求限流触发', {
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        user: req.session?.user?.username || 'anonymous'
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message
        }
      });
    }
  });
};

// API通用限流 - 每分钟100个请求
const apiRateLimit = createRateLimit(
  60 * 1000, // 1分钟
  100,
  'API请求过于频繁，请稍后重试'
);

// 登录限流 - 每15分钟5次尝试
const loginRateLimit = createRateLimit(
  15 * 60 * 1000, // 15分钟
  5,
  '登录尝试次数过多，请15分钟后重试'
);

// 严格限流（用于敏感操作） - 每小时10次
const strictRateLimit = createRateLimit(
  60 * 60 * 1000, // 1小时
  10,
  '操作过于频繁，请1小时后重试'
);

// 会话安全配置
const sessionSecurityConfig = {
  name: 'crm.session', // 自定义session名称
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  rolling: true, // 每次请求时重置过期时间
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 生产环境使用HTTPS
    httpOnly: true, // 防止XSS攻击
    maxAge: 2 * 60 * 60 * 1000, // 2小时过期
    sameSite: 'strict' // 防止CSRF攻击
  }
};

// 会话超时检查中间件
const sessionTimeoutCheck = (req, res, next) => {
  if (req.session && req.session.user) {
    const now = Date.now();
    const lastActivity = req.session.lastActivity || now;
    const timeout = 2 * 60 * 60 * 1000; // 2小时无活动超时

    if (now - lastActivity > timeout) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('销毁超时会话失败', { error: err.message });
        }
      });
      
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_TIMEOUT',
          message: '会话已超时，请重新登录'
        }
      });
    }

    // 更新最后活动时间
    req.session.lastActivity = now;
  }
  
  next();
};

// IP白名单检查（可选）
const ipWhitelistCheck = (whitelist = []) => {
  return (req, res, next) => {
    if (whitelist.length === 0) {
      return next();
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    const isAllowed = whitelist.some(ip => {
      if (ip.includes('/')) {
        // CIDR格式支持
        const [network, mask] = ip.split('/');
        return isInSubnet(clientIP, network, mask);
      }
      return clientIP === ip;
    });

    if (!isAllowed) {
      logger.warn('IP访问被阻止', {
        ip: clientIP,
        url: req.originalUrl,
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: '访问被拒绝'
        }
      });
    }

    next();
  };
};

// 简单的CIDR子网检查
const isInSubnet = (ip, network, mask) => {
  // 这里可以使用更复杂的IP地址库，简化实现
  return ip.startsWith(network.split('.').slice(0, Math.floor(mask / 8)).join('.'));
};

// 登录尝试跟踪
const loginAttemptTracker = new Map();

const trackLoginAttempts = (req, res, next) => {
  const ip = req.ip;
  const username = req.body.username;
  const key = `${ip}:${username}`;

  if (!loginAttemptTracker.has(key)) {
    loginAttemptTracker.set(key, {
      attempts: 0,
      lastAttempt: Date.now(),
      blocked: false
    });
  }

  const record = loginAttemptTracker.get(key);
  const now = Date.now();
  const timeDiff = now - record.lastAttempt;

  // 如果距离上次尝试超过15分钟，重置计数
  if (timeDiff > 15 * 60 * 1000) {
    record.attempts = 0;
    record.blocked = false;
  }

  // 检查是否被阻止
  if (record.blocked) {
    logger.warn('登录被阻止 - 尝试次数过多', {
      ip,
      username,
      attempts: record.attempts
    });

    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: '登录尝试次数过多，请15分钟后重试'
      }
    });
  }

  // 记录登录尝试
  record.attempts++;
  record.lastAttempt = now;

  // 如果尝试次数超过5次，阻止登录
  if (record.attempts > 5) {
    record.blocked = true;
    logger.warn('登录尝试次数超限', {
      ip,
      username,
      attempts: record.attempts
    });
  }

  req.loginAttemptRecord = record;
  next();
};

// 登录成功后重置尝试计数
const resetLoginAttempts = (req) => {
  const ip = req.ip;
  const username = req.body.username;
  const key = `${ip}:${username}`;
  
  if (loginAttemptTracker.has(key)) {
    loginAttemptTracker.delete(key);
  }
};

// 请求日志中间件
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // 记录请求开始
  logger.info('请求开始', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.session?.user?.username || 'anonymous'
  });

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('请求完成', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      user: req.session?.user?.username || 'anonymous'
    });
  });

  next();
};

// 清理过期的登录尝试记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttemptTracker.entries()) {
    if (now - record.lastAttempt > 60 * 60 * 1000) { // 1小时
      loginAttemptTracker.delete(key);
    }
  }
}, 10 * 60 * 1000); // 每10分钟清理一次

module.exports = {
  helmetConfig,
  apiRateLimit,
  loginRateLimit,
  strictRateLimit,
  sessionSecurityConfig,
  sessionTimeoutCheck,
  ipWhitelistCheck,
  trackLoginAttempts,
  resetLoginAttempts,
  requestLogger
};