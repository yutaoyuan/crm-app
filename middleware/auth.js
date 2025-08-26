/**
 * 身份验证中间件
 * 检查用户是否已登录，未登录则拒绝访问
 */
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    if (!req._authLogged) {
      console.log('User authenticated:', req.session.user.username);
      req._authLogged = true;
    }
    return next();
  }
  
  if (!req._authFailedLogged) {
    console.log('Authentication failed, redirecting to login');
    req._authFailedLogged = true;
  }
  return res.status(401).json({ message: '未授权，请先登录' });
};

/**
 * API身份验证中间件
 * 用于保护API路由，确保请求来自已登录用户
 */
const authenticateToken = (req, res, next) => {
  if (req.session && req.session.user) {
    // 将用户信息附加到请求对象
    req.user = req.session.user;
    return next();
  }
  
  console.log('API鉴权失败:', req.originalUrl);
  return res.status(401).json({ 
    success: false,
    message: '未授权，请先登录' 
  });
};

module.exports = { isAuthenticated, authenticateToken };