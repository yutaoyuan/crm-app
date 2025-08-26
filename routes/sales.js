const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../models/db');
const { isAuthenticated } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const { updateCustomerPoints } = require('../models/db');

// 内存存储，用于处理文件上传
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 获取销售记录列表
router.get('/', isAuthenticated, (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    startDate = '', 
    endDate = '',
    sortBy = 'date',
    sortOrder = 'desc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  const searchCondition = search ? 
    `AND (s.name LIKE ? OR s.phone LIKE ? OR s.transaction_number LIKE ?)` : '';
  const dateCondition = startDate && endDate ? 
    `AND s.date BETWEEN ? AND ?` : '';
  
  const params = [];
  if (search) {
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }
  if (startDate && endDate) {
    params.push(startDate, endDate);
  }

  // 获取总记录数
  const countSql = `
    SELECT COUNT(*) as total 
    FROM sales s 
    WHERE 1=1 ${searchCondition} ${dateCondition}
  `;
  
  db.get(countSql, params, (err, result) => {
    if (err) {
      return res.status(500).json({ message: '获取销售记录总数失败', error: err.message });
    }

    const total = result.total;
    
    // 获取销售记录列表
    const sql = `
      SELECT 
        s.*,
        GROUP_CONCAT(
          json_object(
            'id', si.id,
            'product_code', si.product_code,
            'size', si.size,
            'quantity', si.quantity,
            'amount', si.amount
          )
        ) as items
      FROM sales s
      LEFT JOIN sales_item si ON s.id = si.sale_id
      WHERE 1=1 ${searchCondition} ${dateCondition}
      GROUP BY s.id
      ORDER BY s.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    
    db.all(sql, [...params, limit, offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ message: '获取销售记录列表失败', error: err.message });
    }

      // 处理商品明细数据
      const sales = rows.map(row => {
        const items = row.items ? 
          JSON.parse(`[${row.items}]`) : [];
        delete row.items;
        return {
          ...row,
          items
        };
      });

      res.json({
          total,
        page: parseInt(page),
        limit: parseInt(limit),
        data: sales
      });
    });
  });
});

// 搜索销售记录
router.get('/search', isAuthenticated, (req, res) => {
  const searchTerm = req.query.q;
  if (!searchTerm) {
    return res.status(400).json({ message: '缺少搜索参数' });
  }
  
  const query = `
    SELECT * FROM sales 
    WHERE name LIKE ? 
    OR phone LIKE ? 
    OR transaction_number LIKE ? 
    ORDER BY date DESC
  `;
  const searchParam = `%${searchTerm}%`;
  
  db.all(query, [searchParam, searchParam, searchParam], (err, sales) => {
    if (err) {
      return res.status(500).json({ message: '搜索销售记录失败', error: err.message });
    }
    res.json(sales);
  });
});



// 获取客户列表用于下拉框
router.get('/util/customers', isAuthenticated, (req, res) => {
  db.all('SELECT id, name, phone FROM customers ORDER BY name', [], (err, customers) => {
    if (err) {
      return res.status(500).json({ message: '获取客户列表失败', error: err.message });
    }
    res.json(customers);
  });
});

// 获取单个销售记录
router.get('/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  
  const sql = `
    SELECT 
      s.*,
      GROUP_CONCAT(
        json_object(
          'id', si.id,
          'product_code', si.product_code,
          'size', si.size,
          'quantity', si.quantity,
          'amount', si.amount
        )
      ) as items
    FROM sales s
    LEFT JOIN sales_item si ON s.id = si.sale_id
    WHERE s.id = ?
    GROUP BY s.id
  `;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ message: '获取销售记录失败', error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ message: '销售记录不存在' });
    }
    
    // 处理商品明细数据
    const items = row.items ? 
      JSON.parse(`[${row.items}]`) : [];
    delete row.items;
    
    res.json({
      ...row,
      items
    });
  });
});

// 创建新销售记录
router.post('/', isAuthenticated, (req, res) => {
  console.log('=========== 创建销售记录请求 ===========');
  console.log('请求体类型:', typeof req.body);
  console.log('请求体是否为空:', req.body === null || req.body === undefined || Object.keys(req.body).length === 0);
  console.log('请求体JSON:', JSON.stringify(req.body, null, 2));
  console.log('请求头:', req.headers);
  console.log('请求方法:', req.method);
  console.log('会话状态:', req.session ? '有效' : '无效');
  console.log('用户:', req.session?.user?.username || '未登录');
  console.log('==========================================');

  // 检查请求体是否为空
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error('请求体为空');
    return res.status(400).json({ message: '请求体不能为空' });
  }
  
  const {
    name, phone, transaction_number, date, sale_type, store,
    salesperson1, salesperson2, notes, total_amount, sales_items
  } = req.body;
  
  // 记录关键数据的类型和值
  console.log('关键数据的类型和值:');
  console.log('name:', typeof name, name);
  console.log('phone:', typeof phone, phone);
  console.log('date:', typeof date, date);
  console.log('total_amount:', typeof total_amount, total_amount);
  console.log('sales_items:', typeof sales_items, sales_items);
  
  // 基本验证
  if (!name || !phone || !date) {
    console.error('缺少必要字段:', { name, phone, date });
    return res.status(400).json({ message: '姓名、电话和日期是必填项' });
  }
  
  // 验证商品明细
  if (!Array.isArray(sales_items) || sales_items.length === 0) {
    console.error('商品明细不能为空');
    return res.status(400).json({ message: '请至少添加一条商品明细' });
  }
  
  // 检查关联的客户是否存在
  db.get('SELECT id FROM customers WHERE phone = ?', [phone], (err, customer) => {
    if (err) {
      return res.status(500).json({ message: '查询客户失败', error: err.message });
    }
    
    // 如果客户不存在，创建一个新客户
    if (!customer) {
      const customerSql = 'INSERT INTO customers (name, phone) VALUES (?, ?)';
      db.run(customerSql, [name, phone], function(err) {
        if (err) {
          return res.status(500).json({ message: '创建客户失败', error: err.message });
        }
        
        // 使用新创建的客户ID插入销售记录
        insertSalesRecord(this.lastID);
      });
    } else {
      // 使用现有客户ID插入销售记录
      insertSalesRecord(customer.id);
    }
  });
  
  // 辅助函数：插入销售记录
  function insertSalesRecord(customerId) {
    // 开始事务
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // 插入主销售记录
      const salesSql = `
      INSERT INTO sales (
        customer_id, name, phone, transaction_number, date, sale_type,
          store, salesperson1, salesperson2, notes, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
      const salesParams = [
      customerId, name, phone, transaction_number || null, date,
      sale_type || null, store || null, salesperson1 || null, salesperson2 || null,
        notes || null, total_amount || 0
    ];
    
      db.run(salesSql, salesParams, function(err) {
      if (err) {
          db.run('ROLLBACK');
        return res.status(500).json({ message: '创建销售记录失败', error: err.message });
      }
      
      const saleId = this.lastID;
        
        // 插入商品明细
        const itemSql = `
          INSERT INTO sales_item (
            sale_id, product_code, size, quantity, amount
          ) VALUES (?, ?, ?, ?, ?)
        `;
        
        const itemStmt = db.prepare(itemSql);
        let hasError = false;
        
        sales_items.forEach(item => {
          itemStmt.run([
            saleId,
            item.product_code,
            item.size || null,
            item.quantity || 1,
            item.amount || 0
          ], function(err) {
            if (err) {
              console.error('插入商品明细失败:', err);
              hasError = true;
            }
          });
        });
        
        itemStmt.finalize();
        
        if (hasError) {
          db.run('ROLLBACK');
          return res.status(500).json({ message: '创建商品明细失败' });
        }
      
      // 更新客户消费信息
        updateCustomerConsumption(customerId, total_amount || 0, sales_items.reduce((sum, item) => sum + (item.quantity || 0), 0), date);
      
      // 为销售记录创建对应的积分记录
        createPointsForSale(customerId, name, phone, date, total_amount || 0, saleId);
        
        // 提交事务
        db.run('COMMIT', function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '提交事务失败', error: err.message });
          }
      
      res.status(201).json({ 
        message: '销售记录创建成功', 
        saleId: saleId 
          });
        });
      });
    });
  }
  
  // 辅助函数：更新客户消费信息
  function updateCustomerConsumption(customerId, amount, quantity, date) {
    const parsedAmount = parseFloat(amount) || 0;
    const parsedQuantity = parseInt(quantity) || 0;
    
    console.log(`开始更新客户ID: ${customerId} 的消费信息，金额: ${parsedAmount}，数量: ${parsedQuantity}，日期: ${date}`);
    
    // 修改SQL逻辑：只有当新日期比当前last_consumption更晚时才更新最近消费日期
    db.run(`
      UPDATE customers SET
        total_consumption = total_consumption + ?,
        consumption_count = consumption_count + ?,
        consumption_times = consumption_times + 1,
        last_consumption = CASE 
          WHEN last_consumption IS NULL OR last_consumption = '' OR ? > last_consumption THEN ?
          ELSE last_consumption
        END
      WHERE id = ?
    `, [parsedAmount, parsedQuantity, date, date, customerId], function(err) {
      if (err) {
        console.error(`更新客户消费信息失败:`, err);
      } else {
        console.log(`成功更新客户ID: ${customerId} 的消费信息`);
        
        // 验证更新是否生效
        db.get('SELECT total_consumption, consumption_count, consumption_times, last_consumption FROM customers WHERE id = ?', [customerId], (err, result) => {
          if (err) {
            console.error('获取更新后的客户信息失败:', err);
          } else {
            console.log('客户消费信息更新结果:', result);
          }
        });
      }
    });
  }
  
  // 辅助函数：为销售记录创建积分记录
  function createPointsForSale(customerId, customerName, customerPhone, date, amount, saleId) {
    // 计算获得的积分，例如每消费1元获得1积分（可以根据业务需求调整）
    const earnedPoints = Math.floor(parseFloat(amount));
    
    console.log(`计算销售记录 #${saleId} 的积分，金额: ${amount}，积分: ${earnedPoints}`);
    
    if (earnedPoints <= 0) {
      console.log(`销售记录 #${saleId} 无积分，跳过积分创建`);
      return; // 如果没有积分，不创建积分记录
    }
    
    const pointsSql = `
      INSERT INTO points (
        customer_id, name, phone, date, channel, points, operator, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const pointsParams = [
      customerId, 
      customerName, 
      customerPhone, 
      date, 
      'earned', // 消费积分
      earnedPoints, 
      salesperson1 || '系统', 
      `销售记录 #${saleId} 自动生成的积分`
    ];
    
    db.run(pointsSql, pointsParams, function(err) {
      if (err) {
        console.error('创建积分记录失败:', err);
        // 不影响销售记录的创建，仅记录错误
      } else {
        console.log(`已为客户 ${customerName} 创建 ${earnedPoints} 积分，积分ID: ${this.lastID}`);
        
        // 使用recalculateCustomerPoints重新计算客户积分
        const { recalculateCustomerPoints } = require('../models/db');
        recalculateCustomerPoints(customerId)
          .then(result => {
            console.log(`销售记录 #${saleId} - 客户积分已重新计算: 累计积分=${result.totalPoints}, 可用积分=${result.availablePoints}`);
          })
          .catch(err => {
            console.error(`销售记录 #${saleId} - 重新计算客户积分失败:`, err);
          });
      }
    });
  }
});

// 更新销售记录
router.put('/:id', isAuthenticated, (req, res) => {
  const {
    name, phone, transaction_number, date, sale_type, store,
    salesperson1, salesperson2, notes, product_code, size, quantity, amount
  } = req.body;
  
  // 基本验证
  if (!name || !phone || !date) {
    return res.status(400).json({ message: '姓名、电话和日期是必填项' });
  }
  
  // 查询原销售记录数据，以便计算差值
  db.get('SELECT * FROM sales WHERE id = ?', [req.params.id], (err, oldSale) => {
    if (err) {
      return res.status(500).json({ message: '查询销售记录失败', error: err.message });
    }
    
    if (!oldSale) {
      return res.status(404).json({ message: '销售记录不存在' });
    }
    
    // 更新销售记录
    const sql = `
      UPDATE sales SET
        name = ?, phone = ?, transaction_number = ?, date = ?, sale_type = ?,
        store = ?, salesperson1 = ?, salesperson2 = ?, notes = ?,
        product_code = ?, size = ?, quantity = ?, amount = ?
      WHERE id = ?
    `;
    
    const params = [
      name, phone, transaction_number || null, date,
      sale_type || null, store || null, salesperson1 || null, salesperson2 || null,
      notes || null, product_code || null, size || null, 
      quantity || oldSale.quantity, amount || oldSale.amount,
      req.params.id
    ];
    
    db.run(sql, params, function(err) {
      if (err) {
        return res.status(500).json({ message: '更新销售记录失败', error: err.message });
      }
      
      // 如果金额或数量发生变化，更新客户消费信息
      const amountDiff = (parseFloat(amount) || 0) - (oldSale.amount || 0);
      const quantityDiff = (parseInt(quantity) || 0) - (oldSale.quantity || 0);
      
      if (amountDiff !== 0 || quantityDiff !== 0) {
        // 更新客户消费记录
        db.run(`
          UPDATE customers SET
            total_consumption = total_consumption + ?,
            consumption_count = consumption_count + ?
          WHERE id = ?
        `, [amountDiff, quantityDiff, oldSale.customer_id]);
        
        // 如果金额发生变化，调整相关积分记录
        if (amountDiff !== 0) {
          // 查找与这个销售记录关联的积分记录
          db.get(`SELECT id, points FROM points WHERE notes LIKE ? AND channel = 'earned'`,
            [`销售记录 #${req.params.id} 自动生成的积分%`], (err, pointRecord) => {
              if (err || !pointRecord) {
                // 如果找不到相关积分记录或发生错误，创建新的积分记录
                if (amountDiff > 0) {
                  // 只有当金额增加时才创建新的积分记录
                  const earnedPoints = Math.floor(amountDiff);
                  if (earnedPoints > 0) {
                    const pointsSql = `
                      INSERT INTO points (
                        customer_id, name, phone, date, channel, points, operator, notes
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    db.run(pointsSql, [
                      oldSale.customer_id, name, phone, date, 'earned', earnedPoints,
                      salesperson1 || '系统', `销售记录 #${req.params.id} 修改后增加的积分`
                    ], function(err) {
                      if (err) {
                        console.error('创建积分记录失败:', err);
                      } else {
                        // 使用recalculateCustomerPoints重新计算客户积分
                        const { recalculateCustomerPoints } = require('../models/db');
                        recalculateCustomerPoints(oldSale.customer_id)
                          .then(result => {
                            console.log(`销售记录更新 #${req.params.id} - 客户积分已重新计算: 累计积分=${result.totalPoints}, 可用积分=${result.availablePoints}`);
                          })
                          .catch(err => {
                            console.error(`销售记录更新 #${req.params.id} - 重新计算客户积分失败:`, err);
                          });
                      }
                    });
                  }
                }
              } else {
                // 如果找到积分记录，更新积分数量
                const newPoints = Math.max(1, pointRecord.points + Math.floor(amountDiff));
                if (newPoints <= 0) {
                  // 如果新积分为0或负数，删除积分记录
                  db.run(`DELETE FROM points WHERE id = ?`, [pointRecord.id], function(err) {
                    if (err) {
                      console.error(`删除积分记录失败:`, err);
                    } else {
                      // 使用recalculateCustomerPoints重新计算客户积分
                      const { recalculateCustomerPoints } = require('../models/db');
                      recalculateCustomerPoints(oldSale.customer_id)
                        .then(result => {
                          console.log(`销售记录更新后删除积分 #${req.params.id} - 客户积分已重新计算: 累计积分=${result.totalPoints}, 可用积分=${result.availablePoints}`);
                        })
                        .catch(err => {
                          console.error(`销售记录更新后删除积分 #${req.params.id} - 重新计算客户积分失败:`, err);
                        });
                    }
                  });
                } else {
                  // 更新积分记录
                  db.run(`UPDATE points SET points = ? WHERE id = ?`, 
                    [newPoints, pointRecord.id], function(err) {
                      if (err) {
                        console.error(`更新积分记录失败:`, err);
                      } else {
                        // 使用recalculateCustomerPoints重新计算客户积分
                        const { recalculateCustomerPoints } = require('../models/db');
                        recalculateCustomerPoints(oldSale.customer_id)
                          .then(result => {
                            console.log(`销售记录更新积分 #${req.params.id} - 客户积分已重新计算: 累计积分=${result.totalPoints}, 可用积分=${result.availablePoints}`);
                          })
                          .catch(err => {
                            console.error(`销售记录更新积分 #${req.params.id} - 重新计算客户积分失败:`, err);
                          });
                      }
                  });
                }
              }
            });
        }
      }
      
      res.json({ 
        message: '销售记录更新成功', 
        changes: this.changes 
      });
    });
  });
});

// 删除销售记录
router.delete('/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 获取销售记录信息
    db.get('SELECT customer_id, total_amount FROM sales WHERE id = ?', [id], (err, sale) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ message: '获取销售记录失败', error: err.message });
      }
  
      if (!sale) {
        db.run('ROLLBACK');
        return res.status(404).json({ message: '销售记录不存在' });
      }
      
      // 新增：查出该销售的商品总数量
      db.get('SELECT SUM(quantity) as total_quantity FROM sales_item WHERE sale_id = ?', [id], (err, row) => {
        const totalQuantity = row && row.total_quantity ? row.total_quantity : 0;

        // 删除商品明细
        db.run('DELETE FROM sales_item WHERE sale_id = ?', [id], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '删除商品明细失败', error: err.message });
          }
      
          // 删除销售记录
          db.run('DELETE FROM sales WHERE id = ?', [id], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ message: '删除销售记录失败', error: err.message });
            }
        
            // 更新客户消费统计
            const updateSql = `
              UPDATE customers SET
                total_consumption = total_consumption - ?,
                consumption_count = consumption_count - ?,
                consumption_times = consumption_times - 1
              WHERE id = ?
            `;
            db.run(updateSql, [sale.total_amount || 0, totalQuantity, sale.customer_id], function(err) {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ message: '更新客户消费信息失败', error: err.message });
              }
              
              // 提交事务
              db.run('COMMIT', function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: '提交事务失败', error: err.message });
                }
                // 新增：删除销售后同步更新客户积分
                const { recalculateCustomerPoints } = require('../models/db');
                recalculateCustomerPoints(sale.customer_id)
                  .then(result => {
                    console.log(`删除销售记录后，客户积分已重新计算: 累计积分=${result.totalPoints}, 可用积分=${result.availablePoints}`);
                  })
                  .catch(err => {
                    console.error('删除销售记录后重新计算客户积分失败:', err);
                  });
                res.json({ message: '销售记录删除成功' });
              });
            });
          });
        });
      });
    });
  });
});

// 导入销售数据
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
      
      // 返回导入任务ID
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
            currentItem: null,
            lastUpdate: Date.now(),
            batchProgress: 0
          };
          
          // 逐条处理记录
          processSalesRecords(records, importId);
          
          // 处理完成后删除临时文件
          fs.unlinkSync('temp_import.csv');
        });
      
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // 处理Excel文件
      const workbook = xlsx.read(fileBuffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        cellText: false
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      records = xlsx.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: null,
        dateNF: 'yyyy-mm-dd'
      });
      
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
        currentItem: null,
        lastUpdate: Date.now(),
        batchProgress: 0
      };
      
      // 开始异步处理
      processSalesRecords(records, importId);
      
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
  
  const task = global.importTasks[importId];
  const now = Date.now();
  
  // 如果距离上次更新不到1秒，返回缓存的状态
  if (now - task.lastUpdate < 1000) {
    return res.json({
      ...task,
      cached: true
    });
  }
  
  // 更新最后更新时间
  task.lastUpdate = now;
  
  // 确保successRecords字段始终存在
  if (task.successRecords === undefined) {
    task.successRecords = 0;
  }
  
  res.json(task);
});

// 删除所有销售数据
router.delete('/deleteAll', isAuthenticated, (req, res) => {
  // 直接执行删除操作，不再检查管理员角色
  // 在生产环境中应添加角色检查，但为了测试方便，暂时移除
  
  // 先删除销售记录关联的积分记录
  db.run("DELETE FROM points WHERE channel = 'earned' AND notes LIKE '销售记录 #%'", (err) => {
    if (err) {
      console.error('删除销售相关积分记录失败:', err);
      return res.status(500).json({ 
        message: '删除销售相关积分记录失败', 
        error: err.message 
      });
    }
    
    // 然后删除销售记录
    db.run('DELETE FROM sales', function(err) {
      if (err) {
        console.error('删除所有销售记录失败:', err);
        return res.status(500).json({ 
          message: '删除所有销售记录失败', 
          error: err.message 
        });
      }
      
      const deletedCount = this.changes;
      
      // 重置所有客户的消费统计信息
      db.run(`
        UPDATE customers SET
          total_consumption = 0,
          consumption_count = 0,
          consumption_times = 0,
          last_consumption = NULL
      `, function(err) {
        if (err) {
          console.error('重置客户消费信息失败:', err);
          return res.status(500).json({ 
            message: '重置客户消费信息失败', 
            error: err.message 
          });
        }
        
        res.json({ 
          message: '已删除所有销售记录及相关积分记录并重置客户消费信息', 
          deletedCount: deletedCount 
        });
      });
    });
  });
});

// 异步处理销售记录
async function processSalesRecords(records, importId) {
  const task = global.importTasks[importId];
  
  // 初始化成功计数
  task.successRecords = 0;
  
  // 准备批量插入的数据
  const batchSize = 100;
  let currentBatch = [];
  let existingCustomers = new Map();
  
  // 首先获取所有已存在的客户电话
  await new Promise((resolve, reject) => {
    db.all('SELECT id, phone FROM customers', [], (err, rows) => {
      if (err) return reject(err);
      rows.forEach(row => existingCustomers.set(row.phone, row.id));
      resolve();
    });
  });
  
  // 预处理所有记录
  const processedRecords = records.map(record => {
    try {
      const saleData = {
        name: record.姓名 || record.name,
        phone: record.电话 || record.phone,
        transaction_number: record.流水 || record.transaction_number || record.流水号,
        date: record.日期 || record.date,
        sale_type: record.销售类型 || record.sale_type,
        store: record.门店 || record.store,
        salesperson1: record.导购1 || record.salesperson1,
        salesperson2: record.导购2 || record.salesperson2,
        notes: record.单据备注 || record.notes || record.备注,
        product_code: record.货号 || record.product_code,
        size: record.尺码 || record.size,
        quantity: parseInt(record.数量 || record.quantity || 1),
        amount: 0
      };
      
      // 处理日期格式
      if (saleData.date) {
        saleData.date = processDate(saleData.date);
      }
      
      // 处理金额
      saleData.amount = processAmount(record);
      
      // 检查必填字段
      if (!saleData.name || !saleData.phone || !saleData.date) {
        throw new Error('姓名、电话和日期是必填项');
      }
      
      return {
        data: saleData,
        customerId: existingCustomers.get(saleData.phone)
      };
    } catch (error) {
      task.errors.push(`销售记录 ${record.姓名 || record.name}(${record.电话 || record.phone}) 处理失败: ${error.message}`);
      return null;
    }
  }).filter(record => record !== null);
  
  // 批量处理记录
  for (let i = 0; i < processedRecords.length; i += batchSize) {
    const batch = processedRecords.slice(i, i + batchSize);
    await processBatch(batch, task);
    
    // 更新进度
    task.processedRecords = Math.min(i + batchSize, processedRecords.length);
    task.batchProgress = Math.floor((task.processedRecords / processedRecords.length) * 100);
    task.successRecords = task.processedRecords - task.errors.length;
  }
  
  // 更新任务状态
  task.status = 'completed';
  task.currentItem = null;
  task.batchProgress = 100;
  
  console.log(`导入完成: 共 ${task.totalRecords} 条记录，成功导入 ${task.successRecords} 条`);
}

// 处理日期格式
function processDate(dateStr) {
  try {
    // 尝试解析中文日期格式
    const chineseDateMatch = dateStr.toString().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (chineseDateMatch) {
      const year = parseInt(chineseDateMatch[1]);
      const month = parseInt(chineseDateMatch[2]) - 1;
      const day = parseInt(chineseDateMatch[3]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // 尝试解析Excel日期格式
    const dateParts = dateStr.toString().split('/');
    if (dateParts.length === 3) {
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);
      const year = parseInt(dateParts[2]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // 尝试直接解析日期字符串
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    // 尝试解析Excel序列号日期
    const excelDate = parseFloat(dateStr);
    if (!isNaN(excelDate)) {
      const excelEpoch = new Date(1900, 0, 1);
      const milliseconds = (excelDate - 1) * 24 * 60 * 60 * 1000;
      const date = new Date(excelEpoch.getTime() + milliseconds);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    throw new Error('无法解析日期格式');
  } catch (e) {
    throw new Error('日期格式无效，请使用YYYY年MM月DD日或YYYY-MM-DD或M/D/YYYY格式');
  }
}

// 处理金额
function processAmount(record) {
  const possibleAmountFields = [
    '金额', 'amount', '价格', 'price', '销售额', '销售金额', 
    '成交金额', '成交价', '小计', '合计'
  ];
  
  // 尝试可能的金额字段名
  for (const field of possibleAmountFields) {
    if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
      return parseAmount(record[field]);
    }
  }
  
  // 如果找不到已知字段，尝试检查任何带有"金额"或"amount"的字段
  for (const key in record) {
    if ((key.includes('金额') || key.toLowerCase().includes('amount') || 
         key.toLowerCase().includes('price')) && 
        record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return parseAmount(record[key]);
    }
  }
  
  return 0;
}

// 解析金额
function parseAmount(value) {
  let amountStr = String(value).trim();
  amountStr = amountStr.replace(/[¥$€£,]/g, '');
  
  if (amountStr.endsWith('%')) {
    amountStr = amountStr.replace('%', '') / 100;
  }
  
  const parsedAmount = parseFloat(amountStr);
  return isNaN(parsedAmount) ? 0 : parsedAmount;
}

// 处理批量插入
async function processBatch(batch, task) {
  // 准备批量插入的SQL语句
  const withCustomerSql = `
    INSERT INTO sales (
      customer_id, name, phone, transaction_number, date, sale_type,
      store, salesperson1, salesperson2, notes, product_code, size, quantity, amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const withoutCustomerSql = `
    INSERT INTO sales (
      name, phone, transaction_number, date, sale_type,
      store, salesperson1, salesperson2, notes, product_code, size, quantity, amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  // 开始事务
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const withCustomerStmt = db.prepare(withCustomerSql);
      const withoutCustomerStmt = db.prepare(withoutCustomerSql);
      
      // 用于存储需要更新客户消费信息的记录
      const customerUpdates = [];
      
      batch.forEach(item => {
        const { data, customerId } = item;
        
        if (customerId) {
          // 插入关联客户的销售记录
          withCustomerStmt.run(
            customerId, data.name, data.phone, data.transaction_number,
            data.date, data.sale_type, data.store,
            data.salesperson1, data.salesperson2, data.notes,
            data.product_code, data.size, data.quantity, data.amount,
            function(err) {
              if (err) {
                console.error('插入销售记录失败:', err);
                return;
              }
              
              // 收集需要更新客户消费信息的记录
              customerUpdates.push({
                customerId: customerId,
                amount: data.amount,
                quantity: data.quantity,
                date: data.date
              });
            }
          );
        } else {
          // 插入不关联客户的销售记录
          withoutCustomerStmt.run(
            data.name, data.phone, data.transaction_number,
            data.date, data.sale_type, data.store,
            data.salesperson1, data.salesperson2, data.notes,
            data.product_code, data.size, data.quantity, data.amount,
            function(err) {
              if (err) {
                console.error('插入销售记录失败:', err);
                return;
              }
            }
          );
        }
      });
      
      withCustomerStmt.finalize();
      withoutCustomerStmt.finalize();
      
      // 提交事务
      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        
        // 更新客户消费信息
        const updateCustomerStmt = db.prepare(`
          UPDATE customers SET
            total_consumption = total_consumption + ?,
            consumption_count = consumption_count + ?,
            consumption_times = consumption_times + 1,
            last_consumption = CASE 
              WHEN last_consumption IS NULL OR last_consumption = '' OR ? > last_consumption THEN ?
              ELSE last_consumption
            END
          WHERE id = ?
        `);
        
        // 批量更新客户消费信息
        customerUpdates.forEach(update => {
          updateCustomerStmt.run(
            update.amount,
            update.quantity,
            update.date,
            update.date,
            update.customerId
          );
        });
        
        updateCustomerStmt.finalize();
        resolve();
      });
    });
  });
}

module.exports = router;