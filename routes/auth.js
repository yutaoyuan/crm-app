const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../models/db');

// 登录路由
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      
      if (!match) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }
      
      // 登录成功，创建会话
      req.session.user = {
        id: user.id,
        username: user.username
      };
      
      return res.status(200).json({ 
        message: '登录成功',
        user: {
          id: user.id,
          username: user.username
        }
      });
    });
  });
});

// 检查登录状态
router.get('/status', (req, res) => {
  if (req.session && req.session.user) {
    return res.status(200).json({ 
      isLoggedIn: true,
      authenticated: true,
      user: req.session.user
    });
  } else {
    return res.status(200).json({ 
      isLoggedIn: false,
      authenticated: false
    });
  }
});

// 新增 - 检查身份验证状态（更详细）
router.get('/check', (req, res) => {
  console.log('检查身份验证状态:');
  console.log('- 会话:', req.session ? '存在' : '不存在');
  console.log('- 会话ID:', req.sessionID);
  console.log('- 用户:', req.session?.user ? req.session.user.username : '无');
  console.log('- 请求头:', req.headers);
  
  return res.status(200).json({
    isLoggedIn: !!(req.session && req.session.user),
    sessionExists: !!req.session,
    sessionId: req.sessionID,
    user: req.session?.user ? {
      id: req.session.user.id,
      username: req.session.user.username
    } : null,
    cookies: req.cookies,
    headers: {
      cookie: req.headers.cookie,
      referer: req.headers.referer,
      origin: req.headers.origin
    }
  });
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: '登出失败' });
    }
    res.clearCookie('connect.sid');
    return res.status(200).json({ message: '登出成功' });
  });
});

module.exports = router; 