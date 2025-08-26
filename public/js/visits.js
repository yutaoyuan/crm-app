// 全局变量
let visits = []; // 回访记录数据
let currentPage = 1;
let pageSize = parseInt(localStorage.getItem('visitsPageSize')) || 10; // 优先读取本地存储
let totalPages = 1;
let totalVisits = 0;
let currentSearchTerm = ''; // 当前搜索关键词
let pageCache = {}; // 用于缓存已加载的页面数据
const CACHE_RANGE = 5; // 当前页前后各缓存5页

// 通用API请求函数，添加授权头部
function fetchWithAuth(url, options = {}) {
  // 设置默认选项，使用credentials确保cookie被发送
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  
  // 合并选项，确保headers被正确合并
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {})
    }
  };
  
  // 如果是FormData，需要删除Content-Type头，让浏览器自动设置
  if (options.body instanceof FormData) {
    delete mergedOptions.headers['Content-Type'];
    console.log('检测到FormData，已删除Content-Type头');
  }
  
  // 确保URL是绝对路径
  const baseUrl = window.location.origin;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  
  console.log('Fetching URL:', fullUrl, 'Method:', options.method || 'GET');
  
  // 执行请求
  return fetch(fullUrl, mergedOptions)
    .then(response => {
      console.log('Response status:', response.status, response.statusText);
      
      if (response.status === 401) {
        // 如果是未授权，重定向到登录页
        window.location.href = '/';
        throw new Error('未登录或会话已过期');
      }
      return response;
    });
}

// 当DOM加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
  console.log('回访管理页面初始化...');
  
  // 检查用户是否已登录
  if (typeof checkAuth === 'function') {
    checkAuth();
  }
  
  // 设置搜索功能
  document.getElementById('search-btn').addEventListener('click', () => {
    const searchInput = document.getElementById('search-input');
    currentSearchTerm = searchInput.value.trim();
    currentPage = 1; // 重置为第一页
    loadVisits();
  });
  
  // 注册搜索框回车事件
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchInput = document.getElementById('search-input');
      currentSearchTerm = searchInput.value.trim();
      currentPage = 1; // 重置为第一页
      loadVisits();
    }
  });
  
  // 设置退出登录按钮
  document.getElementById('logout-button').addEventListener('click', () => {
    if (typeof logout === 'function') {
      logout();
    } else {
      // 备用登出逻辑
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
  });
  
  // 加载回访记录
  loadVisits();
});

// 加载回访记录
function loadVisits() {
  // 显示加载状态
  const tableBody = document.getElementById('visits-list');
  tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center;"><div class="spinner"></div><div>加载回访记录中，请稍候...</div></td></tr>';
  
  // 检查缓存中是否有当前页数据
  if (pageCache[currentPage] && !currentSearchTerm) {
    console.log(`使用缓存的第${currentPage}页数据`);
    visits = pageCache[currentPage].data;
    totalVisits = pageCache[currentPage].pagination.total;
    totalPages = pageCache[currentPage].pagination.totalPages;
    
    // 渲染表格和分页
    renderVisitsTable(visits);
    renderPagination();
    return; // 使用缓存数据，不再请求API
  }
  
  // 根据是否有搜索条件确定API地址
  const apiUrl = currentSearchTerm
    ? `/api/visits?q=${encodeURIComponent(currentSearchTerm)}&page=${currentPage}&pageSize=${pageSize}`
    : `/api/visits?page=${currentPage}&pageSize=${pageSize}`;
  
  console.time('加载回访记录');
  fetchWithAuth(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取回访记录失败');
      }
      return response.json();
    })
    .then(data => {
      console.timeEnd('加载回访记录');
      
      if (!data.success) {
        throw new Error(data.message || '获取回访记录失败');
      }
      
      // 更新全局数据
      visits = data.data;
      totalVisits = data.pagination.total;
      totalPages = data.pagination.totalPages;
      currentPage = data.pagination.currentPage;
      
      // 缓存当前页数据
      if (!currentSearchTerm) {
        pageCache[currentPage] = {
          data: data.data,
          pagination: data.pagination
        };
        
        // 预加载前后页数据
        preloadAdjacentPages(currentPage);
      }
      
      // 渲染表格和分页
      renderVisitsTable(visits);
      renderPagination();
    })
    .catch(error => {
      console.error('加载回访记录失败:', error);
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">加载回访记录失败: ${error.message}</td></tr>`;
    });
}

// 预加载前后几页的数据
function preloadAdjacentPages(currentPage) {
  // 计算需要预加载的页码范围
  const startPage = Math.max(1, currentPage - 1);
  const endPage = Math.min(totalPages, currentPage + 1);
  
  // 逐页预加载
  for (let page = startPage; page <= endPage; page++) {
    // 跳过当前页和已缓存的页
    if (page === currentPage || pageCache[page]) {
      continue;
    }
    
    console.log(`预加载第${page}页数据`);
    fetchWithAuth(`/api/visits?page=${page}&pageSize=${pageSize}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`预加载第${page}页失败`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          console.log(`成功预加载第${page}页数据`);
          
          // 缓存页面数据
          pageCache[page] = {
            data: data.data,
            pagination: data.pagination
          };
          
          // 清理超出范围的缓存
          cleanupCache(currentPage);
        }
      })
      .catch(error => {
        console.error(`预加载第${page}页数据失败:`, error);
      });
  }
}

// 清理超出范围的缓存
function cleanupCache(currentPage) {
  const minPage = Math.max(1, currentPage - CACHE_RANGE);
  const maxPage = Math.min(totalPages, currentPage + CACHE_RANGE);
  
  // 查找缓存中的所有页码
  const cachedPages = Object.keys(pageCache).map(Number);
  
  // 删除范围外的缓存
  cachedPages.forEach(page => {
    if (page < minPage || page > maxPage) {
      console.log(`清理缓存: 删除第${page}页数据`);
      delete pageCache[page];
    }
  });
}

// 渲染回访记录表格
function renderVisitsTable(visitsList) {
  const tableBody = document.getElementById('visits-list');
  tableBody.innerHTML = '';
  
  if (!visitsList || visitsList.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center;">暂无回访记录</td></tr>';
    return;
  }
  
  visitsList.forEach(visit => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${visit.id}</td>
      <td>${visit.customer_name || ''}</td>
      <td>${visit.customer_phone || ''}</td>
      <td>${formatDate(visit.visit_date) || ''}</td>
      <td>${visit.visit_type || ''}</td>
      <td>${visit.visit_purpose || ''}</td>
      <td>${visit.visit_result || ''}</td>
      <td>${visit.notes || ''}</td>
      <td>${formatDateTime(visit.created_at) || ''}</td>
    `;
    
    tableBody.appendChild(row);
  });
}

// 渲染分页控件
function renderPagination() {
  const paginationContainer = document.getElementById('pagination');
  if (!paginationContainer) return;
  
  paginationContainer.innerHTML = '';
  
  if (totalPages <= 1) {
    return; // 只有一页，不显示分页控件
  }
  const paginationEl = document.createElement('div');
  paginationEl.className = 'pagination-container';
  // 首页
  const firstBtn = document.createElement('button');
  firstBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
  firstBtn.textContent = '首页';
  firstBtn.disabled = currentPage === 1;
  firstBtn.addEventListener('click', () => goToPage(1));
  paginationEl.appendChild(firstBtn);
  // 上一页
  const prevBtn = document.createElement('button');
  prevBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
  prevBtn.textContent = '上一页';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
  paginationEl.appendChild(prevBtn);
  // 页码按钮
  const maxPageButtons = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
  if (endPage - startPage + 1 < maxPageButtons && startPage > 1) {
    startPage = Math.max(1, endPage - maxPageButtons + 1);
  }
  if (startPage > 1) {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    paginationEl.appendChild(ellipsis);
  }
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => goToPage(i));
    paginationEl.appendChild(pageBtn);
  }
  if (endPage < totalPages) {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    paginationEl.appendChild(ellipsis);
  }
  // 下一页
  const nextBtn = document.createElement('button');
  nextBtn.className = `pagination-button ${currentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.textContent = '下一页';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
  paginationEl.appendChild(nextBtn);
  // 末页
  const lastBtn = document.createElement('button');
  lastBtn.className = `pagination-button ${currentPage === totalPages ? 'disabled' : ''}`;
  lastBtn.textContent = '末页';
  lastBtn.disabled = currentPage === totalPages;
  lastBtn.addEventListener('click', () => goToPage(totalPages));
  paginationEl.appendChild(lastBtn);
  // 跳转
  const pageJump = document.createElement('div');
  pageJump.className = 'pagination-jump';
  pageJump.innerHTML = `
    <span>跳转到</span>
    <input type="number" min="1" max="${totalPages}" value="${currentPage}" id="page-jump-input">
    <span>页</span>
    <button class="pagination-button" id="page-jump-btn">跳转</button>
  `;
  paginationEl.appendChild(pageJump);
  // 分页信息
  const pageInfo = document.createElement('div');
  pageInfo.className = 'pagination-info';
  pageInfo.textContent = `${currentPage}/${totalPages}页，共${totalVisits}条记录`;
  paginationEl.appendChild(pageInfo);
  // 添加每页条数选择控件
  const pageSizeSelect = document.createElement('select');
  pageSizeSelect.className = 'pagination-size-select';
  pageSizeSelect.style.display = 'inline-block';
  pageSizeSelect.style.width = 'auto';
  pageSizeSelect.style.minWidth = '80px';
  pageSizeSelect.style.padding = '0 16px 0 8px';
  pageSizeSelect.style.marginRight = '8px';
  pageSizeSelect.style.verticalAlign = 'middle';
  pageSizeSelect.style.height = '32px';
  pageSizeSelect.style.fontSize = '14px';
  [10, 20, 50, 100].forEach(size => {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = `${size} 条/页`;
    if (size === pageSize) option.selected = true;
    pageSizeSelect.appendChild(option);
  });
  pageSizeSelect.addEventListener('change', function() {
    pageSize = parseInt(this.value);
    localStorage.setItem('visitsPageSize', pageSize); // 新增：保存到本地存储
    currentPage = 1;
    pageCache = {}; // 新增：切换每页条数时清空缓存，确保数据刷新
    loadVisits();
  });
  paginationEl.insertBefore(pageSizeSelect, paginationEl.firstChild);
  // 保证分页容器为flex布局
  paginationEl.style.display = 'flex';
  paginationEl.style.alignItems = 'center';
  paginationEl.style.gap = '8px';
  paginationContainer.appendChild(paginationEl);
  // 跳转按钮事件
  document.getElementById('page-jump-btn').addEventListener('click', () => {
    const input = document.getElementById('page-jump-input');
    const page = parseInt(input.value);
    if (page && page >= 1 && page <= totalPages) {
      goToPage(page);
    } else {
      showAlert(`请输入1-${totalPages}之间的页码`, 'warning');
      input.value = currentPage;
    }
  });
  document.getElementById('page-jump-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('page-jump-btn').click();
    }
  });
}

// 页面跳转
function goToPage(page) {
  if (page < 1 || page > totalPages || page === currentPage) {
    return;
  }
  
  // 如果跳转距离较远，清空搜索条件，以便能使用缓存机制
  if (Math.abs(page - currentPage) > CACHE_RANGE && currentSearchTerm) {
    currentSearchTerm = '';
    document.getElementById('search-input').value = '';
  }
  
  currentPage = page;
  loadVisits();
}

// 显示全局通知
function showGlobalNotification(message) {
  // 检查是否已存在通知容器
  let notificationContainer = document.getElementById('global-notification-container');
  
  // 如果不存在，创建一个
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'global-notification-container';
    notificationContainer.style.position = 'fixed';
    notificationContainer.style.top = '20px';
    notificationContainer.style.left = '50%';
    notificationContainer.style.transform = 'translateX(-50%)';
    notificationContainer.style.zIndex = '9999';
    document.body.appendChild(notificationContainer);
  }
  
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'global-notification';
  notification.style.backgroundColor = 'white';
  notification.style.border = '1px solid #ddd';
  notification.style.borderRadius = '4px';
  notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  notification.style.padding = '12px 20px';
  notification.style.marginBottom = '10px';
  notification.style.display = 'flex';
  notification.style.alignItems = 'center';
  notification.style.justifyContent = 'space-between';
  
  // 设置通知内容
  notification.innerHTML = `
    <div style="margin-right: 15px;">
      <div style="font-weight: bold; margin-bottom: 5px;">系统通知</div>
      <div>${message}</div>
    </div>
    <button class="ant-btn ant-btn-primary" style="min-width: 60px;">确定</button>
  `;
  
  // 添加到容器
  notificationContainer.appendChild(notification);
  
  // 添加确定按钮事件
  const confirmBtn = notification.querySelector('button');
  confirmBtn.addEventListener('click', () => {
    notification.remove();
  });
  
  // 自动关闭（5秒后）
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
} 