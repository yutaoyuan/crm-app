/**
 * 日志系统
 * 使用Winston实现结构化日志记录
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
// 使用应用数据目录而不是当前工作目录
const logDir = path.join(require('electron').app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    console.log('创建日志目录成功:', logDir);
  } catch (err) {
    console.error('创建日志目录失败:', err);
    // 如果无法创建日志目录，使用临时目录
    const tempLogDir = path.join(require('os').tmpdir(), 'crm-logs');
    if (!fs.existsSync(tempLogDir)) {
      fs.mkdirSync(tempLogDir, { recursive: true });
    }
    logDir = tempLogDir;
    console.log('使用临时日志目录:', logDir);
  }
}

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 控制台输出格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// 创建日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'crm-system',
    pid: process.pid,
    hostname: require('os').hostname()
  },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    }),
    
    // 所有日志文件（按日期轮转）
    new DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info'
    }),
    
    // 错误日志文件
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    }),
    
    // 操作审计日志
    new DailyRotateFile({
      filename: path.join(logDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  
  // 处理未捕获的异常
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],
  
  // 处理未处理的Promise拒绝
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// 扩展日志方法
class CRMLogger {
  constructor(winstonLogger) {
    this.logger = winstonLogger;
  }

  // 基础日志方法
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  // 业务日志方法
  apiAccess(req, res) {
    const responseTime = res.getHeader('X-Response-Time') || 0;
    this.info('API访问', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      user: req.session?.user?.username || 'anonymous',
      category: 'api_access'
    });
  }

  userLogin(username, success, ip, reason = null) {
    this.info('用户登录', {
      username,
      success,
      ip,
      reason,
      category: 'user_auth'
    });
  }

  userLogout(username, ip) {
    this.info('用户登出', {
      username,
      ip,
      category: 'user_auth'
    });
  }

  dataOperation(operation, table, recordId, user, oldData = null, newData = null) {
    this.info('数据操作', {
      operation, // create, read, update, delete
      table,
      recordId,
      user,
      oldData,
      newData,
      category: 'data_operation'
    });
  }

  securityEvent(event, details, severity = 'medium') {
    this.warn('安全事件', {
      event,
      details,
      severity,
      category: 'security'
    });
  }

  performanceMetric(metric, value, unit, context = {}) {
    this.info('性能指标', {
      metric,
      value,
      unit,
      context,
      category: 'performance'
    });
  }

  businessEvent(event, details, user) {
    this.info('业务事件', {
      event,
      details,
      user,
      category: 'business'
    });
  }

  // 创建子日志记录器
  child(meta) {
    const childLogger = this.logger.child(meta);
    return new CRMLogger(childLogger);
  }

  // 获取日志统计信息
  async getLogStats(days = 7) {
    // 这里可以实现日志统计逻辑
    // 比如读取日志文件，统计错误数量、API访问量等
    return {
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      apiCalls: 0,
      uniqueUsers: 0,
      period: `${days} days`
    };
  }
}

// 创建CRM日志实例
const crmLogger = new CRMLogger(logger);

// 中间件：记录API访问
const logApiAccess = (req, res, next) => {
  const start = Date.now();
  
  // 记录响应时间
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    
    // 只在响应头未发送时设置响应时间头部
    if (!res.headersSent) {
      try {
        res.setHeader('X-Response-Time', responseTime);
      } catch (error) {
        // 忽略头部设置错误
      }
    }
    
    // 只记录API请求
    if (req.originalUrl.startsWith('/api/')) {
      crmLogger.apiAccess(req, res);
    }
  });
  
  next();
};

// 中间件：记录错误
const logError = (err, req, res, next) => {
  crmLogger.error('请求处理错误', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.session?.user?.username || 'anonymous',
    category: 'error'
  });
  
  next(err);
};

module.exports = {
  logger: crmLogger,
  logApiAccess,
  logError,
  winston: logger
};