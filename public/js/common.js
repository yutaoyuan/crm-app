// 确认对话框函数
async function showConfirm({ title, content, type = 'default' }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.zIndex = '9999';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.backgroundColor = 'white';
    modalContent.style.margin = '15% auto';
    modalContent.style.padding = '20px';
    modalContent.style.border = '1px solid #888';
    modalContent.style.width = '400px';
    modalContent.style.borderRadius = '5px';
    modalContent.style.position = 'relative';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'close';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '10px';
    closeBtn.style.top = '5px';
    closeBtn.style.fontSize = '28px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.marginBottom = '15px';
    titleEl.style.color = type === 'danger' ? '#ff4d4f' : '#1890ff';

    const contentEl = document.createElement('p');
    contentEl.textContent = content;
    contentEl.style.marginBottom = '20px';

    const buttonContainer = document.createElement('div');
    buttonContainer.style.textAlign = 'right';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.marginRight = '10px';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #d9d9d9';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.backgroundColor = 'white';
    cancelBtn.style.cursor = 'pointer';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.padding = '8px 16px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.style.backgroundColor = type === 'danger' ? '#ff4d4f' : '#1890ff';
    confirmBtn.style.color = 'white';

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(titleEl);
    modalContent.appendChild(contentEl);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      resolve(false);
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    confirmBtn.onclick = () => {
      modal.remove();
      resolve(true);
    };

    window.onclick = (event) => {
      if (event.target === modal) {
        closeModal();
      }
    };

    // 添加键盘事件支持
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'Enter') {
        modal.remove();
        resolve(true);
      }
    };
    document.addEventListener('keydown', handleKeyPress);

    // 清理函数
    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyPress);
      window.onclick = null;
    };

    // 在模态框关闭时清理事件监听器
    modal.addEventListener('remove', cleanup);
  });
}

// 检查用户是否已登录
function checkAuth() {
  // 如果当前页面是登录页，不执行检查
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    return;
  }
  
  // 设置一个标志防止重复重定向
  if (window.isRedirecting) {
    return;
  }
  
  // 获取客户端存储的token，如果没有token，直接重定向到登录页面
  const token = localStorage.getItem('token');
  if (!token) {
    redirectToLogin();
    return;
  }
  
  const baseUrl = window.location.origin;
  fetch(`${baseUrl}/api/auth/status`, {
    credentials: 'include'  // Ensure cookies are sent with the request
  })
    .then(response => {
      // 检查响应的HTTP状态码
      if (response.status === 401) {
        // 401表示未授权，应该跳转到登录页
        throw new Error('未登录');
      }
      return response.json();
    })
    .then(data => {
      if (data.authenticated) {
        // 显示用户名
        const userElement = document.getElementById('current-user');
        if (userElement) {
          userElement.textContent = data.user ? data.user.username : localStorage.getItem('username') || '用户';
        }
      } else {
        // 服务器返回未登录状态
        redirectToLogin();
      }
    })
    .catch(error => {
      console.error('身份验证检查失败:', error);
      // 在非登录页面才重定向
      redirectToLogin();
    });
}

// 重定向到登录页的帮助函数
function redirectToLogin() {
  // 防止循环重定向
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    return;
  }
  
  // 设置标志防止重复重定向
  window.isRedirecting = true;
  
  // 不清除session，让服务器处理会话
  
  // 重定向到登录页
  window.location.href = '/';
}

// 退出登录
function logout() {
  // 设置标志防止重复重定向
  window.isRedirecting = true;
  
  fetch('/api/auth/logout', { 
    method: 'POST',
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      window.location.href = '/';
    })
    .catch(error => {
      console.error('退出登录失败:', error);
      // 即使失败也重定向到登录页
      window.location.href = '/';
    });
}

// 格式化日期
function formatDate(dateString) {
  if (!dateString) return '';
  
  // 检查是否是异常的大年份（例如45612-01-01）
  if (dateString && typeof dateString === 'string') {
    const match = dateString.match(/^(\d{5,})-(\d{2})-(\d{2})$/);
    if (match) {
      // 如果年份超过9999，则返回一个合理的默认日期
      return ''; // 或者返回其他默认值如 'N/A' 或 '未知'
    }
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  // 使用固定的YYYY-MM-DD格式而不是本地化日期
  const year = date.getFullYear();
  // 检查年份是否合理（1900-2099）
  if (year < 1900 || year > 2099) {
    return ''; // 或者返回其他默认值
  }
  
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化日期时间（精确到秒）
function formatDateTime(dateString) {
  if (!dateString) return '';
  
  // 检查是否是异常的大年份
  if (dateString && typeof dateString === 'string') {
    const match = dateString.match(/^(\d{5,})-(\d{2})-(\d{2})$/);
    if (match) {
      return '';
    }
  }
  
  // 创建Date对象（默认为UTC时间）
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  // 检查年份是否合理（1900-2099）
  const year = date.getFullYear();
  if (year < 1900 || year > 2099) {
    return '';
  }
  
  // 将UTC时间转换为北京时间（UTC+8）
  const utcDate = new Date(date.getTime());
  const beijingDate = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  
  const year_bj = beijingDate.getFullYear();
  const month_bj = String(beijingDate.getMonth() + 1).padStart(2, '0');
  const day_bj = String(beijingDate.getDate()).padStart(2, '0');
  const hours_bj = String(beijingDate.getHours()).padStart(2, '0');
  const minutes_bj = String(beijingDate.getMinutes()).padStart(2, '0');
  const seconds_bj = String(beijingDate.getSeconds()).padStart(2, '0');
  
  return `${year_bj}-${month_bj}-${day_bj} ${hours_bj}:${minutes_bj}:${seconds_bj}`;
}

// 格式化金额
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '¥0.00';
  
  return '¥' + parseFloat(amount).toFixed(2);
}

// 显示错误消息
function showError(message, element) {
  if (!element) {
    // alert(message);
    showAlert(message, 'error');
    return;
  }
  
  element.textContent = message;
  element.style.display = 'block';
  
  // 5秒后自动隐藏
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

// 显示成功消息
function showSuccess(message, element) {
  if (!element) {
    // alert(message);
    showGlobalNotification(message);
    return;
  }
  
  element.textContent = message;
  element.style.display = 'block';
  
  // 3秒后自动隐藏
  setTimeout(() => {
    element.style.display = 'none';
  }, 3000);
}

// 通用模态框控制
function setupModal(modalId, openBtnId, closeBtnClass) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.error('未找到模态框:', modalId);
    return null;
  }
  
  console.log(`设置模态框: ${modalId}, 打开按钮: ${openBtnId}, 关闭按钮: ${closeBtnClass}`);
  
  // 打开按钮
  if (openBtnId) {
    const openBtn = document.getElementById(openBtnId);
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        console.log(`点击了打开按钮: ${openBtnId}`);
        modal.setAttribute('style', 'display: flex !important; align-items: center; justify-content: center;');
      });
    } else {
      console.warn(`未找到打开按钮: ${openBtnId}`);
    }
  }
  
  // 关闭按钮
  const closeButtons = modal.querySelectorAll(closeBtnClass || '.modal-close');
  console.log(`找到 ${closeButtons.length} 个关闭按钮`);
  
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('点击了关闭按钮');
      modal.setAttribute('style', 'display: none !important');
    });
  });
  
  // 点击模态框外部区域关闭
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      console.log('点击了模态框外部区域');
      modal.setAttribute('style', 'display: none !important');
    }
  });
  
  return modal;
}

// 渲染通用分页控件
function renderCommonPagination(currentPage, totalPages, loadDataCallback, containerElement) {
  if (!containerElement) return;
  
  containerElement.innerHTML = '';
  
  if (totalPages <= 1) {
    return; // 只有一页，不显示分页控件
  }
  
  // 创建"上一页"按钮
  const prevBtn = document.createElement('a');
  prevBtn.href = '#';
  prevBtn.classList.add('page-link');
  prevBtn.textContent = '上一页';
  if (currentPage <= 1) {
    prevBtn.classList.add('disabled');
  } else {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadDataCallback(currentPage - 1);
    });
  }
  containerElement.appendChild(prevBtn);
  
  // 确定显示的页码范围
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  // 如果范围不足5页，调整起始页
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }
  
  // 显示第一页链接
  if (startPage > 1) {
    const firstPageLink = document.createElement('a');
    firstPageLink.href = '#';
    firstPageLink.classList.add('page-link');
    firstPageLink.textContent = '1';
    firstPageLink.addEventListener('click', (e) => {
      e.preventDefault();
      loadDataCallback(1);
    });
    containerElement.appendChild(firstPageLink);
    
    // 如果不相邻，显示省略号
    if (startPage > 2) {
      const ellipsis = document.createElement('span');
      ellipsis.classList.add('ellipsis');
      ellipsis.textContent = '...';
      containerElement.appendChild(ellipsis);
    }
  }
  
  // 显示页码
  for (let i = startPage; i <= endPage; i++) {
    const pageLink = document.createElement('a');
    pageLink.href = '#';
    pageLink.classList.add('page-link');
    if (i === currentPage) {
      pageLink.classList.add('active');
    }
    pageLink.textContent = i;
    pageLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (i !== currentPage) {
        loadDataCallback(i);
      }
    });
    containerElement.appendChild(pageLink);
  }
  
  // 显示最后一页链接
  if (endPage < totalPages) {
    // 如果不相邻，显示省略号
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement('span');
      ellipsis.classList.add('ellipsis');
      ellipsis.textContent = '...';
      containerElement.appendChild(ellipsis);
    }
    
    const lastPageLink = document.createElement('a');
    lastPageLink.href = '#';
    lastPageLink.classList.add('page-link');
    lastPageLink.textContent = totalPages;
    lastPageLink.addEventListener('click', (e) => {
      e.preventDefault();
      loadDataCallback(totalPages);
    });
    containerElement.appendChild(lastPageLink);
  }
  
  // 创建"下一页"按钮
  const nextBtn = document.createElement('a');
  nextBtn.href = '#';
  nextBtn.classList.add('page-link');
  nextBtn.textContent = '下一页';
  if (currentPage >= totalPages) {
    nextBtn.classList.add('disabled');
  } else {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadDataCallback(currentPage + 1);
    });
  }
  containerElement.appendChild(nextBtn);
}

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
  // 检查用户是否已登录
  checkAuth();
});