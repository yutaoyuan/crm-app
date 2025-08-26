/**
 * 数据验证中间件
 * 使用Joi进行数据验证，防止无效数据和安全攻击
 */
const Joi = require('joi');
const { ValidationError } = require('./errorHandler');

// 通用验证规则
const commonSchemas = {
  id: Joi.number().integer().positive(),
  phone: Joi.string().pattern(/^1[3-9]\d{9}$/).message('请输入有效的手机号码'),
  email: Joi.string().email().message('请输入有效的邮箱地址'),
  name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\u4e00-\u9fa5\s]+$/).message('姓名只能包含中文、英文和空格'),
  date: Joi.date().iso(),
  money: Joi.number().min(0).precision(2),
  text: Joi.string().max(1000).pattern(/^[^<>]*$/).message('文本不能包含HTML标签'),
  select: (options) => Joi.string().valid(...options)
};

// 客户验证规则
const customerSchemas = {
  create: Joi.object({
    name: commonSchemas.name.required(),
    phone: commonSchemas.phone.required(),
    age: Joi.number().integer().min(1).max(150).optional(),
    height: Joi.string().max(20).optional(),
    upper_size: commonSchemas.select(['1码', '2码', '3码', '4码', '5码', '6码']).optional(),
    lower_size: commonSchemas.select(['1码', '2码', '3码', '4码', '5码', '6码']).optional(),
    body_type: commonSchemas.select(['S型：三围曲线明显', 'A型：上身苗条，下身发胖', 'V型：上身宽大，下身纤细', 'O型：上下正常，腰部圆润']).optional(),
    features: commonSchemas.text.optional(),
    reception: commonSchemas.select(['犹豫型', '冲动型', '理智型', '推荐型']).optional(),
    personality: Joi.string().max(100).optional(),
    color_preference: Joi.string().max(200).optional(),
    style_preference: Joi.string().max(200).optional(),
    accompaniment: Joi.string().max(100).optional(),
    department: Joi.string().max(100).optional(),
    employee: Joi.string().max(50).optional(),
    registration_date: commonSchemas.date.optional(),
    photo: Joi.string().max(10000000).optional() // Base64编码的图片
  }),
  
  update: Joi.object({
    id: commonSchemas.id.required(),
    name: commonSchemas.name.optional(),
    phone: commonSchemas.phone.optional(),
    age: Joi.number().integer().min(1).max(150).optional(),
    height: Joi.string().max(20).optional(),
    upper_size: commonSchemas.select(['1码', '2码', '3码', '4码', '5码', '6码']).optional(),
    lower_size: commonSchemas.select(['1码', '2码', '3码', '4码', '5码', '6码']).optional(),
    body_type: commonSchemas.select(['S型：三围曲线明显', 'A型：上身苗条，下身发胖', 'V型：上身宽大，下身纤细', 'O型：上下正常，腰部圆润']).optional(),
    features: commonSchemas.text.optional(),
    reception: commonSchemas.select(['犹豫型', '冲动型', '理智型', '推荐型']).optional(),
    personality: Joi.string().max(100).optional(),
    color_preference: Joi.string().max(200).optional(),
    style_preference: Joi.string().max(200).optional(),
    accompaniment: Joi.string().max(100).optional(),
    department: Joi.string().max(100).optional(),
    employee: Joi.string().max(50).optional(),
    registration_date: commonSchemas.date.optional(),
    photo: Joi.string().max(10000000).optional()
  }),
  
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    q: Joi.string().max(100).optional(),
    sort: Joi.string().valid('id', 'name', 'phone', 'last_consumption', 'last_visit').optional(),
    order: Joi.string().valid('asc', 'desc').optional(),
    employee: Joi.string().max(50).optional()
  })
};

// 销售验证规则
const salesSchemas = {
  create: Joi.object({
    customer_phone: commonSchemas.phone.required(),
    items: Joi.array().items(
      Joi.object({
        item_name: Joi.string().min(1).max(200).required(),
        quantity: Joi.number().integer().min(1).required(),
        unit_price: commonSchemas.money.required(),
        total_price: commonSchemas.money.required()
      })
    ).min(1).required(),
    total_amount: commonSchemas.money.required(),
    payment_method: commonSchemas.select(['现金', '微信', '支付宝', '银行卡', '其他']).required(),
    employee: Joi.string().max(50).required(),
    sale_date: commonSchemas.date.required(),
    notes: commonSchemas.text.optional()
  })
};

// 积分验证规则
const pointsSchemas = {
  create: Joi.object({
    customer_phone: commonSchemas.phone.required(),
    type: commonSchemas.select(['earned', 'redeemed']).required(),
    points: Joi.number().integer().min(1).required(),
    reason: Joi.string().min(1).max(200).required(),
    employee: Joi.string().max(50).required()
  })
};

// 回访验证规则
const visitsSchemas = {
  create: Joi.object({
    customer_phone: commonSchemas.phone.required(),
    visit_method: commonSchemas.select(['电话', '微信', '短信', '邮件', '上门']).required(),
    visit_purpose: commonSchemas.select(['关怀问候', '产品推荐', '售后服务', '满意度调查', '其他']).required(),
    visit_result: commonSchemas.select(['成功联系', '无人接听', '拒绝回访', '约定下次', '其他']).required(),
    notes: commonSchemas.text.optional(),
    employee: Joi.string().max(50).required(),
    visit_date: commonSchemas.date.required()
  })
};

// 用户验证规则
const userSchemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).max(100).required()
  })
};

// 创建验证中间件
const createValidator = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // 显示所有错误
      stripUnknown: true, // 移除未知字段
      convert: true // 自动类型转换
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      throw new ValidationError(errorMessage);
    }

    // 将验证后的数据替换原始请求体
    req.body = value;
    next();
  };
};

// 创建查询参数验证中间件
const createQueryValidator = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      throw new ValidationError(errorMessage);
    }

    req.query = value;
    next();
  };
};

// 创建路径参数验证中间件
const createParamsValidator = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      convert: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      throw new ValidationError(errorMessage);
    }

    req.params = value;
    next();
  };
};

// 通用ID验证中间件
const validateId = createParamsValidator(Joi.object({
  id: commonSchemas.id.required()
}));

// SQL注入防护中间件
const sqlInjectionProtection = (req, res, next) => {
  const checkSqlInjection = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        const value = obj[key].toLowerCase();
        const sqlKeywords = [
          'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
          'union', 'script', 'javascript:', 'vbscript:', 'onload', 'onerror',
          '--', '/*', '*/', ';', 'xp_', 'sp_'
        ];
        
        for (const keyword of sqlKeywords) {
          if (value.includes(keyword)) {
            throw new ValidationError(`输入包含非法字符: ${keyword}`);
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        checkSqlInjection(obj[key]);
      }
    }
  };

  try {
    checkSqlInjection(req.body);
    checkSqlInjection(req.query);
    checkSqlInjection(req.params);
    next();
  } catch (error) {
    next(error);
  }
};

// 文件上传验证
const validateFileUpload = (req, res, next) => {
  if (req.file) {
    // 检查文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new ValidationError('只允许上传图片文件');
    }
    
    // 检查文件大小 (10MB)
    if (req.file.size > 10 * 1024 * 1024) {
      throw new ValidationError('文件大小不能超过10MB');
    }
  }
  next();
};

module.exports = {
  // 验证规则
  customerSchemas,
  salesSchemas,
  pointsSchemas,
  visitsSchemas,
  userSchemas,
  
  // 验证中间件创建器
  createValidator,
  createQueryValidator,
  createParamsValidator,
  
  // 通用验证中间件
  validateId,
  sqlInjectionProtection,
  validateFileUpload,
  
  // 具体验证中间件
  validateCustomerCreate: createValidator(customerSchemas.create),
  validateCustomerUpdate: createValidator(customerSchemas.update),
  validateCustomerQuery: createQueryValidator(customerSchemas.query),
  
  validateSaleCreate: createValidator(salesSchemas.create),
  validatePointCreate: createValidator(pointsSchemas.create),
  validateVisitCreate: createValidator(visitsSchemas.create),
  validateUserLogin: createValidator(userSchemas.login)
};