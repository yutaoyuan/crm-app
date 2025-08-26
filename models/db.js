const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const knex = require('knex');
const { app } = require('electron');

// 判断是否为开发/测试环境
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1';

// 统一数据库文件路径
let dbFile;
if (isDev) {
  dbFile = path.join(__dirname, '../databaseFolder/database.db3');
} else {
  dbFile = path.join(process.resourcesPath, 'databaseFolder', 'database.db3');
}

console.log('数据库文件路径:', dbFile);
console.log('数据库文件是否存在:', fs.existsSync(dbFile));

// 确保数据库目录存在
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('创建数据库目录成功');
  } catch (e) {
    console.error('创建数据库目录失败:', e);
  }
}

try {
  fs.accessSync(dbDir, fs.constants.W_OK);
  console.log('数据库目录可写');
} catch (e) {
  console.error('数据库目录不可写', e);
}

// knex 配置
const knexConfig = {
    client: 'sqlite3',
    connection: {
        filename: dbFile
    },
    useNullAsDefault: true
};
const knexDb = knex(knexConfig);

// sqlite3 连接
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
  }
});

console.log('数据库实际路径:', dbFile);

// 初始化数据库表结构
const init = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 用户表
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) reject(err);
      });

      // 客户表
      db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        age INTEGER,
        height TEXT,
        upper_size TEXT,
        lower_size TEXT,
        body_type TEXT,
        features TEXT,
        reception TEXT,
        personality TEXT,
        preferred_colors TEXT,
        preferred_styles TEXT,
        accompaniment TEXT,
        department TEXT,
        employee TEXT,
        registration_date TEXT,
        photo BLOB,
        total_consumption REAL DEFAULT 0,
        consumption_count INTEGER DEFAULT 0,
        consumption_times INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        available_points INTEGER DEFAULT 0,
        last_consumption TEXT,
        last_visit TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) reject(err);
      });

      // 销售表
      db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        transaction_number TEXT,
        date TEXT,
        sale_type TEXT,
        store TEXT,
        salesperson1 TEXT,
        salesperson2 TEXT,
        notes TEXT,
        total_amount REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`, (err) => {
        if (err) reject(err);
      });

      // 销售商品明细表
      db.run(`CREATE TABLE IF NOT EXISTS sales_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_code TEXT NOT NULL,
        size TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        amount REAL NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      )`, (err) => {
        if (err) reject(err);
      });

      // 积分表
      db.run(`CREATE TABLE IF NOT EXISTS points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT,
        channel TEXT,
        points INTEGER,
        operator TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`, (err) => {
        if (err) reject(err);
      });

      // 回访记录表
      db.run(`CREATE TABLE IF NOT EXISTS customer_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        visit_type TEXT NOT NULL,
        visit_purpose TEXT,
        visit_result TEXT,
        notes TEXT,
        next_visit_date TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`, (err) => {
        if (err) reject(err);
      });

      // 创建默认用户
      db.get("SELECT * FROM users WHERE username = ?", ["zhaochunyan"], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          // 如果默认用户不存在，创建它
          bcrypt.hash('zcy@123456', 10, (err, hash) => {
            if (err) {
              reject(err);
            } else {
              db.run("INSERT INTO users (username, password, email) VALUES (?, ?, ?)", 
                ["zhaochunyan", hash, "zhaochunyan@example.com"], (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            }
          });
        } else {
          resolve();
        }
      });
    });
  });
};

/**
 * 重新计算客户消费信息
 * 重新计算客户的消费统计信息，包括：
 * - total_consumption: 总消费金额
 * - consumption_count: 消费数量
 * - consumption_times: 消费次数
 * - last_consumption: 最近消费日期
 */
function recalculateCustomerConsumption(customerId) {
  return new Promise((resolve, reject) => {
    if (!customerId) {
      return resolve(false);
    }
    
    console.log(`开始重新计算客户ID: ${customerId} 的消费信息`);
    
    // 查询该客户的所有销售记录统计信息
    const consumptionQuery = `
      SELECT 
        COALESCE(SUM(s.total_amount), 0) as total_consumption,
        COALESCE(SUM(si.quantity), 0) as consumption_count,
        COUNT(DISTINCT s.id) as consumption_times,
        MAX(s.date) as last_consumption
      FROM sales s
      LEFT JOIN sales_item si ON s.id = si.sale_id
      WHERE s.customer_id = ? AND s.total_amount > 0
    `;
    
    db.get(consumptionQuery, [customerId], (err, result) => {
      if (err) {
        console.error('查询客户消费统计失败:', err);
        return reject(err);
      }
      
      const consumptionData = {
        total_consumption: result?.total_consumption || 0,
        consumption_count: result?.consumption_count || 0,
        consumption_times: result?.consumption_times || 0,
        last_consumption: result?.last_consumption || null
      };
      
      console.log(`客户ID: ${customerId} 的消费统计结果:`, consumptionData);
      
      // 更新客户表的消费信息
      db.run(`
        UPDATE customers 
        SET 
          total_consumption = ?,
          consumption_count = ?,
          consumption_times = ?,
          last_consumption = ?
        WHERE id = ?
      `, [
        consumptionData.total_consumption,
        consumptionData.consumption_count,
        consumptionData.consumption_times,
        consumptionData.last_consumption,
        customerId
      ], function(err) {
        if (err) {
          console.error(`更新客户消费信息失败:`, err);
          return reject(err);
        }
        
        console.log(`已重新计算客户ID ${customerId} 的消费信息`);
        resolve(consumptionData);
      });
    });
  });
}

/**
 * 批量重新计算所有客户的消费信息
 * 用于修复现有数据中的last_consumption字段问题
 */
function recalculateAllCustomersConsumption() {
  return new Promise((resolve, reject) => {
    console.log('开始批量重新计算所有客户的消费信息...');
    
    // 获取所有客户ID
    db.all('SELECT id FROM customers', [], (err, customers) => {
      if (err) {
        console.error('获取客户列表失败:', err);
        return reject(err);
      }
      
      console.log(`找到 ${customers.length} 个客户，开始重新计算...`);
      
      // 创建处理队列
      const processCustomer = (index) => {
        if (index >= customers.length) {
          console.log('所有客户消费信息重新计算完成');
          return resolve({ 
            total: customers.length, 
            message: '所有客户消费信息重新计算完成' 
          });
        }
        
        const customer = customers[index];
        recalculateCustomerConsumption(customer.id)
          .then(() => {
            // 处理下一个客户
            processCustomer(index + 1);
          })
          .catch(err => {
            console.error(`重新计算客户ID ${customer.id} 的消费信息失败:`, err);
            // 继续处理下一个客户，不中断整个过程
            processCustomer(index + 1);
          });
      };
      
      // 开始处理第一个客户
      processCustomer(0);
    });
  });
}

/**
 * 重新计算客户积分
 * 计算累计积分和可用积分：
 * - 累计积分 = 根据销售记录的总消费金额计算
 * - 可用积分 = 所有积分记录（正值和负值）的总和
 */
function recalculateCustomerPoints(customerId) {
  return new Promise((resolve, reject) => {
    if (!customerId) {
      return resolve(false);
    }
    
    // 先获取客户的电话号码，以便查询相关积分记录
    db.get('SELECT phone FROM customers WHERE id = ?', [customerId], (err, customer) => {
      if (err) {
        console.error('获取客户信息失败:', err);
        return reject(err);
      }
      
      if (!customer) {
        console.error(`未找到客户ID: ${customerId}`);
        return resolve(false);
      }
      
      const customerPhone = customer.phone;
      
      // 新的累计积分计算 - 根据销售记录的总消费金额计算
      const totalPointsQuery = `
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_amount
        FROM sales 
        WHERE customer_id = ? OR (phone = ? AND phone IS NOT NULL AND phone != '')
      `;
      
      // 查询可用积分 - 所有积分的净和
      const availablePointsQuery = `
        SELECT 
          SUM(points) as available_points
        FROM points 
        WHERE customer_id = ? OR (phone = ? AND phone IS NOT NULL AND phone != '')
      `;
      
      // 先获取总消费金额
      db.get(totalPointsQuery, [customerId, customerPhone], (err, totalResult) => {
        if (err) {
          console.error('计算总消费金额失败:', err);
          return reject(err);
        }
        
        // 计算累计积分 = 总消费金额向下取整
        const totalPoints = totalResult && totalResult.total_amount ? Math.floor(totalResult.total_amount) : 0;
        
        // 然后获取可用积分
        db.get(availablePointsQuery, [customerId, customerPhone], (err, availableResult) => {
          if (err) {
            console.error('计算可用积分失败:', err);
            return reject(err);
          }
          
          // 处理null结果
          const availablePoints = availableResult && availableResult.available_points ? availableResult.available_points : 0;
          
          // 更新客户表
          db.run(`
            UPDATE customers 
            SET 
              total_points = ?,
              available_points = ?
            WHERE id = ?
          `, [totalPoints, availablePoints, customerId], function(err) {
            if (err) {
              console.error(`更新客户积分数据失败:`, err);
              return reject(err);
            }
            
            console.log(`已重新计算客户ID ${customerId} 的积分数据: 累计积分=${totalPoints}, 可用积分=${availablePoints}`);
            resolve({
              totalPoints,
              availablePoints
            });
          });
        });
      });
    });
  });
}

/**
 * 空函数
 */
function setupTriggers() {
  return Promise.resolve();
}

module.exports = {
  db,
  init,
  recalculateCustomerPoints,
  recalculateCustomerConsumption,
  recalculateAllCustomersConsumption,
  setupTriggers,
  knexDb
}; 