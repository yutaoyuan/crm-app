const express = require('express');
const router = express.Router();
const { db } = require('../models/db');
const { authenticateToken } = require('../middleware/auth');

// 内存缓存
const cache = {
  visits: {},
  lastClearTime: Date.now()
};

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

// 清理缓存
function clearCacheIfNeeded() {
  const now = Date.now();
  if (now - cache.lastClearTime > CACHE_TTL) {
    cache.visits = {};
    cache.lastClearTime = now;
    console.log('回访缓存已清理');
  }
}

// 清除所有回访缓存的函数
function clearAllVisitsCache() {
  cache.visits = {};
  cache.lastClearTime = Date.now();
  console.log('手动清理所有回访缓存');
  return true;
}

// 全局共享缓存，以便其他模块访问
global.cache = global.cache || {};
global.cache.visits = cache.visits;

// 生成缓存键
function getCacheKey(params) {
  return JSON.stringify(params);
}

// 添加回访记录
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_phone,
      visit_date,
      visit_type,
      visit_purpose,
      visit_result,
      notes
    } = req.body;
    
    // 基础验证
    if (!customer_id || !customer_name || !customer_phone || !visit_date || !visit_type) {
      return res.status(400).json({
        success: false,
        message: '缺少必要字段'
      });
    }
    
    // 插入回访记录
    const insertQuery = `
      INSERT INTO customer_visits (
        customer_id,
        customer_name,
        customer_phone,
        visit_date,
        visit_type,
        visit_purpose,
        visit_result,
        notes,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(insertQuery, [
      customer_id,
      customer_name,
      customer_phone,
      visit_date,
      visit_type,
      visit_purpose || null,
      visit_result || null,
      notes || null,
      req.user.id // 当前登录用户ID
    ], function(err) {
      if (err) {
        console.error('插入回访记录失败:', err);
        return res.status(500).json({
          success: false,
          message: '服务器错误，添加回访记录失败'
        });
      }
      
      // 清空缓存
      cache.visits = {};
      
      // 回访记录添加成功
      res.status(201).json({
        success: true,
        message: '回访记录添加成功',
        data: { id: this.lastID }
      });
    });
    
  } catch (error) {
    console.error('添加回访记录失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，添加回访记录失败'
    });
  }
});

// 获取特定客户的回访记录
router.get('/customer/:customerId', authenticateToken, (req, res) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;
    
    // 检查缓存
    const cacheKey = getCacheKey({ type: 'customer', id: customerId, page, pageSize });
    if (cache.visits[cacheKey]) {
      return res.json(cache.visits[cacheKey]);
    }
    
    // 获取总数
    db.get(
      'SELECT COUNT(*) as total FROM customer_visits WHERE customer_id = ?',
      [customerId],
      (err, countResult) => {
        if (err) {
          console.error('获取回访记录数量失败:', err);
          return res.status(500).json({
            success: false,
            message: '服务器错误，获取回访记录失败'
          });
        }
        
        const total = countResult.total;
        const totalPages = Math.ceil(total / pageSize);
        
        // 添加索引提示和高效查询
        db.all(
          `SELECT * FROM customer_visits 
           WHERE customer_id = ? 
           ORDER BY visit_date DESC, id DESC
           LIMIT ? OFFSET ?`,
          [customerId, pageSize, offset],
          (err, visits) => {
            if (err) {
              console.error('获取回访记录失败:', err);
              return res.status(500).json({
                success: false,
                message: '服务器错误，获取回访记录失败'
              });
            }
            
            const result = {
              success: true,
              data: visits,
              pagination: {
                total,
                totalPages,
                currentPage: page,
                pageSize
              }
            };
            
            // 存入缓存
            cache.visits[cacheKey] = result;
            
            res.json(result);
          }
        );
      }
    );
    
  } catch (error) {
    console.error('获取客户回访记录失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取回访记录失败'
    });
  }
});

// 获取所有回访记录（带分页和搜索）
router.get('/', authenticateToken, (req, res) => {
  try {
    console.time('获取回访记录');
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const searchTerm = req.query.q || '';
    
    // 清理过期缓存
    clearCacheIfNeeded();
    
    // 检查缓存
    const cacheKey = getCacheKey({ page, pageSize, q: searchTerm });
    if (cache.visits[cacheKey]) {
      console.timeEnd('获取回访记录');
      return res.json(cache.visits[cacheKey]);
    }
    
    let countQuery = 'SELECT COUNT(*) as total FROM customer_visits';
    let visitsQuery = `SELECT * FROM customer_visits ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    let countParams = [];
    let visitsParams = [pageSize, offset];
    
    // 如果有搜索词，添加搜索条件
    if (searchTerm) {
      countQuery = 'SELECT COUNT(*) as total FROM customer_visits WHERE customer_name LIKE ? OR customer_phone LIKE ?';
      visitsQuery = `SELECT * FROM customer_visits 
                    WHERE customer_name LIKE ? OR customer_phone LIKE ?
                    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
      const searchPattern = `%${searchTerm}%`;
      countParams = [searchPattern, searchPattern];
      visitsParams = [searchPattern, searchPattern, pageSize, offset];
    }
    
    // 获取总数
    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        console.error('获取回访记录数量失败:', err);
        console.timeEnd('获取回访记录');
        return res.status(500).json({
          success: false,
          message: '服务器错误，获取回访记录失败'
        });
      }
      
      const total = countResult.total;
      const totalPages = Math.ceil(total / pageSize);
      
      // 获取回访记录
      db.all(visitsQuery, visitsParams, (err, visits) => {
        if (err) {
          console.error('获取回访记录失败:', err);
          console.timeEnd('获取回访记录');
          return res.status(500).json({
            success: false,
            message: '服务器错误，获取回访记录失败'
          });
        }
        
        const result = {
          success: true,
          data: visits,
          pagination: {
            total,
            totalPages,
            currentPage: page,
            pageSize
          }
        };
        
        // 存入缓存
        cache.visits[cacheKey] = result;
        
        console.timeEnd('获取回访记录');
        res.json(result);
      });
    });
    
  } catch (error) {
    console.error('获取回访记录失败:', error);
    console.timeEnd('获取回访记录');
    res.status(500).json({
      success: false,
      message: '服务器错误，获取回访记录失败'
    });
  }
});

// 获取单个回访记录详情
router.get('/detail/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查缓存
    const cacheKey = getCacheKey({ type: 'detail', id });
    if (cache.visits[cacheKey]) {
      return res.json(cache.visits[cacheKey]);
    }
    
    db.get(
      'SELECT * FROM customer_visits WHERE id = ?',
      [id],
      (err, visit) => {
        if (err) {
          console.error('获取回访记录详情失败:', err);
          return res.status(500).json({
            success: false,
            message: '服务器错误，获取回访记录详情失败'
          });
        }
        
        if (!visit) {
          return res.status(404).json({
            success: false,
            message: '回访记录不存在'
          });
        }
        
        const result = {
          success: true,
          data: visit
        };
        
        // 存入缓存
        cache.visits[cacheKey] = result;
        
        res.json(result);
      }
    );
  } catch (error) {
    console.error('获取回访记录详情失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取回访记录详情失败'
    });
  }
});

// 删除回访记录
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    // 先检查记录是否存在
    db.get(
      'SELECT * FROM customer_visits WHERE id = ?',
      [id],
      (err, visit) => {
        if (err) {
          console.error('查询回访记录失败:', err);
          return res.status(500).json({
            success: false,
            message: '服务器错误，删除回访记录失败'
          });
        }
        
        if (!visit) {
          return res.status(404).json({
            success: false,
            message: '回访记录不存在'
          });
        }
        
        // 执行删除操作
        db.run(
          'DELETE FROM customer_visits WHERE id = ?',
          [id],
          function(err) {
            if (err) {
              console.error('删除回访记录失败:', err);
              return res.status(500).json({
                success: false,
                message: '服务器错误，删除回访记录失败'
              });
            }
            
            // 清空缓存
            cache.visits = {};
            
            res.json({
              success: true,
              message: '回访记录删除成功'
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('删除回访记录失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，删除回访记录失败'
    });
  }
});

// 最后在模块导出时包含缓存清理函数
module.exports = router;
module.exports.clearAllVisitsCache = clearAllVisitsCache; 