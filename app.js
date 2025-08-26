// 设置控制台编码
process.env.LANG = 'zh_CN.UTF-8';
process.env.LC_ALL = 'zh_CN.UTF-8';

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const { db, init, setupTriggers } = require('./models/db');
const cookieParser = require('cookie-parser');
const morganLogger = require('morgan');
const { isAuthenticated } = require('./middleware/auth');
const { globalErrorHandler, notFoundHandler, initErrorHandling } = require('./middleware/errorHandler');
const { logger, logApiAccess, logError } = require('./utils/logger');
const { helmetConfig, apiRateLimit, sessionSecurityConfig, sessionTimeoutCheck, requestLogger } = require('./middleware/security');
const net = require('net');

// 导入路由
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const pointsRoutes = require('./routes/points');
const visitsRoutes = require('./routes/visits');

const app = express();
let PORT = process.env.PORT || 3002;

// 查找可用端口的函数
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

// 配置中间件
// 安全中间件
app.use(helmetConfig);

// 启用Gzip压缩
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // 压缩级别 1-9，6是默认值，平衡压缩率和速度
  threshold: 1024 // 只压缩大于1KB的响应
}));

app.use(morganLogger('dev', {
  charset: 'utf-8'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// 请求日志中间件
app.use(requestLogger);

// API访问日志中间件
app.use(logApiAccess);

// 更详细的CORS配置
app.use(cors({
  origin: function(origin, callback) {
    callback(null, true); // 允许所有来源
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// 添加调试中间件，打印所有请求
app.use((req, res, next) => {
  console.log('======= 请求详情 =======');
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Session ID:', req.sessionID);
  console.log('User:', req.session?.user?.username || 'none');
  console.log('===========================');
  next();
});

// 配置会话（使用安全配置）
const sessionStorePath = path.join(process.resourcesPath, 'databaseFolder');
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: sessionStorePath
  }),
  ...sessionSecurityConfig
}));

// 会话超时检查
app.use(sessionTimeoutCheck);

// 静态文件配置缓存
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y', // 缓存时间为1年
  etag: true, // 启用ETag
  lastModified: true, // 启用Last-Modified
  setHeaders: (res, path) => {
    // 为HTML文件设置较短的缓存时间
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1小时
    }
    // 为CSS和JS文件设置较长的缓存时间
    else if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年
    }
    // 为图片文件设置中等缓存时间
    else if (path.match(/\.(jpg|jpeg|png|gif|ico|svg)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30天
    }
  }
}));

// 路由（添加API限流）
app.use('/api/', apiRateLimit); // API限流
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/visits', visitsRoutes);

// 前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup a simple route to ensure server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve the customers page
app.get('/customers', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'customers.html'));
});

// Serve the points page
app.get('/points', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'points.html'));
});

// Serve the points page from /pages/points path (for compatibility)
app.get('/pages/points', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'points.html'));
});

// Serve the sales page
app.get('/sales', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'sales.html'));
});

// Serve the sales page from /pages/sales path (for compatibility)
app.get('/pages/sales', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'sales.html'));
});

// Serve the customers page from /pages/customers path (for compatibility)
app.get('/pages/customers', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'customers.html'));
});

// Serve the visits page
app.get('/visits', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'visits.html'));
});

// Serve the visits page from /pages/visits path (for compatibility)
app.get('/pages/visits', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'visits.html'));
});

// 错误日志中间件（在全局错误处理之前）
app.use(logError);

// Catch 404 and forward to error handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

// 初始化错误处理
initErrorHandling();

logger.info('应用启动中...', { version: '1.0.0' });

// 初始化数据库和启动服务器
init()
  .then(async () => {
    try {
      PORT = await findAvailablePort(PORT);
      app.listen(PORT, () => {
        logger.info('服务器启动成功', { port: PORT, env: process.env.NODE_ENV || 'development' });
      });
    } catch (err) {
      logger.error('启动服务器失败', { error: err.message, stack: err.stack });
    }
  })
  .catch(err => {
    logger.error('数据库初始化失败', { error: err.message, stack: err.stack });
  });

module.exports = { app, PORT }; 