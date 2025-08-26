/**
 * 前端表单验证组件
 * 提供实时验证、XSS防护和用户友好的错误提示
 */
class FormValidator {
  constructor() {
    this.rules = new Map();
    this.errors = new Map();
    this.setupGlobalValidation();
  }

  // 设置全局验证
  setupGlobalValidation() {
    // 监听所有表单提交
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.tagName === 'FORM' && form.dataset.validate === 'true') {
        if (!this.validateForm(form)) {
          e.preventDefault();
        }
      }
    });

    // 监听输入事件进行实时验证
    document.addEventListener('input', (e) => {
      const input = e.target;
      if (input.dataset.validate) {
        this.validateField(input);
      }
    });
  }

  // 验证规则定义
  getValidationRules() {
    return {
      required: {
        test: (value) => value && value.toString().trim() !== '',
        message: '此字段为必填项'
      },
      
      phone: {
        test: (value) => /^1[3-9]\d{9}$/.test(value),
        message: '请输入有效的手机号码'
      },
      
      email: {
        test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: '请输入有效的邮箱地址'
      },
      
      name: {
        test: (value) => /^[a-zA-Z\u4e00-\u9fa5\s]{2,50}$/.test(value),
        message: '姓名只能包含2-50个中文、英文字符或空格'
      },
      
      number: {
        test: (value) => !isNaN(value) && isFinite(value),
        message: '请输入有效的数字'
      },
      
      integer: {
        test: (value) => Number.isInteger(Number(value)),
        message: '请输入整数'
      },
      
      positive: {
        test: (value) => Number(value) > 0,
        message: '请输入正数'
      },
      
      min: {
        test: (value, min) => Number(value) >= min,
        message: (min) => `数值不能小于${min}`
      },
      
      max: {
        test: (value, max) => Number(value) <= max,
        message: (max) => `数值不能大于${max}`
      },
      
      minLength: {
        test: (value, length) => value.toString().length >= length,
        message: (length) => `至少需要${length}个字符`
      },
      
      maxLength: {
        test: (value, length) => value.toString().length <= length,
        message: (length) => `不能超过${length}个字符`
      },
      
      pattern: {
        test: (value, pattern) => new RegExp(pattern).test(value),
        message: '格式不正确'
      },
      
      noHtml: {
        test: (value) => !/<[^>]*>/.test(value),
        message: '不能包含HTML标签'
      },
      
      noScript: {
        test: (value) => !/script|javascript|vbscript|onload|onerror/i.test(value),
        message: '包含非法字符'
      },
      
      date: {
        test: (value) => !isNaN(Date.parse(value)),
        message: '请输入有效的日期'
      },
      
      age: {
        test: (value) => {
          const num = Number(value);
          return Number.isInteger(num) && num >= 1 && num <= 150;
        },
        message: '年龄必须是1-150之间的整数'
      },
      
      money: {
        test: (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0,
        message: '请输入有效的金额（最多2位小数）'
      }
    };
  }

  // 验证单个字段
  validateField(input, showError = true) {
    const value = input.value;
    const rules = this.parseValidationRules(input.dataset.validate);
    const errors = [];

    // 如果字段为空且不是必填，则跳过验证
    if (!value && !rules.required) {
      this.clearFieldError(input);
      return true;
    }

    const validationRules = this.getValidationRules();

    // 执行验证规则
    for (const [ruleName, ruleValue] of Object.entries(rules)) {
      const rule = validationRules[ruleName];
      if (rule) {
        let isValid;
        if (ruleValue === true) {
          isValid = rule.test(value);
        } else {
          isValid = rule.test(value, ruleValue);
        }

        if (!isValid) {
          let message = rule.message;
          if (typeof message === 'function') {
            message = message(ruleValue);
          }
          errors.push(message);
        }
      }
    }

    // XSS防护
    if (value && this.hasXSSAttempt(value)) {
      errors.push('输入包含潜在的安全风险字符');
    }

    if (errors.length > 0) {
      if (showError) {
        this.showFieldError(input, errors[0]);
      }
      return false;
    } else {
      this.clearFieldError(input);
      return true;
    }
  }

  // 验证整个表单
  validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('[data-validate]');

    inputs.forEach(input => {
      if (!this.validateField(input, true)) {
        isValid = false;
      }
    });

    // 验证自定义规则
    const customValidation = form.dataset.customValidation;
    if (customValidation && window[customValidation]) {
      const customResult = window[customValidation](form);
      if (!customResult.valid) {
        isValid = false;
        if (customResult.message) {
          window.toast?.error(customResult.message);
        }
      }
    }

    return isValid;
  }

  // 解析验证规则
  parseValidationRules(ruleString) {
    const rules = {};
    if (!ruleString) return rules;

    const parts = ruleString.split('|');
    parts.forEach(part => {
      const [name, value] = part.split(':');
      rules[name] = value ? (isNaN(value) ? value : Number(value)) : true;
    });

    return rules;
  }

  // 显示字段错误
  showFieldError(input, message) {
    const errorId = input.id + '-error';
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.id = errorId;
      errorElement.className = 'field-error';
      errorElement.style.cssText = `
        color: #ff4d4f;
        font-size: 12px;
        margin-top: 4px;
        display: block;
      `;
      input.parentNode.appendChild(errorElement);
    }

    errorElement.textContent = message;
    input.style.borderColor = '#ff4d4f';
    input.classList.add('error');
  }

  // 清除字段错误
  clearFieldError(input) {
    const errorId = input.id + '-error';
    const errorElement = document.getElementById(errorId);

    if (errorElement) {
      errorElement.remove();
    }

    input.style.borderColor = '';
    input.classList.remove('error');
  }

  // XSS检测
  hasXSSAttempt(value) {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,
      /onmouseover\s*=/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi
    ];

    return xssPatterns.some(pattern => pattern.test(value));
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 净化HTML（移除危险标签和属性）
  sanitizeHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 移除所有script标签
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // 移除危险属性
    const dangerousAttrs = ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'];
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      dangerousAttrs.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });
    });

    return temp.innerHTML;
  }

  // 添加表单验证
  addFormValidation(formId, customRules = {}) {
    const form = document.getElementById(formId);
    if (form) {
      form.dataset.validate = 'true';
      if (customRules.customValidation) {
        form.dataset.customValidation = customRules.customValidation;
      }
    }
  }

  // 手动验证值
  validateValue(value, rules) {
    const validationRules = this.getValidationRules();
    const ruleMap = this.parseValidationRules(rules);

    for (const [ruleName, ruleValue] of Object.entries(ruleMap)) {
      const rule = validationRules[ruleName];
      if (rule) {
        let isValid;
        if (ruleValue === true) {
          isValid = rule.test(value);
        } else {
          isValid = rule.test(value, ruleValue);
        }

        if (!isValid) {
          let message = rule.message;
          if (typeof message === 'function') {
            message = message(ruleValue);
          }
          return { valid: false, message };
        }
      }
    }

    return { valid: true };
  }

  // 实时验证绑定
  bindRealTimeValidation(inputId, rules) {
    const input = document.getElementById(inputId);
    if (input) {
      input.dataset.validate = rules;
    }
  }
}

// 创建全局验证器实例
window.formValidator = new FormValidator();

// 便捷函数
window.validateForm = (formId) => {
  const form = document.getElementById(formId);
  return form ? window.formValidator.validateForm(form) : false;
};

window.validateField = (inputId) => {
  const input = document.getElementById(inputId);
  return input ? window.formValidator.validateField(input) : false;
};

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormValidator;
}