// Global variables
let currentPage = 1;
let totalPages = 1;
let pageSize = parseInt(localStorage.getItem('pointsPageSize')) || 10;
let searchQuery = '';
let currentCustomerId = null;
let isLoading = false;
let allCustomers = []; // 存储所有客户数据用于搜索
let selectedCustomer = null; // 当前选择的客户
let customerAvailablePoints = 0; // 当前选择客户的可用积分
let totalPoints = 0; // 总积分记录数
let pointsCache = {}; // 用于缓存积分数据
let pageCache = {}; // 用于缓存已加载的页面数据
const CACHE_RANGE = 2; // 当前页前后各缓存2页

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
  
  // 合并选项
  const mergedOptions = {
    ...defaultOptions,
    ...options
  };
  
  // 如果没有手动设置headers，确保headers存在
  if (!mergedOptions.headers) {
    mergedOptions.headers = defaultOptions.headers;
  }
  
  // 如果请求体是FormData，不要设置Content-Type，让浏览器自动设置
  if (mergedOptions.body instanceof FormData) {
    // 确保不设置Content-Type，让浏览器自动处理
    if (mergedOptions.headers['Content-Type']) {
      delete mergedOptions.headers['Content-Type'];
    }
  } else if (mergedOptions.body && typeof mergedOptions.body === 'object' && !(mergedOptions.body instanceof Blob) && !(mergedOptions.body instanceof ArrayBuffer)) {
    // 如果请求体是普通对象，设置为JSON
    mergedOptions.headers['Content-Type'] = 'application/json';
    mergedOptions.body = JSON.stringify(mergedOptions.body);
  }
  
  // 确保URL是绝对路径
  const baseUrl = window.location.origin;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  
  console.log('Fetching URL:', fullUrl, 'Method:', options.method || 'GET');
  console.log('Request options:', {
    ...mergedOptions,
    body: mergedOptions.body instanceof FormData ? '[FormData Object]' : 
          (typeof mergedOptions.body === 'string' ? (mergedOptions.body.length > 100 ? mergedOptions.body.substring(0, 100) + '...' : mergedOptions.body) : mergedOptions.body)
  });
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

// DOM Ready event
document.addEventListener('DOMContentLoaded', function() {
    // 初始化模态框
    const pointsModal = setupModal('points-modal', 'create-points-btn', ['.close-modal']);
    const detailModal = setupModal('detail-modal', null, ['.close-modal']);
    
    // Event listeners for buttons and inputs
    document.getElementById('create-points-btn').addEventListener('click', showNewPointModal);
    
    // 搜索框事件监听
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    searchBtn.addEventListener('click', handleSearch);
    
    // 初始化客户搜索输入框
    const customerSearch = document.getElementById('customer_search');
    if(customerSearch) {
        // 限制只能输入数字
        customerSearch.addEventListener('input', function(e) {
            const value = e.target.value;
            // 移除非数字字符
            e.target.value = value.replace(/\D/g, '');
            // 限制长度不超过11位
            if (e.target.value.length > 11) {
                e.target.value = e.target.value.slice(0, 11);
            }
            showCustomerDropdown();
        });
        customerSearch.addEventListener('focus', showCustomerDropdown);
        
        // 修改placeholder提示
        customerSearch.placeholder = '输入客户电话搜索...';
    }
    
    // 点击其他区域时关闭下拉菜单
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.customer-select-container')) {
            document.getElementById('customer_dropdown').classList.remove('active');
        }
    });
    
    // 监听途径选择变化，设置积分输入限制
    document.getElementById('type').addEventListener('change', function(e) {
        handleChannelChange(e.target.value);
    });
    
    // 监听积分输入验证
    document.getElementById('points').addEventListener('input', validatePointsInput);
    
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

    // Initialize the page
    loadPoints();
    // 加载客户列表供选择
    loadCustomersForDropdown();
});

// Get auth token from localStorage
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Load points with pagination and optional search
function loadPoints() {
    console.log('开始加载积分数据');
    isLoading = true;
    document.getElementById('loading-spinner').style.display = 'block';
    document.getElementById('points-table').style.display = 'none';
    
    // 构建基础URL
    let url = `/api/points?page=${currentPage}&limit=${pageSize}`;
    if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    // 如果没有搜索词，尝试加载前后页的数据
    const loadAdjacentPages = !searchQuery;
    
    // 主请求
    fetchWithAuth(url)
    .then(response => {
        if (!response.ok) {
            throw new Error(response.statusText || '获取积分记录失败');
        }
        return response.json();
    })
    .then(data => {
        // 更新主数据
        renderPointsTable(data.data);
        totalPoints = data.pagination.total;
        totalPages = Math.ceil(data.pagination.total / pageSize);
        pageCache[currentPage] = data.data;
        
        // 如果没有搜索词，加载相邻页面
        if (loadAdjacentPages) {
            const adjacentPromises = [];
            
            // 加载前后2页的数据
            for (let i = Math.max(1, currentPage - CACHE_RANGE); i <= Math.min(totalPages, currentPage + CACHE_RANGE); i++) {
                if (i !== currentPage && !pageCache[i]) {
                    const adjacentUrl = `/api/points?page=${i}&limit=${pageSize}`;
                    adjacentPromises.push(
                        fetchWithAuth(adjacentUrl)
                            .then(response => response.json())
                            .then(pageData => {
                                pageCache[i] = pageData.data;
                            })
                            .catch(error => console.error(`加载第${i}页数据失败:`, error))
                    );
                }
            }
            
            // 等待所有相邻页面加载完成
            Promise.all(adjacentPromises)
                .finally(() => {
                    renderPagination();
                    isLoading = false;
                    document.getElementById('loading-spinner').style.display = 'none';
                    document.getElementById('points-table').style.display = 'table';
                });
        } else {
            renderPagination();
            isLoading = false;
            document.getElementById('loading-spinner').style.display = 'none';
            document.getElementById('points-table').style.display = 'table';
        }
    })
    .catch(error => {
        console.error('加载积分数据错误:', error);
        showAlert('加载积分数据失败: ' + error.message, 'error');
        isLoading = false;
        document.getElementById('loading-spinner').style.display = 'none';
    });
}

// 格式化日期为 YYYY-MM-DD
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Render points table
function renderPointsTable(pointsList) {
    console.log('开始渲染积分表格, 记录数:', pointsList ? pointsList.length : 0);
    const tableBody = document.getElementById('points-table-body');
    tableBody.innerHTML = '';
    
    if (!pointsList || pointsList.length === 0) {
        console.log('没有积分记录可显示');
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="9" class="no-data">暂无积分记录</td>`;
        tableBody.appendChild(row);
        return;
    }
    
    // 添加调试信息 - 检查积分记录中的字段
    console.log('积分记录示例:', pointsList[0]);
    if (pointsList.length > 0) {
        let pointsTypes = {};
        let pointsValues = [];
        
        // 检查前10条记录
        const samplesToCheck = Math.min(10, pointsList.length);
        for (let i = 0; i < samplesToCheck; i++) {
            const record = pointsList[i];
            const pointsType = typeof record.points;
            pointsTypes[pointsType] = (pointsTypes[pointsType] || 0) + 1;
            pointsValues.push(record.points);
        }
        
        console.log('积分字段类型统计:', pointsTypes);
        console.log('积分字段值示例:', pointsValues);
    }
    
    pointsList.forEach(point => {
        const row = document.createElement('tr');
        // 修正积分兑换的显示
        const channelDisplay = point.channel === 'redeemed' ? '积分兑换' : translateChannel(point.channel);
        
        // 使用customer_name和phone字段，如果为空则回退到积分记录自身的name和phone字段
        const displayName = point.customer_name || point.name || '-';
        const displayPhone = point.customer_phone || point.phone || '-';
        
        row.innerHTML = `
            <td>${point.id}</td>
            <td>${displayName}</td>
            <td>${displayPhone}</td>
            <td>${point.points}</td>
            <td>${channelDisplay}</td>
            <td>${formatDate(point.date)}</td>
            <td>${point.operator || '-'}</td>
            <td>${point.notes || '-'}</td>
        `;
        tableBody.appendChild(row);
        
        // 简化点击事件逻辑
        if (point.id) {
            row.style.cursor = 'pointer';
            
            // 通用长按检测 - 针对所有设备类型
            let pressTimer = null;
            let isLongPress = false;
            
            // 鼠标/触摸按下
            const handlePressStart = (e) => {
                console.log(`[事件日志] 按下开始 - 积分ID: ${point.id}, 事件类型: ${e.type}, 时间戳: ${new Date().toISOString()}`);
                
                // 重置状态
                isLongPress = false;
                
                // 清除可能存在的计时器
                if (pressTimer !== null) {
                    clearTimeout(pressTimer);
                }
                
                // 设置长按计时器
                pressTimer = setTimeout(() => {
                    console.log(`[事件日志] 检测到长按 - 积分ID: ${point.id}, 时间戳: ${new Date().toISOString()}`);
                    isLongPress = true;
                }, 500);
            };
            
            // 鼠标/触摸释放或取消
            const handlePressEnd = (e) => {
                console.log(`[事件日志] 按下结束 - 积分ID: ${point.id}, 事件类型: ${e.type}, 长按标志: ${isLongPress}, 时间戳: ${new Date().toISOString()}`);
                
                // 清除计时器
                if (pressTimer !== null) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                
                // 在短暂延迟后重置长按状态，确保点击事件的处理能正确使用当前长按状态
                setTimeout(() => {
                    isLongPress = false;
                }, 10);
            };
            
            // 点击事件 - 使用长按标志
            row.addEventListener('click', (e) => {
                console.log(`[事件日志] 点击事件触发 - 积分ID: ${point.id}, 事件类型: ${e.type}, 长按标志: ${isLongPress}, 时间戳: ${new Date().toISOString()}`);
                
                // 如果是长按，阻止打开模态框
                if (isLongPress) {
                    console.log(`[事件日志] 长按被检测到，阻止打开积分详情`);
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                
                // 防止双击或多次点击
                if (e.detail > 1) {
                    console.log(`[事件日志] 忽略多次点击 - detail值: ${e.detail}`);
                    return;
                }
                
                console.log(`[事件日志] 准备显示积分详情 - 通过点击事件`);
                showPointDetail(point.id);
            });
            
            // 注册按下/释放事件 - 鼠标事件
            row.addEventListener('mousedown', handlePressStart);
            row.addEventListener('mouseup', handlePressEnd);
            row.addEventListener('mouseleave', handlePressEnd);
            
            // 注册按下/释放事件 - 触摸事件
            row.addEventListener('touchstart', handlePressStart);
            row.addEventListener('touchend', handlePressEnd);
            row.addEventListener('touchcancel', handlePressEnd);
            
            // 阻止默认的上下文菜单
            row.addEventListener('contextmenu', (e) => {
                console.log(`[事件日志] 上下文菜单事件触发 - 积分ID: ${point.id}, 时间戳: ${new Date().toISOString()}`);
                // 只有当检测到长按时才阻止默认行为，否则允许显示右键菜单
                if (isLongPress) {
                    e.preventDefault();
                    return false;
                }
            });
        }
    });
}

// 将英文渠道翻译为中文
function translateChannel(channel) {
    const channelMap = {
        'earned': '消费积分',
        'redeemed': '积分兑换',
        'adjusted': '积分调整',
        'expired': '积分过期'
    };
    return channelMap[channel] || channel;
}

// Render pagination
function renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;
  
    paginationContainer.innerHTML = '';
  
    if (totalPages <= 1) {
        return; // 只有一页，不显示分页控件
    }
  
    const paginationEl = document.createElement('div');
    paginationEl.className = 'pagination-container';
  
    // 创建"首页"按钮
    const firstBtn = document.createElement('button');
    firstBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
    firstBtn.textContent = '首页';
    firstBtn.disabled = currentPage === 1;
    firstBtn.addEventListener('click', () => goToPage(1));
    paginationEl.appendChild(firstBtn);
  
    // 创建"上一页"按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    paginationEl.appendChild(prevBtn);
  
    // 创建页码按钮
    const maxPageButtons = 7; // 最多显示7个页码按钮
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
  
    // 调整startPage，确保显示足够的页码
    if (endPage - startPage + 1 < maxPageButtons && startPage > 1) {
        startPage = Math.max(1, endPage - maxPageButtons + 1);
    }
  
    // 如果开始页不是1，添加省略号
    if (startPage > 1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        paginationEl.appendChild(ellipsis);
    }
  
    // 添加页码按钮
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => goToPage(i));
        paginationEl.appendChild(pageBtn);
    }
  
    // 如果结束页不是最后一页，添加省略号
    if (endPage < totalPages) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        paginationEl.appendChild(ellipsis);
    }
  
    // 创建"下一页"按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = `pagination-button ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
    paginationEl.appendChild(nextBtn);
  
    // 创建"末页"按钮
    const lastBtn = document.createElement('button');
    lastBtn.className = `pagination-button ${currentPage === totalPages ? 'disabled' : ''}`;
    lastBtn.textContent = '末页';
    lastBtn.disabled = currentPage === totalPages;
    lastBtn.addEventListener('click', () => goToPage(totalPages));
    paginationEl.appendChild(lastBtn);
  
    // 添加页码跳转
    const pageJump = document.createElement('div');
    pageJump.className = 'pagination-jump';
    pageJump.innerHTML = `
        <span>跳转到</span>
        <input type="number" min="1" max="${totalPages}" value="${currentPage}" id="page-jump-input">
        <span>页</span>
        <button class="pagination-button" id="page-jump-btn">跳转</button>
    `;
    paginationEl.appendChild(pageJump);
  
    // 添加分页信息
    const pageInfo = document.createElement('div');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `${currentPage}/${totalPages}页，共${totalPoints || 0}条记录`;
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
      localStorage.setItem('pointsPageSize', pageSize);
      currentPage = 1;
      loadPoints();
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
  
    // 输入框回车事件
    document.getElementById('page-jump-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('page-jump-btn').click();
        }
    });
}

// 跳转到指定页
function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage || isLoading) {
        return;
    }
    currentPage = page;
    loadPoints();
}

// Search handling
function handleSearch() {
    const searchInput = document.getElementById('search-input');
    const newSearchQuery = searchInput.value.trim();
    
    // 清除页面缓存
    pageCache = {};
    searchQuery = newSearchQuery;
    currentPage = 1;
    loadPoints();
}

// 加载客户数据供选择
function loadCustomersForDropdown() {
  console.log('开始加载客户下拉列表数据');
  fetchWithAuth('/api/points/util/customers')
    .then(response => {
      console.log('响应状态:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error('Failed to load customers');
      }
      return response.json();
    })
    .then(data => {
      console.log('API返回数据:', data);
      
      // 检查数据格式是否正确
      if (!data) {
        console.warn('无效的客户数据格式:', data);
        allCustomers = [];
      } else {
        // 处理两种可能的返回格式: data.data数组或直接返回数组
        const customersData = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        allCustomers = customersData;
        
        // 验证数据格式
        if (allCustomers.length > 0 && (!allCustomers[0].id || !allCustomers[0].name || !allCustomers[0].phone)) {
          console.warn('客户数据缺少必要字段:', allCustomers[0]);
          allCustomers = [];
        }
      }
      console.log('成功加载客户数据:', allCustomers.length);
    })
    .catch(error => {
      console.error('加载客户数据错误:', error);
      allCustomers = []; // 出错时重置为空数组
      showAlert('加载客户数据失败: ' + error.message, 'error');
    });
}
// 显示客户下拉菜单（重构版）
function showCustomerDropdown() {
    const searchInput = document.getElementById('customer_search');
    const searchTerm = searchInput.value.trim();
    const dropdown = document.getElementById('customer_dropdown');
    dropdown.innerHTML = '';

    // 如果输入的不是数字，显示提示
    if (searchTerm && !/^\d+$/.test(searchTerm)) {
        dropdown.innerHTML = '<div class="customer-item">请输入电话号码...</div>';
        dropdown.classList.add('active');
        return;
    }

    // 输入少于4个数字时提示
    if (searchTerm.length < 4) {
        dropdown.innerHTML = '<div class="customer-item">输入电话前4位开始搜索...</div>';
        dropdown.classList.add('active');
        return;
    }

    // 检查电话号码格式
    if (searchTerm.length > 11) {
        dropdown.innerHTML = '<div class="customer-item">电话号码格式错误...</div>';
        dropdown.classList.add('active');
        return;
    }

    // 只在输入4个及以上数字时才发起搜索
    fetch(`/api/customers/search?q=${encodeURIComponent(searchTerm)}`)
        .then(res => res.json())
        .then(data => {
            let customers = (data && data.data) ? data.data : [];
            
            // 只匹配电话号码前缀
            customers = customers.filter(c => c.phone && c.phone.startsWith(searchTerm));
            
            if (customers.length === 0) {
                dropdown.innerHTML = '<div class="customer-item">未搜索到客户...</div>';
            } else {
                customers.forEach(customer => {
                    const item = document.createElement('div');
                    item.className = 'customer-item';
                    item.textContent = `${customer.name} (${customer.phone})`;
                    item.dataset.id = customer.id;
                    item.dataset.name = customer.name;
                    item.dataset.phone = customer.phone;
                    item.addEventListener('click', function() {
                        selectCustomer(customer);
                        dropdown.classList.remove('active');
                    });
                    dropdown.appendChild(item);
                });
            }
            dropdown.classList.add('active');
        })
        .catch(() => {
            dropdown.innerHTML = '<div class="customer-item">搜索失败</div>';
            dropdown.classList.add('active');
        });
}

// 选择客户
function selectCustomer(customer) {
    selectedCustomer = customer;
    
    // 更新隐藏输入和显示信息
    document.getElementById('customer_id').value = customer.id;
    document.getElementById('customer_search').value = '';
    
    const selectedInfo = document.getElementById('customer_selected');
    selectedInfo.innerHTML = `
        <div class="selected-customer">
            <strong>${customer.name}</strong> (${customer.phone})
            <button type="button" class="remove-customer-btn">&times;</button>
        </div>
    `;
    selectedInfo.style.display = 'block'; // 确保显示选中的客户信息
    
    // 添加移除客户按钮事件
    selectedInfo.querySelector('.remove-customer-btn').addEventListener('click', function() {
        selectedCustomer = null;
        document.getElementById('customer_id').value = '';
        selectedInfo.innerHTML = '';
        selectedInfo.style.display = 'none'; // 隐藏选中区域
        document.getElementById('customer_points_info').style.display = 'none';
    });
    
    // 获取客户的积分信息
    fetchCustomerPoints(customer.id);
}

// 获取客户积分信息
function fetchCustomerPoints(customerId) {
    fetchWithAuth(`/api/points/util/customer/${customerId}/points`)
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load customer points');
        }
        return response.json();
    })
    .then(data => {
        // 更新可用积分
        customerAvailablePoints = data.availablePoints || 0;
        document.getElementById('available_points').textContent = customerAvailablePoints;
        document.getElementById('customer_points_info').style.display = 'block';
        
        // 更新验证逻辑
        handleChannelChange(document.getElementById('type').value);
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('customer_points_info').style.display = 'none';
    });
}

// 验证积分输入
function validatePointsInput() {
    const pointsInput = document.getElementById('points');
    const value = parseInt(pointsInput.value);
    const channel = document.getElementById('type').value;
    
    // 基本验证：必须是整数
    if (isNaN(value) || value === 0) {
        pointsInput.setCustomValidity('积分不能为0');
        return false;
    }
    
    // 积分兑换时应为负数
    if (channel === 'redeemed' && value > 0) {
        // 提示用户，但不阻止提交
        document.getElementById('points-form-alert').innerHTML = 
            '<div class="alert alert-warning">积分兑换时建议输入负数，表示消费的积分数量</div>';
    } else {
        document.getElementById('points-form-alert').innerHTML = '';
    }
    
    // 检查积分兑换是否超过可用积分
    if (channel === 'redeemed' && Math.abs(value) > customerAvailablePoints) {
        pointsInput.setCustomValidity(`兑换积分不能超过可用积分 (${customerAvailablePoints})`);
        return false;
    }
    
    // 验证通过
    pointsInput.setCustomValidity('');
    return true;
}

// 处理渠道变化
function handleChannelChange(channel) {
    const pointsInput = document.getElementById('points');
    
    if (channel === 'redeemed') {
    
        pointsInput.max = '';  // 移除最大值限制，允许输入负数
        
        // 显示可用积分信息
        document.getElementById('customer_points_info').style.display = selectedCustomer ? 'block' : 'none';
    } else {
        // 清除提示
        document.getElementById('points-form-alert').innerHTML = '';
        pointsInput.removeAttribute('max');
    }
    
    // 验证当前输入
    validatePointsInput();
}

// 显示积分详情
function showPointDetail(pointId) {
    fetchWithAuth(`/api/points/${pointId}`)
    .then(response => {
        if (!response.ok) {
            throw new Error('获取积分详情失败');
        }
        return response.json();
    })
    .then(data => {
        // 确保从服务器返回的数据格式正确
        if (data.success && data.data) {
            displayPointDetail(data.data);
            const modal = document.getElementById('detail-modal');
            modal.style.display = 'block';
            modal.classList.add('ant-modal-open');
            
            // 为删除按钮添加事件监听
            const deleteBtn = document.getElementById('delete-point-btn');
            if (deleteBtn) {
                console.log(`为ID ${pointId} 的积分记录绑定删除按钮事件`);
                // 移除旧的事件监听器
                const newDeleteBtn = deleteBtn.cloneNode(true);
                deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
                
                // 添加新的事件监听器
                newDeleteBtn.addEventListener('click', async (event) => {
                    event.stopPropagation(); // 阻止事件冒泡
                    console.log(`点击了删除按钮，积分ID: ${pointId}`);
                    const confirmed = await showConfirm({
                        title: '删除确认',
                        content: '确定要删除这条积分记录吗？此操作不可恢复！',
                        type: 'danger'
                    });
                    
                    if (confirmed) {
                        console.log(`确认删除积分记录，ID: ${pointId}`);
                        deletePoint(pointId);
                        // 关闭模态框
                        modal.style.display = 'none';
                        modal.classList.remove('ant-modal-open');
                    }
                });
            }
        } else {
            throw new Error('积分数据格式错误');
        }
    })
    .catch(error => {
        console.error('错误:', error);
        showAlert('获取积分详情失败: ' + error.message, 'error');
    });
}

// 显示积分详情内容
function displayPointDetail(point) {
    console.log('积分详情数据:', point); // 调试用，可以查看返回的数据结构
    
    const modalBody = document.querySelector('#detail-modal .modal-body');
    
    // 构建积分详情的HTML内容
    const html = `
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <!-- 客户信息 - 第一列 -->
            <div style="flex: 1; min-width: 200px;">
                <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">客户信息</h4>
                <p><strong>姓名:</strong> ${point.name || point.customer_name || '-'}</p>
                <p><strong>电话:</strong> ${point.phone || point.customer_phone || '-'}</p>
            </div>
            
            <!-- 积分信息 - 第二列 -->
            <div style="flex: 1; min-width: 200px;">
                <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">积分信息</h4>
                <p><strong>途径:</strong> ${translateChannel(point.channel) || '-'}</p>
                <p><strong>积分:</strong> ${point.points || '0'}</p>
                <p><strong>日期:</strong> ${formatDate(point.date) || '-'}</p>
                <p><strong>操作员:</strong> ${point.operator || '-'}</p>
            </div>
        </div>
        
        <!-- 备注信息 - 独占一行 -->
        <div style="width: 100%;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">备注</h4>
            <p>${point.notes || '无'}</p>
        </div>
    `;
    
    // 更新模态框内容
    modalBody.innerHTML = html;
}

// 显示新建积分模态框
function showNewPointModal() {
    // 重置表单
    document.getElementById('points-form').reset();
    document.getElementById('customer_selected').innerHTML = '';
    document.getElementById('customer_selected').style.display = 'none'; // 确保客户选择区域被隐藏
    document.getElementById('customer_points_info').style.display = 'none';
    document.getElementById('points-form-alert').innerHTML = '';
    
    // 设置当前日期
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('date').value = `${year}-${month}-${day}`;
    
    // 重置客户选择
    selectedCustomer = null;
    customerAvailablePoints = 0;
    document.getElementById('customer_id').value = '';
    document.getElementById('customer_search').value = ''; // 确保搜索框也被清空
    
    // 显示模态框
    document.getElementById('points-modal').style.display = 'block';
    
    // 确保默认设置为积分兑换
    document.getElementById('type').value = 'redeemed';
    
    // 提示用户输入负数，表示使用积分
    document.getElementById('points-form-alert');
    
    // 绑定表单提交事件
    document.getElementById('points-form').onsubmit = function(e) {
        e.preventDefault();
        savePoint();
    };
    
    // 因为类型已固定为兑换，直接设置验证逻辑
    handleChannelChange('redeemed');
}

// 保存积分记录
function savePoint() {
    // 验证表单
    const form = document.getElementById('points-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // 检查客户选择
    if (!selectedCustomer) {
        showFormAlert('请选择客户', 'error');
        return;
    }
    
    // 验证积分输入
    if (!validatePointsInput()) {
        form.reportValidity();
        return;
    }
    
    const pointsValue = parseInt(document.getElementById('points').value);
    const channel = document.getElementById('type').value;
    
    // 检查积分兑换是否超过可用积分
    if (channel === 'redeemed' && Math.abs(pointsValue) > customerAvailablePoints) {
        showFormAlert(`兑换积分不能超过可用积分 (${customerAvailablePoints})`, 'error');
        return;
    }
    
    // 准备数据
    const formData = {
        customer_id: document.getElementById('customer_id').value,
        channel: channel,
        points: pointsValue,
        date: document.getElementById('date').value,
        operator: document.getElementById('operator').value,
        notes: document.getElementById('description').value
    };
    
    // 发送请求
    fetchWithAuth('/api/points', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (!response.ok) {
            throw response;
        }
        return response.json();
    })
    .then(data => {
        // 关闭模态框
        document.getElementById('points-modal').style.display = 'none';
        
        // 刷新列表
        loadPoints();
        
        // 显示全局通知
        showGlobalNotification('积分记录创建成功');
    })
    .catch(async error => {
        console.error('Error:', error);
        
        try {
            const errorData = await error.json();
            showFormAlert(errorData.message || '保存失败', 'error');
        } catch (e) {
            showFormAlert('保存失败: ' + error.statusText, 'error');
        }
    });
}

// 添加全局通知函数
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
            <div style="font-weight: bold; margin-bottom: 5px;">localhost:3001 提示</div>
            <div>${message}</div>
        </div>
        <button class="btn btn-primary" style="min-width: 60px;">确定</button>
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

// 删除积分记录
function deletePoint(pointId) {
    fetchWithAuth(`/api/points/${pointId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete point');
        }
        return response.json();
    })
    .then(data => {
        // 刷新列表
        loadPoints();
        
        // 显示系统级通知
        showGlobalNotification('积分记录删除成功');
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('删除失败: ' + error.message, 'error');
    });
}

// 帮助函数：显示表单内错误
function showFormAlert(message, type, containerId = 'points-form-alert') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const backgroundColor = type === 'error' ? '#f8d7da' : '#d4edda';
    const textColor = type === 'error' ? '#721c24' : '#155724';
    const borderColor = type === 'error' ? '#f5c6cb' : '#c3e6cb';
    
    container.innerHTML = `<div style="color: ${textColor}; background-color: ${backgroundColor}; padding: 10px; border-radius: 4px; border: 1px solid ${borderColor};">${message}</div>`;
    
    // 5秒后自动隐藏
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

// 帮助函数：显示主页面警告
function showAlert(message, type) {
    const container = document.getElementById('main-alert');
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    
    // 5秒后自动隐藏
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

// 重置积分模态框的函数
function resetPointsModal() {
    // 重置客户选择相关数据
    selectedCustomer = null;
    customerAvailablePoints = 0;
    document.getElementById('customer_id').value = '';
    document.getElementById('customer_search').value = '';
    document.getElementById('customer_selected').innerHTML = '';
    document.getElementById('customer_selected').style.display = 'none';
    document.getElementById('customer_points_info').style.display = 'none';
    document.getElementById('available_points').textContent = '0';
    document.getElementById('points-form-alert').innerHTML = '';
}