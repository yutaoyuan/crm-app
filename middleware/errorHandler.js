/**
 * 全局错误处理中间件
 * 统一处理应用中的错误，提供标准化的错误响应
 */

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 常见错误类型
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class NotFoundError extends AppError {
  constructor(resource = '资源') {
    super(`${resource}未找到`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = '禁止访问') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409, 'CONFLICT');
  }
}

// 异步错误包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 全局错误处理中间件
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  console.error('错误详情:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    user: req.session?.user?.username || 'anonymous'
  });

  // SQLite约束错误
  if (err.code === 'SQLITE_CONSTRAINT') {
    const message = '数据约束冲突，请检查输入数据';
    error = new ValidationError(message);
  }

  // SQLite语法错误
  if (err.code === 'SQLITE_ERROR') {
    const message = '数据库操作失败';
    error = new AppError(message, 500, 'DATABASE_ERROR');
  }

  // JSON解析错误
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const message = '请求数据格式错误';
    error = new ValidationError(message);
  }

  // 默认错误
  if (!error.isOperational) {
    error = new AppError('服务器内部错误', 500, 'INTERNAL_ERROR');
  }

  // 发送错误响应
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: error
      })
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  });
};

// 404处理中间件
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`路径 ${req.originalUrl}`);
  next(error);
};

// 未捕获异常处理
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
    console.error('应用即将退出...');
    process.exit(1);
  });
};

// 未处理的Promise拒绝
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    console.error('Promise:', promise);
    // 优雅地关闭服务器
    process.exit(1);
  });
};

// 初始化错误处理
const initErrorHandling = () => {
  handleUncaughtException();
  handleUnhandledRejection();
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  initErrorHandling
};