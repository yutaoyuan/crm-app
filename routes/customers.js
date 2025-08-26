const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../models/db');
const { isAuthenticated } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const https = require('https');
const http = require('http');

// 使用自定义代理配置以允许不安全的SSL
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// 内存存储，用于处理文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

// ===== 通用路由 =====
// 搜索客户
router.get('/search', isAuthenticated, (req, res) => {
  const { q, employee } = req.query;
  // 新增分页参数
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;
  // 新增排序参数
  const sortField = req.query.sort || 'id';
  const sortOrder = req.query.order || 'desc';

  if (!q && !employee) {
    return res.status(400).json({ message: '请输入搜索关键词或选择员工' });
  }

  // 处理排序
  let orderClause = '';
  if (sortField === 'id') {
    orderClause = 'id DESC';
  } else if (sortField === 'last_visit') {
    orderClause = `CASE 
                    WHEN COALESCE(derived_last_visit, last_visit) IS NULL THEN 2 
                    WHEN COALESCE(derived_last_visit, last_visit) = '' THEN 1
                    ELSE 0 
                  END, 
                  COALESCE(derived_last_visit, last_visit) ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, 
                  id DESC`;
  } else if (sortField === 'last_consumption') {
    orderClause = `CASE 
                    WHEN last_consumption IS NULL THEN 2 
                    WHEN last_consumption = '' THEN 1
                    ELSE 0 
                  END, 
                  last_consumption ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, 
                  id DESC`;
  } else {
    orderClause = `${sortField} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, id DESC`;
  }

  // 统计总数SQL（修正searchTerm为q）
  let countSql = q 
    ? 'SELECT COUNT(*) as total FROM customers WHERE name LIKE ? OR phone LIKE ?' 
    : 'SELECT COUNT(*) as total FROM customers';
  let countParams = q ? [`%${q}%`, `%${q}%`] : [];
  if (employee) {
    countSql += q ? ' AND employee = ?' : ' WHERE employee = ?';
    countParams.push(employee);
  }

  db.get(countSql, countParams, (err, countResult) => {
    if (err) {
      console.error('获取客户总数失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '获取客户总数失败', 
        error: err.message 
      });
    }
    const totalCount = countResult.total;
    const totalPages = Math.ceil(totalCount / pageSize);
    // 查询数据SQL
    let baseSql = `
      SELECT c.*, 
        (SELECT created_at FROM customer_visits 
         WHERE customer_id = c.id 
         ORDER BY created_at DESC LIMIT 1) as derived_last_visit,
        (SELECT IFNULL(SUM(total_amount), 0) 
         FROM sales s 
         WHERE s.customer_id = c.id 
         AND s.total_amount > 0) as total_points
      FROM customers c
      WHERE 1=1
    `;
    let params = [];
    if (q) {
      baseSql += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (employee) {
      baseSql += ' AND c.employee = ?';
      params.push(employee);
    }
    // 构建排序SQL
    let sql = `
      SELECT *, COALESCE(derived_last_visit, last_visit) as last_visit
      FROM (${baseSql}) AS CustomerData
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    params.push(pageSize, offset);
    db.all(sql, params, (err, customers) => {
      if (err) {
        return res.status(500).json({ 
          message: '搜索客户失败', 
          error: err.message 
        });
      }
      customers.forEach(c => {
        c.last_visit = c.derived_last_visit || c.last_visit || null;
        delete c.derived_last_visit;
      });
      res.json({
        success: true,
        data: customers,
        pagination: {
          total: totalCount,
          totalPages: totalPages,
          currentPage: page,
          pageSize: pageSize
        }
      });
    });
  });
});

// 导出客户数据
router.get('/export', isAuthenticated, (req, res) => {
  try {
    // 查询所有客户数据
    db.all('SELECT * FROM customers ORDER BY id DESC', [], (err, customers) => {
      if (err) {
        return res.status(500).json({ message: '获取客户数据失败', error: err.message });
      }

      // 创建工作簿
      const workbook = xlsx.utils.book_new();
      
      // 准备数据
      const data = customers.map(customer => ({
        'ID': customer.id,
        '姓名': customer.name,
        '电话': customer.phone,
        '年龄': customer.age,
        '身高': customer.height,
        '上装尺码': customer.upper_size,
        '下装尺码': customer.lower_size,
        '体型': customer.body_type,
        '特征': customer.features,
        '接待': customer.reception,
        '性格': customer.personality,
        '偏好颜色': customer.preferred_colors,
        '偏好风格': customer.preferred_styles,
        '陪同': customer.accompaniment,
        '部门': customer.department,
        '员工': customer.employee,
        '注册日期': customer.registration_date
      }));

      // 创建工作表
      const worksheet = xlsx.utils.json_to_sheet(data);
      
      // 设置列宽
      const colWidths = [
        { wch: 5 },  // ID
        { wch: 10 }, // 姓名
        { wch: 15 }, // 电话
        { wch: 5 },  // 年龄
        { wch: 5 },  // 身高
        { wch: 10 }, // 上装尺码
        { wch: 10 }, // 下装尺码
        { wch: 10 }, // 体型
        { wch: 20 }, // 特征
        { wch: 10 }, // 接待
        { wch: 10 }, // 性格
        { wch: 15 }, // 偏好颜色
        { wch: 15 }, // 偏好风格
        { wch: 10 }, // 陪同
        { wch: 10 }, // 部门
        { wch: 10 }, // 员工
        { wch: 12 }  // 注册日期
      ];
      worksheet['!cols'] = colWidths;

      // 添加工作表到工作簿
      xlsx.utils.book_append_sheet(workbook, worksheet, '客户数据');

      // 生成Excel文件
      const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // 设置响应头
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const filename = encodeURIComponent('客户数据.xlsx');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

      // 发送文件
      res.send(excelBuffer);
    });
  } catch (error) {
    console.error('导出客户数据失败:', error);
    res.status(500).json({ message: '导出失败', error: error.message });
  }
});

// 获取所有客户
router.get('/', isAuthenticated, (req, res) => {
  // 获取分页和排序参数
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;
  const sortField = req.query.sort || 'id';
  const sortOrder = req.query.order || 'desc';
  const searchTerm = req.query.q || '';
  
  // 初始化性能计时
  const startTime = Date.now();
  
  // 处理排序
  let orderClause = '';
  if (sortField === 'id') {
    orderClause = 'id DESC';
  } else if (sortField === 'last_visit') {
    orderClause = `CASE 
                    WHEN COALESCE(derived_last_visit, last_visit) IS NULL THEN 2 
                    WHEN COALESCE(derived_last_visit, last_visit) = '' THEN 1
                    ELSE 0 
                  END, 
                  COALESCE(derived_last_visit, last_visit) ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, 
                  id DESC`;
  } else if (sortField === 'last_consumption') {
    orderClause = `CASE 
                    WHEN last_consumption IS NULL THEN 2 
                    WHEN last_consumption = '' THEN 1
                    ELSE 0 
                  END, 
                  last_consumption ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, 
                  id DESC`;
  } else {
    orderClause = `${sortField} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, id DESC`;
  }
  
  // 查询客户总数 - 使用内联视图进行优化
  let countSql = searchTerm 
    ? 'SELECT COUNT(*) as total FROM customers WHERE name LIKE ? OR phone LIKE ?' 
    : 'SELECT COUNT(*) as total FROM customers';
  
  let countParams = searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : [];
  
  db.get(countSql, countParams, (err, countResult) => {
    if (err) {
      console.error('获取客户总数失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '获取客户总数失败', 
        error: err.message 
      });
    }
    
    const totalCount = countResult.total;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // 构建优化的SQL查询 
    // 1. 只查询当前页需要的字段
    // 2. 使用索引提示以提高性能
    // 3. 为子查询添加LIMIT来减少处理的行数
    let baseSql = `
      SELECT 
        c.*,
        (SELECT created_at FROM customer_visits 
         WHERE customer_id = c.id 
         ORDER BY created_at DESC LIMIT 1) as derived_last_visit,
        (SELECT IFNULL(SUM(total_amount), 0) 
         FROM sales s 
         WHERE s.customer_id = c.id 
         AND s.total_amount > 0) as total_points
      FROM customers c
    `;
    
    // 添加搜索条件
    let params = [];
    if (searchTerm) {
      baseSql += ' WHERE c.name LIKE ? OR c.phone LIKE ?';
      params = [`%${searchTerm}%`, `%${searchTerm}%`];
    }
    
    // 构建完整SQL，使用优化的排序条件
    let sql = `
      SELECT *, 
             COALESCE(derived_last_visit, last_visit) as last_visit 
      FROM (${baseSql}) AS CustomerData
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    params.push(pageSize, offset);
    
    console.time('客户查询执行时间');
    
    db.all(sql, params, (err, customers) => {
      console.timeEnd('客户查询执行时间');
      const queryTime = Date.now() - startTime;
      console.log(`总查询执行时间: ${queryTime}ms`);
      
      if (err) {
        console.error('获取客户列表查询错误:', err);
        return res.status(500).json({ 
          success: false, 
          message: '获取客户列表失败', 
          error: err.message 
        });
      }
      
      console.log(`查询返回 ${customers ? customers.length : 0} 条客户记录`);
      
      // 确保所有电话号码都是字符串类型
      if (customers && customers.length > 0) {
        customers.forEach(customer => {
          if (customer.phone !== undefined && customer.phone !== null) {
            customer.phone = String(customer.phone);
          }
        });
      }
      
      // 准备响应数据
      const responseData = {
        success: true,
        data: customers,
        pagination: {
          total: totalCount,
          totalPages: totalPages,
          currentPage: page,
          pageSize: pageSize
        }
      };
      
      res.json(responseData);
    });
  });
});

// 创建新客户
router.post('/', isAuthenticated, upload.single('photo'), (req, res) => {
  try {
    console.log('======== 创建客户请求 ========');
    console.log('Body type:', typeof req.body);
    console.log('Body keys:', Object.keys(req.body));
    console.log('Body content:', req.body);
    console.log('Files:', req.file ? '有文件' : '无文件');
    console.log('会话:', req.session ? '有效' : '无效');
    console.log('用户:', req.session?.user?.username || '未登录');
    console.log('电话号码类型:', typeof req.body.phone);
    console.log('电话号码值:', req.body.phone);
    console.log('==============================');
    
    // 检查req.body是否为空对象
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('请求体为空或无法解析');
      return res.status(400).json({ message: '无法解析请求数据，请检查Content-Type是否正确设置' });
    }
    
    // 确保电话号码是字符串类型
    if (req.body.phone !== undefined && req.body.phone !== null) {
      req.body.phone = String(req.body.phone);
      console.log('转换后的电话号码:', req.body.phone, '类型:', typeof req.body.phone);
    }
    
    const {
      name, phone, age, height, upper_size, lower_size, body_type,
      features, reception, personality, preferred_colors, preferred_styles,
      accompaniment, department, employee, registration_date
    } = req.body;
    
    // 增强调试日志
    console.log('创建客户 - 请求参数详细信息:');
    console.log('- 请求体:', JSON.stringify(req.body, null, 2));
    console.log('- 图片:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : '没有图片');
    console.log('- 会话ID:', req.sessionID);
    console.log('- 会话用户:', req.session.user ? req.session.user.username : '无用户');
    console.log('- 请求方法:', req.method);
    console.log('- 请求路径:', req.path);
    console.log('- 请求头:', JSON.stringify(req.headers, null, 2));
    
    // 基本验证
    if (!name || !phone) {
      console.log('验证失败: 姓名或电话为空', { name, phone });
      return res.status(400).json({ message: '姓名和电话是必填项' });
    }
    
    // 检查电话号码是否已存在
    db.get('SELECT id FROM customers WHERE phone = ?', [phone], (err, existing) => {
      if (err) {
        console.error('查询客户失败:', err);
        return res.status(500).json({ 
          message: '创建客户前检查失败', 
          error: err.message 
        });
      }
      
      if (existing) {
        return res.status(400).json({ 
          message: '该电话号码已被使用，请使用其他电话号码' 
        });
      }
      
      // 准备SQL和参数
      const sql = `
        INSERT INTO customers (
          name, phone, age, height, upper_size, lower_size, body_type,
          features, reception, personality, preferred_colors, preferred_styles,
          accompaniment, department, employee, registration_date, photo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // 处理照片数据
      let photoData = null;
      if (req.file) {
        photoData = req.file.buffer;
      }
      
      const params = [
        name, phone, age || null, height || null, upper_size || null, 
        lower_size || null, body_type || null, features || null, 
        reception || null, personality || null, preferred_colors || null, 
        preferred_styles || null, accompaniment || null, department || null, 
        employee || null, registration_date || new Date().toISOString().split('T')[0],
        photoData
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          console.error('保存客户数据失败:', err);
          return res.status(500).json({ 
            message: '创建客户失败', 
            error: err.message 
          });
        }
        
        console.log('客户创建成功:', { 
          id: this.lastID, 
          name, 
          phone 
        });
        
        res.status(201).json({ 
          message: '客户创建成功', 
          customerId: this.lastID 
        });
      });
    });
  } catch (error) {
    console.error('创建客户过程中出现未处理的错误:', error);
    res.status(500).json({ 
      message: '服务器内部错误', 
      error: error.message 
    });
  }
});

// 导入客户数据 - 上传文件
router.post('/import', isAuthenticated, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '未提供文件' });
  }
  
  // 根据文件类型解析数据
  let records = [];
  const fileBuffer = req.file.buffer;
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  
  try {
    if (fileExt === '.csv') {
      // 处理CSV文件
      const results = [];
      fs.writeFileSync('temp_import.csv', fileBuffer);
      
      // 存储导入任务ID
      const importId = Date.now().toString();
      
      // 返回导入任务ID，客户端可以用它查询导入进度
      res.status(200).json({ 
        message: '导入任务已创建', 
        importId: importId,
        totalRecords: 0 // 初始值，将在读取完成后更新
      });
      
      // 开始异步处理
      fs.createReadStream('temp_import.csv')
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          // 更新全局记录
          records = results;
          
          // 保存记录供查询
          global.importTasks = global.importTasks || {};
          global.importTasks[importId] = {
            totalRecords: records.length,
            processedRecords: 0,
            status: 'processing',
            errors: [],
            currentItem: null
          };
          
          // 逐条处理记录
          processCustomerRecords(records, importId);
          
          // 处理完成后删除临时文件
          fs.unlinkSync('temp_import.csv');
        });
      
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // 处理Excel文件
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      records = xlsx.utils.sheet_to_json(worksheet);
      
      // 存储导入任务ID
      const importId = Date.now().toString();
      
      // 返回导入任务ID
      res.status(200).json({ 
        message: '导入任务已创建', 
        importId: importId,
        totalRecords: records.length
      });
      
      // 保存记录供查询
      global.importTasks = global.importTasks || {};
      global.importTasks[importId] = {
        totalRecords: records.length,
        processedRecords: 0,
        status: 'processing',
        errors: [],
        currentItem: null
      };
      
      // 开始异步处理
      processCustomerRecords(records, importId);
      
    } else {
      return res.status(400).json({ message: '不支持的文件格式' });
    }
  } catch (error) {
    return res.status(500).json({ 
      message: '解析文件失败', 
      error: error.message 
    });
  }
});

// 检查导入进度
router.get('/import/:importId/status', isAuthenticated, (req, res) => {
  const { importId } = req.params;
  
  if (!global.importTasks || !global.importTasks[importId]) {
    return res.status(404).json({ message: '导入任务不存在' });
  }
  
  // 获取导入任务信息
  const taskInfo = { ...global.importTasks[importId] };
  
  // 获取照片下载信息
  const photoQueue = global.photoDownloadQueue && global.photoDownloadQueue[importId] 
    ? global.photoDownloadQueue[importId] 
    : { status: 'none', queue: [], inProgress: 0, completed: 0, failed: 0 };
  
  // 添加照片下载状态
  taskInfo.photoDownload = {
    status: photoQueue.status,
    total: (photoQueue.queue ? photoQueue.queue.length : 0) + photoQueue.inProgress + photoQueue.completed + photoQueue.failed,
    inProgress: photoQueue.inProgress,
    completed: photoQueue.completed,
    failed: photoQueue.failed,
    remaining: photoQueue.queue ? photoQueue.queue.length : 0,
    currentItems: taskInfo.photoDownloadStatus?.currentItems || []
  };
  
  res.json(taskInfo);
});

// ===== 批量操作路由 =====
// 删除所有客户数据 - 注意：此路由必须放在/:id路由之前
router.delete('/delete-all', isAuthenticated, (req, res) => {
  // 执行删除操作
  db.serialize(() => {
    // 删除回访记录
    db.run('DELETE FROM customer_visits', (err) => {
      if (err) {
        return res.status(500).json({ 
          message: '删除回访记录失败', 
          error: err.message 
        });
      }
      
      // 删除销售记录
      db.run('DELETE FROM sales', (err) => {
        if (err) {
          return res.status(500).json({ 
            message: '删除销售记录失败', 
            error: err.message 
          });
        }
        
        // 删除积分记录
        db.run('DELETE FROM points', (err) => {
          if (err) {
            return res.status(500).json({ 
              message: '删除积分记录失败', 
              error: err.message 
            });
          }
          
          // 删除客户记录
          db.run('DELETE FROM customers', function(err) {
            if (err) {
              return res.status(500).json({ 
                message: '删除客户记录失败', 
                error: err.message 
              });
            }
            
            res.json({ 
              message: '已删除所有数据',
              customerCount: this.changes
            });
          });
        });
      });
    });
  });
});

// ===== 单个客户操作路由 =====
// 获取单个客户
router.get('/:id', isAuthenticated, (req, res) => {
  const sql = `
    SELECT c.*,
      (SELECT IFNULL(SUM(total_amount), 0) 
       FROM sales s 
       WHERE s.customer_id = c.id 
       AND s.total_amount > 0) as total_points
    FROM customers c
    WHERE c.id = ?
  `;
  
  db.get(sql, [req.params.id], (err, customer) => {
    if (err) {
      return res.status(500).json({ message: '获取客户详情失败', error: err.message });
    }
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }
    
    // 确保电话号码是字符串类型
    if (customer.phone !== undefined && customer.phone !== null) {
      customer.phone = String(customer.phone);
    }
    
    res.json(customer);
  });
});

// 获取客户照片
router.get('/:id/photo', isAuthenticated, (req, res) => {
  db.get('SELECT photo FROM customers WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ message: '获取照片失败', error: err.message });
    }
    if (!row || !row.photo) {
      return res.status(404).json({ message: '照片不存在' });
    }
    
    // 设置响应头并发送照片数据
    res.contentType('image/jpeg');
    res.send(Buffer.from(row.photo));
  });
});

// 更新客户信息
router.put('/:id', isAuthenticated, upload.single('photo'), (req, res) => {
  // 记录调试信息
  console.log('======== 更新客户请求 ========');
  console.log('客户ID:', req.params.id);
  console.log('电话号码类型:', typeof req.body.phone);
  console.log('电话号码值:', req.body.phone);
  
  // 确保电话号码是字符串类型
  if (req.body.phone !== undefined && req.body.phone !== null) {
    req.body.phone = String(req.body.phone);
    console.log('转换后的电话号码:', req.body.phone, '类型:', typeof req.body.phone);
  }
  
  const {
    name, phone, age, height, upper_size, lower_size, body_type,
    features, reception, personality, preferred_colors, preferred_styles,
    accompaniment, department, employee, registration_date
  } = req.body;
  
  // 基本验证
  if (!name || !phone) {
    return res.status(400).json({ message: '姓名和电话是必填项' });
  }
  
  // 首先检查客户是否存在
  db.get('SELECT * FROM customers WHERE id = ?', [req.params.id], (err, customer) => {
    if (err) {
      return res.status(500).json({ message: '查询客户失败', error: err.message });
    }
    
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }
    
    let sql, params;
    
    // 根据是否有照片上传，准备不同的SQL
    if (req.file) {
      sql = `
        UPDATE customers SET
          name = ?, phone = ?, age = ?, height = ?, upper_size = ?, 
          lower_size = ?, body_type = ?, features = ?, reception = ?, 
          personality = ?, preferred_colors = ?, preferred_styles = ?,
          accompaniment = ?, department = ?, employee = ?, 
          registration_date = ?, photo = ?
        WHERE id = ?
      `;
      
      params = [
        name, phone, age || null, height || null, upper_size || null, 
        lower_size || null, body_type || null, features || null, 
        reception || null, personality || null, preferred_colors || null, 
        preferred_styles || null, accompaniment || null, department || null, 
        employee || null, registration_date || customer.registration_date,
        req.file.buffer, req.params.id
      ];
    } else {
      sql = `
        UPDATE customers SET
          name = ?, phone = ?, age = ?, height = ?, upper_size = ?, 
          lower_size = ?, body_type = ?, features = ?, reception = ?, 
          personality = ?, preferred_colors = ?, preferred_styles = ?,
          accompaniment = ?, department = ?, employee = ?, 
          registration_date = ?
        WHERE id = ?
      `;
      
      params = [
        name, phone, age || null, height || null, upper_size || null, 
        lower_size || null, body_type || null, features || null, 
        reception || null, personality || null, preferred_colors || null, 
        preferred_styles || null, accompaniment || null, department || null, 
        employee || null, registration_date || customer.registration_date,
        req.params.id
      ];
    }
    
    db.run(sql, params, function(err) {
      if (err) {
        return res.status(500).json({ 
          message: '更新客户失败', 
          error: err.message 
        });
      }
      
      res.json({ 
        message: '客户更新成功', 
        changes: this.changes 
      });
    });
  });
});

// 删除客户
router.delete('/:id', isAuthenticated, (req, res) => {
  const customerId = req.params.id;
  
  db.serialize(() => {
    // 删除销售记录
    db.run('DELETE FROM sales WHERE customer_id = ?', [customerId], (err) => {
      if (err) {
        return res.status(500).json({ 
          message: '删除销售记录失败', 
          error: err.message 
        });
      }
      
      // 删除积分记录
      db.run('DELETE FROM points WHERE customer_id = ?', [customerId], (err) => {
        if (err) {
          return res.status(500).json({ 
            message: '删除积分记录失败', 
            error: err.message 
          });
        }
        
        // 删除客户记录
        db.run('DELETE FROM customers WHERE id = ?', [customerId], function(err) {
          if (err) {
            return res.status(500).json({ 
              message: '删除客户失败', 
              error: err.message 
            });
          }
          
          if (this.changes === 0) {
            return res.status(404).json({ message: '客户不存在' });
          }
          
          res.json({ message: '客户及相关记录删除成功' });
        });
      });
    });
  });
});

// 测试表单提交
router.post('/test-form', upload.single('test-file'), (req, res) => {
  console.log('测试表单提交:');
  console.log('- 请求体:', req.body);
  console.log('- 文件:', req.file);
  console.log('- 会话:', req.session ? '存在' : '不存在');
  console.log('- 用户:', req.session?.user ? req.session.user.username : '无');
  
  res.json({
    message: '表单测试成功',
    body: req.body,
    file: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : null,
    session: req.session ? {
      id: req.sessionID,
      authenticated: !!req.session.user
    } : null
  });
});

// 验证身份验证状态
router.get('/check-auth', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.user),
    sessionExists: !!req.session,
    sessionId: req.sessionID,
    user: req.session?.user?.username
  });
});

// ===== 辅助函数 =====

// 存储照片下载队列
global.photoDownloadQueue = global.photoDownloadQueue || {};

// 异步处理客户记录
async function processCustomerRecords(records, importId) {
  const task = global.importTasks[importId];
  const photoQueue = { queue: [], status: 'pending', inProgress: 0, completed: 0, failed: 0 };
  global.photoDownloadQueue = global.photoDownloadQueue || {};
  global.photoDownloadQueue[importId] = photoQueue;
  
  // 准备批量插入的数据
  const batchSize = 100;
  let currentBatch = [];
  let existingCustomers = new Map(); // 用于存储已存在的客户信息
  
  // 首先获取所有已存在的客户电话
  await new Promise((resolve, reject) => {
    db.all('SELECT id, phone FROM customers', [], (err, rows) => {
      if (err) return reject(err);
      rows.forEach(row => existingCustomers.set(row.phone, row.id));
      resolve();
    });
  });
  
  for (const record of records) {
    try {
      task.currentItem = record;
      
      // 映射记录字段到数据库字段
      const customerData = {
        name: record.姓名 || record.name,
        phone: record.电话 || record.phone,
        age: record.年龄 || record.age,
        height: record.身高 || record.height,
        upper_size: record.上装尺码 || record.upper_size,
        lower_size: record.下装尺码 || record.lower_size,
        body_type: record.体型 || record.body_type,
        features: record.特征 || record.features,
        reception: record.接待方式 || record.reception,
        personality: record.性格特点 || record.personality,
        preferred_colors: record.喜欢颜色 || record.preferred_colors,
        preferred_styles: record.喜欢风格 || record.preferred_styles,
        accompaniment: record.同行人 || record.accompaniment,
        department: record.部门 || record.department,
        employee: record.员工 || record.employee,
        registration_date: parseDate(record.登记日期 || record.建档日期 || record.registration_date || record.创建日期 || record.create_date)
      };
      
      // 如果没有找到任何有效的日期，则使用当前日期
      if (!customerData.registration_date) {
        customerData.registration_date = new Date().toISOString().split('T')[0];
        console.log(`客户 ${customerData.name} 没有提供建档日期，使用当前日期: ${customerData.registration_date}`);
      }
      
      // 检查必填字段
      if (!customerData.name || !customerData.phone) {
        throw new Error('姓名和电话是必填项');
      }
      
      // 检查是否已存在该客户
      const existingId = existingCustomers.get(customerData.phone);
      
      // 添加到当前批次
      currentBatch.push({
        data: customerData,
        existingId: existingId,
        photoUrl: record.照片 || record.photo
      });
      
      // 当批次达到指定大小时，执行批量插入
      if (currentBatch.length >= batchSize) {
        await processBatch(currentBatch, photoQueue);
        currentBatch = [];
      }
      
      // 更新进度
      task.processedRecords++;
      
    } catch (error) {
      // 记录错误并继续下一条
      const errorMsg = `处理记录失败 [${record.姓名 || record.name || '未知'}]: ${error.message}`;
      console.error(errorMsg);
      task.errors.push(errorMsg);
      task.processedRecords++;
    }
  }
  
  // 处理剩余的记录
  if (currentBatch.length > 0) {
    await processBatch(currentBatch, photoQueue);
  }
  
  // 数据导入完成，但照片下载仍在进行
  task.status = 'completed';
  task.currentItem = null;
  
  if (photoQueue.queue.length > 0) {
    // 开始处理照片下载队列
    photoQueue.status = 'processing';
    await processPhotoDownloadQueue(importId);
  } else {
    photoQueue.status = 'completed';
  }
}

// 处理批量插入
async function processBatch(batch, photoQueue) {
  // 准备批量插入和更新的SQL语句
  const insertSql = `
    INSERT INTO customers (
      name, phone, age, height, upper_size, lower_size, body_type,
      features, reception, personality, preferred_colors, preferred_styles,
      accompaniment, department, employee, registration_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const updateSql = `
    UPDATE customers SET
      name = ?, age = ?, height = ?, upper_size = ?, lower_size = ?,
      body_type = ?, features = ?, reception = ?, personality = ?,
      preferred_colors = ?, preferred_styles = ?, accompaniment = ?,
      department = ?, employee = ?, registration_date = ?
    WHERE id = ?
  `;
  
  // 开始事务
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const stmt = db.prepare(insertSql);
      const updateStmt = db.prepare(updateSql);
      
      batch.forEach(item => {
        const { data, existingId, photoUrl } = item;
        
        if (existingId) {
          // 更新现有客户
          updateStmt.run(
            data.name, data.age, data.height,
            data.upper_size, data.lower_size, data.body_type,
            data.features, data.reception, data.personality,
            data.preferred_colors, data.preferred_styles,
            data.accompaniment, data.department, data.employee,
            data.registration_date, existingId
          );
          
          // 如果有照片URL，添加到照片下载队列
          if (photoUrl) {
            photoQueue.queue.push({
              id: existingId,
              url: photoUrl,
              name: data.name,
              phone: data.phone,
              status: 'pending'
            });
          }
        } else {
          // 插入新客户
          stmt.run(
            data.name, data.phone, data.age, data.height,
            data.upper_size, data.lower_size, data.body_type,
            data.features, data.reception, data.personality,
            data.preferred_colors, data.preferred_styles,
            data.accompaniment, data.department, data.employee,
            data.registration_date,
            function(err) {
              if (err) {
                console.error('插入客户失败:', err);
                return;
              }
              
              // 如果有照片URL，添加到照片下载队列
              if (photoUrl) {
                photoQueue.queue.push({
                  id: this.lastID,
                  url: photoUrl,
                  name: data.name,
                  phone: data.phone,
                  status: 'pending'
                });
              }
            }
          );
        }
      });
      
      stmt.finalize();
      updateStmt.finalize();
      
      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// 处理照片下载队列
async function processPhotoDownloadQueue(importId) {
  const photoQueue = global.photoDownloadQueue[importId];
  if (!photoQueue) return;
  
  try {
    // 增加并行下载数量
    const batchSize = 10; // 从5个增加到10个
    
    // 记录当前正在处理的照片，用于前端显示
    photoQueue.currentItems = [];
    global.importTasks[importId].photoDownloadStatus = {
      currentItems: photoQueue.currentItems
    };
    
    // 优化队列 - 预处理URL，去除重复和无效的URL
    if (photoQueue.queue.length > 0) {
      // 去重
      const uniqueUrls = new Map();
      photoQueue.queue.forEach(photo => {
        // 使用URL+ID作为键，确保同一客户不会重复下载同一URL
        const key = `${photo.id}-${photo.url}`;
        if (!uniqueUrls.has(key)) {
          uniqueUrls.set(key, photo);
        }
      });
      
      // 过滤掉明显无效的URL
      photoQueue.queue = [...uniqueUrls.values()].filter(photo => 
        photo.url && 
        typeof photo.url === 'string' && 
        photo.url.match(/^https?:\/\//)
      );
      
      console.log(`照片队列优化: 原始 ${photoQueue.queue.length} 张，去重和过滤后 ${photoQueue.queue.length} 张`);
    }
    
    // 使用递归函数处理批次
    const processNextBatch = async () => {
      if (photoQueue.queue.length === 0) {
        photoQueue.status = 'completed';
        return;
      }
      
      // 取出一批任务
      const batch = photoQueue.queue.splice(0, Math.min(batchSize, photoQueue.queue.length));
      photoQueue.inProgress += batch.length;
      
      // 更新当前处理项
      photoQueue.currentItems = batch.map(photo => ({
        ...photo,
        status: '准备下载'
      }));
      
      // 使用Promise.allSettled而不是Promise.all，确保一个失败不会影响其他下载
      const results = await Promise.allSettled(batch.map(async (photo) => {
        // 找到当前照片在currentItems中的索引
        const itemIndex = photoQueue.currentItems.findIndex(item => 
          item.id === photo.id && item.url === photo.url);
        
        try {
          if (itemIndex >= 0) {
            photoQueue.currentItems[itemIndex].status = '下载中';
          }
          
          // 带有重试机制的下载
          return await downloadAndSavePhotoWithRetry(photo, importId, itemIndex);
        } catch (error) {
          console.error(`下载照片最终失败 [${photo.name}]: ${error.message}`);
          
          if (itemIndex >= 0) {
            photoQueue.currentItems[itemIndex].status = '失败';
            photoQueue.currentItems[itemIndex].errorMsg = error.message;
          }
          
          photoQueue.failed++;
          photoQueue.inProgress--;
          
          throw error; // 重新抛出错误以便Promise.allSettled捕获
        }
      }));
      
      // 处理结果
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          // 下载成功的处理已经在downloadAndSavePhotoWithRetry中完成
        } else {
          // 失败的情况也已经在try/catch块中处理
          console.log(`照片 #${index} 下载失败: ${result.reason}`);
        }
      });
      
      // 处理下一批前暂停100ms，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 处理下一批
      await processNextBatch();
    };
    
    // 开始处理
    await processNextBatch();
    
  } catch (error) {
    console.error(`处理照片下载队列失败: ${error.message}`);
    photoQueue.status = 'failed';
  }
}

// 带有重试机制的照片下载函数
async function downloadAndSavePhotoWithRetry(photo, importId, itemIndex) {
  const MAX_RETRIES = 2; // 最多重试2次
  let retries = 0;
  let lastError = null;
  
  while (retries <= MAX_RETRIES) {
    try {
      if (retries > 0) {
        // 更新状态为重试中
        const photoQueue = global.photoDownloadQueue[importId];
        if (photoQueue && itemIndex >= 0 && photoQueue.currentItems[itemIndex]) {
          photoQueue.currentItems[itemIndex].status = `重试中(${retries}/${MAX_RETRIES})`;
        }
        
        // 指数退避延迟，重试前等待一段时间
        const delay = Math.pow(2, retries) * 1000; // 1秒，2秒，4秒
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // 尝试下载并保存照片
      const result = await downloadAndSavePhoto(photo, importId);
      
      // 下载成功，更新状态
      const photoQueue = global.photoDownloadQueue[importId];
      if (photoQueue) {
        if (itemIndex >= 0 && photoQueue.currentItems[itemIndex]) {
          photoQueue.currentItems[itemIndex].status = '已完成';
          if (result && result.redirectUrl) {
            photoQueue.currentItems[itemIndex].redirectUrl = result.redirectUrl;
          }
        }
        
        photoQueue.completed++;
        photoQueue.inProgress--;
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // 某些错误不应该重试，直接抛出
      if (error.message.includes('无效的照片URL') || 
          error.message.includes('URL太长') ||
          error.message.includes('照片数据为空')) {
        throw error;
      }
      
      retries++;
      
      if (retries > MAX_RETRIES) {
        // 已达到最大重试次数，抛出最后一个错误
        throw lastError;
      }
      
      console.log(`照片下载失败，准备第${retries}次重试: ${photo.url}`);
    }
  }
}

// 下载并保存照片
async function downloadAndSavePhoto(photo, importId) {
  try {
    // 使用require导入node-fetch
    const fetch = require('node-fetch');
    
    // 检查URL是否有效
    if (!photo.url || typeof photo.url !== 'string' || !photo.url.match(/^https?:\/\//)) {
      throw new Error('无效的照片URL');
    }
    
    // 检查URL长度（过长的URL可能是Base64编码的图片数据，可能会导致请求失败）
    if (photo.url.length > 2000) {
      throw new Error('URL太长，可能是Base64编码的图片数据');
    }
    
    // 恢复完整的浏览器请求头模拟
    const options = {
      timeout: 30000, // 保持原有的30秒超时
      agent: function(_parsedURL) {
        if (_parsedURL.protocol === 'https:') {
          return httpsAgent;
        } else {
          return new http.Agent();
        }
      },
      // 自动处理重定向
      redirect: 'follow',
      headers: {
        // 完全复制浏览器请求头
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.140',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document', 
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        // 添加Cookie信息（从你提供的请求中获取）
        'Cookie': 'QF_LANG=cn; prodtoken=494740d1-feae-4081-a84b-128afccfc513; QF_LANG_qingflow.com=cn; MEIQIA_TRACK_ID=2wCa1qtxKlpX7Vbjx9UWHAdhYf3; MEIQIA_VISIT_ID=2wCa1vr9NmvZ07ZlaNVCDrdk0w1; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%221966b76cefd34d-051f64ecd38ad9c-786e796b-1440000-1966b76cefeb7%22%2C%22first_id%22%3A%22%22%2C%22props%22%3A%7B%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfY29va2llX2lkIjoiMTk2NmI3NmNlZmQzNGQtMDUxZjY0ZWNkMzhhZDljLTc4NmU3OTZiLTE0NDAwMDAtMTk2NmI3NmNlZmViNyJ9%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%22%2C%22value%22%3A%22%22%7D%2C%22%24device_id%22%3A%221966b76cefd34d-051f64ecd38ad9c-786e796b-1440000-1966b76cefeb7%22%7D; utmInfo=%7B%22forwardUrl%22%3A%22https%3A%2F%2Fqingflow.com%2F%22%7D; QF_UUID=3dcefc82-e968-429f-98e5-b56619aeef05; qfSource=price; landing-page=price; Qs_lvt_374225=1745559672; Qs_pv_374225=2794049913224369000; QF_price_MAX_SCREEN=3; prodwsId=637398; Hm_lvt_176844363a372d74c235e5cb2aaf387c=1745570460,1745644149,1745656111,1745656568; HMACCOUNT=E67E8EE2C718C244; qfVersion=mongo1; Hm_lpvt_176844363a372d74c235e5cb2aaf387c=1745656584; prodUid=2521618; JSESSIONID=8E01E114FF35B779B08F79DEED55393B'
      }
    };
    
    // 打印请求信息，帮助调试
    console.log(`正在请求URL: ${photo.url}`);
    
    // 发起请求并自动跟随重定向
    console.log(`正在发送请求...`);
    const response = await fetch(photo.url, options);
    console.log(`收到响应: 状态码 ${response.status}`);
    
    // 获取最终URL（可能是重定向后的URL）
    const finalUrl = response.url;
    console.log(`最终URL: ${finalUrl}`);
    const wasRedirected = finalUrl !== photo.url;
    
    if (wasRedirected) {
      console.log(`URL已重定向: ${photo.url} -> ${finalUrl}`);
    }
    
    // 判断最终响应状态
    if (!response.ok) {
      const responseBody = await response.text();
      console.log(`错误响应内容 (前200字符): ${responseBody.substring(0, 200)}`);
      throw new Error(`照片请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 检查内容类型确保是图片
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().includes('image/') && 
        !contentType.toLowerCase().includes('octet-stream')) {
      console.warn(`警告: 内容类型可能不是图片: ${contentType}`);
      // 不抛出错误，因为有些服务器可能返回错误的内容类型，但实际上是图片
    }
    
    // 读取照片数据
    const photoData = await response.buffer();
    
    if (!photoData || photoData.length === 0) {
      throw new Error('照片数据为空');
    }
    
    // 检查数据大小，超过10MB的图片可能会导致数据库性能问题
    if (photoData.length > 10 * 1024 * 1024) {
      console.warn(`警告: 照片大小 ${(photoData.length / (1024 * 1024)).toFixed(2)}MB，超过10MB`);
      // 继续处理，但记录警告
    }
    
    console.log(`获取到照片数据 - 大小: ${photoData.length} 字节`);
    
    // 保存照片到数据库 - 使用事务确保原子性
    await new Promise((resolve, reject) => {
      // 简化保存逻辑，直接执行更新而不使用嵌套事务
      db.run('UPDATE customers SET photo = ? WHERE id = ?', [photoData, photo.id], function(err) {
        if (err) {
          return reject(err);
        }
        resolve(this.changes);
      });
    });
    
    console.log(`照片保存成功 - 客户:${photo.name}, 大小:${photoData.length} 字节`);
    
    // 返回下载信息，包括是否重定向
    return {
      redirectUrl: wasRedirected ? finalUrl : null,
      size: photoData.length
    };
    
  } catch (error) {
    console.error(`下载照片失败 - 客户:${photo.name}, URL:${photo.url}`, error);
    
    // 添加客户和URL信息到错误对象，便于调试
    error.photoInfo = {
      customerId: photo.id,
      customerName: photo.name,
      url: photo.url
    };
    throw error;
  }
}

// 辅助函数：解析各种格式的日期并转换为标准ISO日期格式（YYYY-MM-DD）
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // 记录原始输入值，用于调试
  console.log(`解析日期，原始值: "${dateStr}", 类型: ${typeof dateStr}`);
  
  // 如果已经是ISO格式，直接返回
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  try {
    // 处理中文日期格式: "2025年4月22日" 或 "2025年04月22日"
    if (typeof dateStr === 'string' && dateStr.includes('年') && dateStr.includes('月') && dateStr.includes('日')) {
      console.log(`检测到中文日期格式: ${dateStr}`);
      
      // 提取年月日
      const yearMatch = dateStr.match(/(\d{4})年/);
      const monthMatch = dateStr.match(/(\d{1,2})月/);
      const dayMatch = dateStr.match(/(\d{1,2})日/);
      
      if (yearMatch && monthMatch && dayMatch) {
        const year = parseInt(yearMatch[1], 10);
        const month = parseInt(monthMatch[1], 10);
        const day = parseInt(dayMatch[1], 10);
        
        // 验证日期有效性
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          // 格式化为YYYY-MM-DD
          const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          console.log(`中文日期 "${dateStr}" 转换为: ${formattedDate}`);
          return formattedDate;
        } else {
          console.warn(`无效的日期值: 年=${year}, 月=${month}, 日=${day}`);
        }
      } else {
        console.warn(`无法从中文日期中提取年月日: "${dateStr}"`);
      }
    }
    
    // 处理常见的其他日期格式
    
    // 处理 MM/DD/YYYY 格式（美式日期，如4/22/2025）
    if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const dateParts = dateStr.split('/');
      const month = parseInt(dateParts[0], 10);
      const day = parseInt(dateParts[1], 10);
      const year = parseInt(dateParts[2], 10);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        console.log(`美式日期 "${dateStr}" 转换为: ${formattedDate}`);
        return formattedDate;
      }
    }
    
    // 处理没有前导零的日期格式: M/D/YYYY (例如 4/22/2025)
    if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      console.log(`检测到美式日期格式: ${dateStr}`);
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        // 验证日期有效性
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
          const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          console.log(`美式日期 "${dateStr}" 转换为: ${formattedDate}`);
          return formattedDate;
        }
      }
    }
    
    // 处理 YYYY/MM/DD 格式
    if (typeof dateStr === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const dateParts = dateStr.split('/');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10);
      const day = parseInt(dateParts[2], 10);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        console.log(`ISO风格日期 "${dateStr}" 转换为: ${formattedDate}`);
        return formattedDate;
      }
    }
    
    // 处理Excel中的序列号日期格式，它们可能会转换为整数或浮点数
    if ((typeof dateStr === 'number' || !isNaN(Number(dateStr))) && dateStr > 0) {
      console.log(`检测到可能的Excel序列号日期: ${dateStr}`);
      // Excel日期从1900-01-01开始，1为第一天
      // 但JavaScript从1970-01-01开始，所以需要调整
      const excelEpoch = new Date(1900, 0, 1); // 1900-01-01
      const excelDays = Number(dateStr);
      
      // Excel有一个bug，它错误地认为1900是闰年，所以日期数>60时要减1
      const dayAdjustment = excelDays > 60 ? 1 : 0;
      
      // 计算日期
      const milliseconds = (excelDays - dayAdjustment - 1) * 24 * 60 * 60 * 1000;
      const date = new Date(excelEpoch.getTime() + milliseconds);
      
      // 格式化为ISO日期
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      console.log(`Excel序列号日期 "${dateStr}" 转换为: ${formattedDate}`);
      return formattedDate;
    }
    
    // 尝试使用JS Date解析
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth()返回0-11
      const day = date.getDate();
      
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      console.log(`通用解析 "${dateStr}" 转换为: ${formattedDate}`);
      return formattedDate;
    }
    
    // 如果所有尝试都失败，返回null
    console.warn(`无法解析日期: "${dateStr}"`);
    return null;
    
  } catch (error) {
    console.error(`日期解析错误: "${dateStr}", 错误: ${error.message}`);
    return null;
  }
}

// 辅助函数：获取指定年月的天数
function getDaysInMonth(year, month) {
  // 月份是1-12，需要转换成0-11才能用于Date构造函数
  const jsMonth = month - 1;
  
  // 获取下个月的第0天（即本月的最后一天）
  return new Date(year, jsMonth + 1, 0).getDate();
}

// 获取客户消费详情
router.get('/:id/consumption-details', isAuthenticated, (req, res) => {
  const customerId = req.params.id;
  
  if (!customerId) {
    return res.status(400).json({ 
      success: false, 
      message: '客户ID不能为空' 
    });
  }

  // 先获取客户信息，主要是phone字段
  db.get('SELECT phone FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) {
      console.error('获取客户信息失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '获取客户信息失败', 
        error: err.message 
      });
    }
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: '客户不存在' 
      });
    }

    // 分两步查询：先查销售记录，再查商品明细
    // 第一步：查询所有相关的销售记录
    const salesSql = `
      SELECT 
        s.id as sale_id,
        s.date,
        s.transaction_number,
        s.sale_type,
        s.store,
        s.salesperson1,
        s.salesperson2,
        s.total_amount,
        s.name as customer_name,
        s.phone as customer_phone
      FROM sales s
      WHERE s.phone = ? OR s.customer_id = ?
      ORDER BY s.date DESC, s.id DESC
    `;

    db.all(salesSql, [customer.phone, customerId], (err, salesRows) => {
      if (err) {
        console.error('查询销售记录失败:', err);
        return res.status(500).json({ 
          success: false, 
          message: '查询销售记录失败', 
          error: err.message 
        });
      }

      if (!salesRows || salesRows.length === 0) {
        // 没有销售记录
        return res.json({
          success: true,
          data: [],
          total: 0
        });
      }

      // 第二步：查询所有相关销售记录的商品明细
      const saleIds = salesRows.map(row => row.sale_id);
      const placeholders = saleIds.map(() => '?').join(',');
      
      const itemsSql = `
        SELECT 
          si.sale_id,
          si.product_code,
          si.size,
          si.quantity,
          si.amount
        FROM sales_item si
        WHERE si.sale_id IN (${placeholders})
        ORDER BY si.sale_id, si.id
      `;

      db.all(itemsSql, saleIds, (err, itemsRows) => {
        if (err) {
          console.error('查询商品明细失败:', err);
          return res.status(500).json({ 
            success: false, 
            message: '查询商品明细失败', 
            error: err.message 
          });
        }

        // 将商品明细按销售记录ID分组
        const itemsMap = new Map();
        itemsRows.forEach(item => {
          if (!itemsMap.has(item.sale_id)) {
            itemsMap.set(item.sale_id, []);
          }
          itemsMap.get(item.sale_id).push({
            product_code: item.product_code,
            size: item.size,
            quantity: item.quantity,
            amount: item.amount
          });
        });

        // 组装最终的消费详情数据
        const consumptionDetails = salesRows.map(sale => ({
          sale_id: sale.sale_id,
          date: sale.date,
          transaction_number: sale.transaction_number,
          sale_type: sale.sale_type,
          store: sale.store,
          salesperson1: sale.salesperson1,
          salesperson2: sale.salesperson2,
          total_amount: sale.total_amount,
          customer_name: sale.customer_name,
          customer_phone: sale.customer_phone,
          items: itemsMap.get(sale.sale_id) || []
        }));

        console.log(`查询到 ${consumptionDetails.length} 条销售记录，共 ${itemsRows.length} 条商品明细`);

        res.json({
          success: true,
          data: consumptionDetails,
          total: consumptionDetails.length
        });
      });
    });
  });
});

// 获取客户回访记录
router.get('/:id/visits', isAuthenticated, (req, res) => {
  const customerId = req.params.id;
  
  // 首先获取客户的电话号码
  db.get('SELECT phone FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) {
      console.error('获取客户信息失败:', err);
      return res.status(500).json({ 
        success: false,
        message: '获取客户信息失败', 
        error: err.message 
      });
    }
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        message: '客户不存在' 
      });
    }
    
    // 根据电话号码查询回访记录
    const sql = `
      SELECT 
        cv.id,
        cv.visit_date,
        cv.visit_type,
        cv.visit_purpose,
        cv.visit_result,
        cv.notes,
        cv.created_at
      FROM customer_visits cv 
      WHERE cv.customer_phone = ?
      ORDER BY cv.created_at DESC
    `;
    
    db.all(sql, [customer.phone], (err, visits) => {
      if (err) {
        console.error('获取回访记录失败:', err);
        return res.status(500).json({ 
          success: false,
          message: '获取回访记录失败', 
          error: err.message 
        });
      }
      
      console.log(`查询到客户ID ${customerId} (电话: ${customer.phone}) 的 ${visits.length} 条回访记录`);
      
      res.json({
        success: true,
        data: visits,
        total: visits.length,
        customerPhone: customer.phone
      });
    });
  });
});

// 重新计算客户消费信息
router.post('/recalculate-consumption', isAuthenticated, async (req, res) => {
  try {
    const { customerId } = req.body;
    const { recalculateCustomerConsumption, recalculateAllCustomersConsumption } = require('../models/db');
    
    if (customerId) {
      // 重新计算单个客户
      const result = await recalculateCustomerConsumption(customerId);
      res.json({
        success: true,
        message: '客户消费信息重新计算完成',
        data: result
      });
    } else {
      // 重新计算所有客户
      const result = await recalculateAllCustomersConsumption();
      res.json({
        success: true,
        message: '所有客户消费信息重新计算完成',
        data: result
      });
    }
  } catch (error) {
    console.error('重新计算客户消费信息失败:', error);
    res.status(500).json({
      success: false,
      message: '重新计算失败',
      error: error.message
    });
  }
});

module.exports = router;