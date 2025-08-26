// 全局变量
let customers = []; // 初始化为空数组
let currentCustomerId = null;
let isEditing = false;
let currentPage = 1;
let pageSize = parseInt(localStorage.getItem('customersPageSize')) || 10; // 优先读取本地存储
let totalPages = 1;
let totalCustomers = 0;
// 排序相关变量
let currentSortField = 'last_visit'; // 默认排序字段为最近回访
let currentSortOrder = 'desc'; // 默认降序
let currentEmployee = '';

// 表格字段配置
const ALL_COLUMNS = [
  { id: 'id', name: 'ID', visible: true },
  { id: 'name', name: '姓名', visible: true },
  { id: 'phone', name: '电话', visible: true },
  { id: 'photo', name: '照片', visible: true },
  { id: 'age', name: '年龄', visible: true },
  { id: 'height', name: '身高', visible: true },
  { id: 'upper_size', name: '上衣码数', visible: true },
  { id: 'lower_size', name: '下衣码数', visible: true },
  { id: 'body_type', name: '体型', visible: true },
  { id: 'features', name: '特征', visible: true },
  { id: 'reception', name: '接待', visible: true },
  { id: 'personality', name: '性格', visible: true },
  { id: 'preferred_colors', name: '偏爱色系', visible: true },
  { id: 'preferred_styles', name: '偏爱风格', visible: true },
  { id: 'accompaniment', name: '陪同', visible: true },
  { id: 'department', name: '归属部门', visible: true },
  { id: 'employee', name: '归属员工', visible: true },
  { id: 'registration_date', name: '建档日期', visible: true },
  { id: 'total_consumption', name: '消费金额', visible: true },
  { id: 'consumption_count', name: '消费数量', visible: true },
  { id: 'consumption_times', name: '消费次数', visible: true },
  { id: 'total_points', name: '累计积分', visible: true },
  { id: 'available_points', name: '可用积分', visible: true },
  { id: 'last_consumption', name: '最近消费', visible: true },
  { id: 'last_visit', name: '最近回访', visible: true },
  { id: 'actions', name: '操作', visible: true },
];
let columnSettings = [...ALL_COLUMNS]; // 当前列设置的副本

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
  
  // 如果是FormData，需要删除Content-Type，让浏览器自动设置
  if (options.body instanceof FormData) {
    delete mergedOptions.headers['Content-Type'];
    console.log('检测到FormData，已删除Content-Type头');
  }
  
  // 确保URL是绝对路径
  const baseUrl = window.location.origin;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  
  console.log('Fetching URL:', fullUrl);
  console.log('Request options:', {
    ...mergedOptions,
    body: mergedOptions.body instanceof FormData ? '[FormData Object]' : mergedOptions.body
  });
  
  // 执行请求
  return fetch(fullUrl, mergedOptions)
    .then(response => {
      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
      
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
  console.log('客户页面初始化...');
  
  // 设置模态框
  const customerModal = setupModal('customer-modal', 'create-customer-btn', ['.modal-close', '#cancel-customer-btn']);
  const customerDetailModal = setupModal('customer-detail-modal', null, ['.modal-close', '#close-detail-btn']);
  
  // 设置字段显示/隐藏模态框
  const columnsModal = setupModal('columns-modal', 'toggle-columns-btn', ['.modal-close']);
  
  // 设置回访记录模态框
  const visitModal = setupModal('visit-modal', null, ['.modal-close', '#cancel-visit-btn']);
  
  console.log('回访模态框设置完成:', visitModal);
  
  // 加载保存的列设置
  loadColumnSettings();
  
  // 立即应用列设置以确保表头正确显示
  updateTableHeader();
  
  // 初始化字段显示/隐藏设置
  initColumnToggleSettings();
  
  // 初始化编辑按钮事件
  initEditButton();
  
  // 获取客户列表
  loadCustomers();
  
  // 设置搜索功能
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });
  
  // 设置客户表单提交
  document.getElementById('save-customer-btn').addEventListener('click', saveCustomer);
  
  // 设置删除客户按钮
  document.getElementById('delete-customer-btn').addEventListener('click', deleteCustomer);
  
  // 设置照片预览
  document.getElementById('customer-photo').addEventListener('change', previewPhoto);
  
  // 设置字段显示/隐藏功能
  document.getElementById('apply-columns-btn').addEventListener('click', applyColumnSettings);
  document.getElementById('reset-columns-btn').addEventListener('click', resetColumnSettings);
  
  // 设置回访记录保存功能
  document.getElementById('save-visit-btn').addEventListener('click', saveVisit);
  
  // 设置回访记录取消功能
  document.getElementById('cancel-visit-btn').addEventListener('click', function() {
    console.log('点击了取消回访按钮');
    const modal = document.getElementById('visit-modal');
    modal.setAttribute('style', 'display: none !important');
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
  
  // 设置导出按钮点击事件
  document.getElementById('export-customers-btn').addEventListener('click', exportCustomers);
  
  // 设置修复数据按钮点击事件
  const fixBtn = document.getElementById('fix-consumption-btn');
  if (fixBtn) {
    fixBtn.addEventListener('click', function() {
      if (confirm('确定要修复所有客户的最近消费数据吗？这可能需要一些时间。')) {
        this.textContent = '修复中...';
        this.disabled = true;
        
        fetchWithAuth('/api/customers/recalculate-consumption', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: '{}'
        })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            alert(`✅ 修复完成！\n处理了 ${d.data.total} 个客户`);
            loadCustomers(); // 刷新列表
          } else {
            alert('❌ 修复失败: ' + d.message);
          }
        })
        .catch(e => {
          alert('❌ 网络错误，请稍后重试');
          console.error(e);
        })
        .finally(() => {
          this.textContent = '修复数据';
          this.disabled = false;
        });
      }
    });
  }
  
  // 全局事件委托 - 处理表格中的"新增回访"按钮
  document.addEventListener('click', function(e) {
    console.log('捕获到点击事件，目标元素:', e.target);
    
    // 检查点击目标是否在任何已打开的模态框内部
    const openModals = document.querySelectorAll('.modal[style*="display: block"]');
    for (const modal of openModals) {
      if (modal.contains(e.target)) {
        // 如果点击在已打开的模态框内部，则不执行全局点击逻辑
        console.log('点击在模态框内部，阻止全局点击逻辑');
        return;
      }
    }
    
    if (e.target && (e.target.classList.contains('add-visit-btn') || e.target.closest('.add-visit-btn'))) {
      console.log('点击了新增回访按钮');
      e.preventDefault(); // 阻止默认行为
      e.stopPropagation(); // 阻止事件冒泡
      
      // 获取目标元素 - 可能是按钮本身或其内部元素
      const button = e.target.classList.contains('add-visit-btn') ? e.target : e.target.closest('.add-visit-btn');
      
      const customerId = button.getAttribute('data-customer-id');
      const customerName = button.getAttribute('data-customer-name');
      const customerPhone = button.getAttribute('data-customer-phone');
      
      console.log('准备打开回访模态框，客户ID:', customerId);
      openVisitModal(customerId, customerName, customerPhone);
      
      return false; // 确保阻止默认行为
    }
  });
  
  // 设置模态框关闭按钮
  const closeButtons = document.querySelectorAll('#visit-modal .modal-close');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      console.log('点击了模态框关闭按钮');
      const modal = document.getElementById('visit-modal');
      modal.setAttribute('style', 'display: none !important');
    });
  });
  
  // 添加接待选择变化事件监听
  const receptionSelect = document.getElementById('customer-reception');
  if (receptionSelect) {
    receptionSelect.addEventListener('change', function() {
      const personalityInput = document.getElementById('customer-personality');
      personalityInput.value = this.value; // 自动填充性格字段
    });
  }
  
  initCustomSelects();
  
  // 添加新建客户按钮的点击事件
  document.getElementById('create-customer-btn').addEventListener('click', () => {
    resetCustomerForm();
    document.getElementById('modal-title').textContent = '新建客户';
    document.getElementById('customer-modal').style.display = 'block';
  });
  
  // 归属员工下拉框联动
  const employeeSelect = document.getElementById('employee-select');
  const employeeOtherInput = document.getElementById('employee-other-input');
  if (employeeSelect && employeeOtherInput) {
    employeeSelect.addEventListener('change', function() {
      if (this.value === '其他') {
        employeeOtherInput.style.display = '';
      } else {
        employeeOtherInput.style.display = 'none';
        employeeOtherInput.value = '';
      }
    });
  }
});

// 初始化编辑按钮事件
function initEditButton() {
  console.log('初始化编辑按钮事件...');
  const editButton = document.getElementById('edit-customer-btn');
  
  if (editButton) {
    editButton.addEventListener('click', () => {
      console.log('编辑按钮被点击，客户ID:', currentCustomerId);
      
      // 隐藏详情模态框
      const detailModal = document.getElementById('customer-detail-modal');
      detailModal.classList.remove('ant-modal-open');
      detailModal.style.display = 'none';
      
      // 显示编辑模态框
      isEditing = true;
      document.getElementById('modal-title').textContent = '编辑客户';
      loadCustomerToForm(currentCustomerId);
      
      const customerModal = document.getElementById('customer-modal');
      customerModal.classList.add('ant-modal-open');
      customerModal.style.display = 'block';
    });
    console.log('编辑按钮事件绑定成功');
  } else {
    console.error('未找到编辑按钮元素!');
  }
}

// 加载客户列表
let allCustomersLoaded = false;

function loadCustomers(page = currentPage, refreshCache = false, loadAll = false) {
  // 如果没有排序字段，强制用默认
  if (!currentSortField) currentSortField = 'last_visit';
  if (!currentSortOrder) currentSortOrder = 'desc';
  // 修正：如果currentSortField为id，强制currentSortOrder为desc
  if (currentSortField === 'id') currentSortOrder = 'desc';
  
  console.log('加载客户列表，页码:', page, '加载全部:', loadAll);
  
  // 显示加载状态
  const tableBody = document.getElementById('customers-list');
  tableBody.innerHTML = '<tr><td colspan="20" style="text-align: center;"><div class="spinner"></div><div>加载客户数据中，请稍候...</div></td></tr>';
  
  // 构建查询参数
  const searchTerm = document.getElementById('search-input').value.trim();
  
  let queryParams = loadAll ? '' : `page=${page}&pageSize=${pageSize}`;
  
  // 添加搜索条件
  if (searchTerm) {
    queryParams += `&q=${encodeURIComponent(searchTerm)}`;
  }
  
  // 添加排序条件
  if (currentSortField === 'id') {
    queryParams += `&sort=id&order=desc`;
  } else if (currentSortField && currentSortOrder) {
    queryParams += `&sort=${currentSortField}&order=${currentSortOrder}`;
  }
  
  // 添加时间戳参数，防止浏览器缓存
  queryParams += `&_t=${new Date().getTime()}`;
  
  // 发送请求
  const url = `/api/customers${queryParams ? '?' + queryParams : ''}`;
  
  console.log('请求URL:', url);
  
  fetchWithAuth(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取客户列表失败');
      }
      return response.json();
    })
    .then(data => {
      console.log('获取客户列表成功:', data);
      
      if (!data.success) {
        throw new Error(data.message || '获取客户列表失败');
      }
      
      // 更新客户数据
      customers = data.data;
      
      // 如果分页信息存在
      if (data.pagination) {
        totalCustomers = data.pagination.total;
        totalPages = data.pagination.totalPages;
      }
      
      // 更新当前页码
      currentPage = page;
      
      // 渲染客户表格
      renderCustomerTable(customers);
      
      // 渲染分页控件
      renderPagination();
    })
    .catch(error => {
      console.error('获取客户列表失败:', error);
      
      tableBody.innerHTML = `<tr><td colspan="20" style="text-align: center; color: red;">获取客户列表失败: ${error.message || '服务器错误'}</td></tr>`;
    });
}

// 渲染客户表格
function renderCustomerTable(customerList) {
  const tableBody = document.getElementById('customers-list');
  tableBody.innerHTML = '';
  
  if (!customerList || customerList.length === 0) {
    // 获取可见列的数量
    const visibleColumnsCount = columnSettings.filter(col => col.visible).length;
    
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${visibleColumnsCount}" style="text-align: center;">暂无客户数据</td>`;
    tableBody.appendChild(row);
    return;
  }
  
  // 添加调试信息 - 检查客户数据字段
  console.log('客户数据示例:', customerList[0]);
  console.log('当前页码:', currentPage);
  
  if (customerList.length > 0) {
    let consumptionTypes = {};
    let consumptionValues = [];
    
    // 检查前10条记录
    const samplesToCheck = Math.min(10, customerList.length);
    for (let i = 0; i < samplesToCheck; i++) {
      const record = customerList[i];
      const consumptionType = typeof record.total_consumption;
      consumptionTypes[consumptionType] = (consumptionTypes[consumptionType] || 0) + 1;
      consumptionValues.push(record.total_consumption);
    }
    
    console.log('消费金额字段类型统计:', consumptionTypes);
    console.log('消费金额字段值示例:', consumptionValues);
  }
  
  // 直接使用传入的customerList数据
  console.log(`准备渲染 ${customerList.length} 条客户记录`);
  
  customerList.forEach(customer => {
    const row = document.createElement('tr');
    
    // 根据列设置动态构建行内容
    let cellsHTML = '';
    
    // 仅渲染可见的列
    columnSettings.filter(column => column.visible).forEach(column => {
      switch (column.id) {
        case 'id':
          cellsHTML += `<td>${customer.id}</td>`;
          break;
        case 'name':
          cellsHTML += `<td>${customer.name || ''}</td>`;
          break;
        case 'phone':
          cellsHTML += `<td>${customer.phone || ''}</td>`;
          break;
        case 'photo':
          cellsHTML += `<td>${customer.photo ? `<img src="/api/customers/${customer.id}/photo?_t=${new Date().getTime()}" class="thumbnail" alt="客户照片" loading="lazy">` : ''}</td>`;
          break;
        case 'age':
          cellsHTML += `<td>${customer.age || ''}</td>`;
          break;
        case 'height':
          cellsHTML += `<td>${customer.height || ''}</td>`;
          break;
        case 'upper_size':
          cellsHTML += `<td>${customer.upper_size || ''}</td>`;
          break;
        case 'lower_size':
          cellsHTML += `<td>${customer.lower_size || ''}</td>`;
          break;
        case 'body_type':
          cellsHTML += `<td>${customer.body_type || ''}</td>`;
          break;
        case 'features':
          cellsHTML += `<td>${customer.features || ''}</td>`;
          break;
        case 'reception':
          cellsHTML += `<td>${customer.reception || ''}</td>`;
          break;
        case 'personality':
          cellsHTML += `<td>${customer.personality || ''}</td>`;
          break;
        case 'preferred_colors':
          cellsHTML += `<td>${customer.preferred_colors || ''}</td>`;
          break;
        case 'preferred_styles':
          cellsHTML += `<td>${customer.preferred_styles || ''}</td>`;
          break;
        case 'accompaniment':
          cellsHTML += `<td>${customer.accompaniment || ''}</td>`;
          break;
        case 'department':
          cellsHTML += `<td>${customer.department || ''}</td>`;
          break;
        case 'employee':
          cellsHTML += `<td>${customer.employee || ''}</td>`;
          break;
        case 'registration_date':
          cellsHTML += `<td>${formatDate(customer.registration_date) || ''}</td>`;
          break;
        case 'total_consumption':
          cellsHTML += `<td>${formatCurrency(customer.total_consumption)}</td>`;
          break;
        case 'consumption_count':
          cellsHTML += `<td>${customer.consumption_count || 0}</td>`;
          break;
        case 'consumption_times':
          cellsHTML += `<td>${customer.consumption_times || 0}</td>`;
          break;
        case 'total_points':
          cellsHTML += `<td>${customer.total_points || 0}</td>`;
          break;
        case 'available_points':
          cellsHTML += `<td>${customer.available_points || 0}</td>`;
          break;
        case 'last_consumption':
          cellsHTML += `<td>${formatDate(customer.last_consumption) || ''}</td>`;
          break;
        case 'last_visit':
          // 使用created_at字段获取最近回访时间，并以日期时间格式显示
          cellsHTML += `<td>${formatDateTime(customer.last_visit) || ''}</td>`;
          break;
        case 'actions':
          cellsHTML += `<td>
            <button onclick="openVisitForCustomer('${customer.id}', '${customer.name || ''}', '${customer.phone || ''}')" class="ant-btn ant-btn-link add-visit-btn" style="color: #1890ff; background: transparent; border: none; cursor: pointer; padding: 0; text-decoration: underline;">新增回访</button>
          </td>`;
          break;
        default:
          cellsHTML += `<td></td>`;
      }
    });
    
    row.innerHTML = cellsHTML;
    
    // 添加点击事件
    if (customer.id) {
      row.style.cursor = 'pointer';
      
      // 通用长按检测 - 针对所有设备类型
      let pressTimer = null;
      let isLongPress = false;
      
      // 鼠标/触摸按下
      const handlePressStart = (e) => {
        // 重置状态
        isLongPress = false;
        
        // 清除可能存在的计时器
        if (pressTimer !== null) {
          clearTimeout(pressTimer);
        }
        
        // 设置长按计时器
        pressTimer = setTimeout(() => {
          isLongPress = true;
        }, 500);
      };
      
      // 鼠标/触摸释放或取消
      const handlePressEnd = (e) => {
        // 清除计时器
        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      
      // 点击事件 - 使用长按标志
      row.addEventListener('click', (e) => {
        // 如果是长按，阻止打开模态框
        if (isLongPress) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // 如果点击的是"新增回访"按钮或链接，不要打开客户详情
        if (e.target && (e.target.classList.contains('add-visit-btn') || e.target.tagName === 'BUTTON' && e.target.textContent.includes('新增回访'))) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // 防止双击或多次点击
        if (e.detail > 1) {
          return;
        }
        
        e.stopPropagation();
        showCustomerDetail(customer.id);
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
        // 只有当检测到长按时才阻止默认行为，否则允许显示右键菜单
        if (isLongPress) {
          e.preventDefault();
          return false;
        }
      });
    }
    
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
    pageBtn.addEventListener('click', () => {
      const employeeSelect = document.getElementById('employee-select');
      const employeeOtherInput = document.getElementById('employee-other-input');
      let employee = '';
      if (employeeSelect) {
        if (employeeSelect.value === '其他') {
          employee = employeeOtherInput.value.trim();
        } else {
          employee = employeeSelect.value;
        }
      }
      if (employee) {
        handleSearch(i);
      } else {
        goToPage(i);
      }
    });
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
  pageInfo.textContent = `${currentPage}/${totalPages}页，共${totalCustomers}条记录`;
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
    localStorage.setItem('customersPageSize', pageSize); // 新增：保存到本地存储
    currentPage = 1;
    // 判断当前是否有归属员工筛选，优先用handleSearch
    const employeeSelect = document.getElementById('employee-select');
    const employeeOtherInput = document.getElementById('employee-other-input');
    let employee = '';
    if (employeeSelect) {
      if (employeeSelect.value === '其他') {
        employee = employeeOtherInput.value.trim();
      } else {
        employee = employeeSelect.value;
      }
    }
    if (employee) {
      handleSearch(1);
    } else {
      loadCustomers(1);
    }
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
      const employeeSelect = document.getElementById('employee-select');
      const employeeOtherInput = document.getElementById('employee-other-input');
      let employee = '';
      if (employeeSelect) {
        if (employeeSelect.value === '其他') {
          employee = employeeOtherInput.value.trim();
        } else {
          employee = employeeSelect.value;
        }
      }
      if (employee) {
        handleSearch(page);
      } else {
        goToPage(page);
      }
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
  if (page < 1 || page > totalPages || page === currentPage) {
    return;
  }
  
  console.log(`尝试跳转到第${page}页，当前页：${currentPage}`);
  
  // 更新当前页码
  currentPage = page;
  
  // 加载目标页面数据
  loadCustomers(page);
}

// 显示客户详情
function showCustomerDetail(customerId) {
  console.log(`[客户详情日志] 显示客户详情, ID: ${customerId}`);
  currentCustomerId = customerId;
  
  // 显示详情模态框
  const modal = document.getElementById('customer-detail-modal');
  if (!modal) {
    console.error('[客户详情日志] 找不到客户详情模态框元素');
    return;
  }
  console.log('[客户详情日志] 显示模态框');
  modal.style.display = 'block';
  modal.classList.add('ant-modal-open');
  
  // 初始化页面结构
  initializeCustomerDetailPages();
  
  // 获取并绑定删除按钮事件
  const deleteBtn = document.getElementById('delete-customer-btn');
  if (deleteBtn) {
    console.log(`[客户详情日志] 为ID ${customerId} 的客户绑定删除按钮事件`);
    // 移除旧的事件监听器（通过克隆再替换）
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    
    // 添加新的事件监听器
    newDeleteBtn.addEventListener('click', async (event) => {
      event.stopPropagation(); // 阻止事件冒泡
      console.log(`[客户详情日志] 删除按钮被点击，客户ID: ${customerId}`);
      const confirmed = await showConfirm({
        title: '删除确认',
        content: '确定要删除该客户吗？此操作将同时删除该客户的所有销售记录和积分记录，且不可恢复！',
        type: 'danger'
      });
      
      if (confirmed) {
        console.log(`[客户详情日志] 确认删除，调用 deleteCustomer()`);
        deleteCustomer(); // 调用删除客户函数
      } else {
        console.log('[客户详情日志] 取消删除');
      }
    });
  }
  
  // 加载基本信息页面
  loadBasicInfoPage(customerId);

  // 设置模态框关闭按钮
  const closeButtons = modal.querySelectorAll('.modal-close, #close-detail-btn');
  console.log(`[客户详情日志] 找到 ${closeButtons.length} 个关闭按钮`);
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('[客户详情日志] 关闭按钮被点击');
      modal.style.display = 'none';
      modal.classList.remove('ant-modal-open');
    });
  });

  // 新的模态框外部点击关闭逻辑
  modal.addEventListener('click', (event) => {
    // 只有当点击事件的目标是模态框本身（即背景层）时才关闭
    if (event.target === modal) {
      console.log('[客户详情日志] 模态框背景层被点击');
      modal.style.display = 'none';
      modal.classList.remove('ant-modal-open');
    }
  });
  
  return modal;
}

// 加载客户数据到表单
function loadCustomerToForm(customerId) {
  // 获取客户详情，添加时间戳参数防止缓存
  fetchWithAuth(`/api/customers/${customerId}?_t=${new Date().getTime()}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取客户详情失败');
      }
      return response.json();
    })
    .then(customer => {
      // 填充表单
      document.getElementById('customer-name').value = customer.name || '';
      document.getElementById('customer-phone').value = customer.phone || '';
      document.getElementById('customer-age').value = customer.age || '';
      document.getElementById('customer-height').value = customer.height || '';
      document.getElementById('customer-upper-size').value = customer.upper_size || '';
      document.getElementById('customer-lower-size').value = customer.lower_size || '';
      document.getElementById('customer-body-type').value = customer.body_type || '';
      document.getElementById('customer-features').value = customer.features || '';
      document.getElementById('customer-reception').value = customer.reception || '';
      document.getElementById('customer-personality').value = customer.personality || '';
      // 多选下拉赋值
      const colorSelect = document.getElementById('customer-color-preference');
      const styleSelect = document.getElementById('customer-style-preference');
      if (colorSelect && customer.preferred_colors) {
        const arr = customer.preferred_colors.split(',');
        Array.from(colorSelect.options).forEach(opt => {
          opt.selected = arr.includes(opt.value);
        });
      } else if (colorSelect) {
        Array.from(colorSelect.options).forEach(opt => { opt.selected = false; });
      }
      if (styleSelect && customer.preferred_styles) {
        const arr = customer.preferred_styles.split(',');
        Array.from(styleSelect.options).forEach(opt => {
          opt.selected = arr.includes(opt.value);
        });
      } else if (styleSelect) {
        Array.from(styleSelect.options).forEach(opt => { opt.selected = false; });
      }
      document.getElementById('customer-accompaniment').value = customer.accompaniment || '';
      document.getElementById('customer-department').value = customer.department || '';
      document.getElementById('customer-employee').value = customer.employee || '';
      
      if (customer.registration_date) {
        // 格式化日期为YYYY-MM-DD
        const date = new Date(customer.registration_date);
        if (!isNaN(date.getTime())) {
          const formattedDate = date.toISOString().split('T')[0];
          document.getElementById('customer-registration-date').value = formattedDate;
        }
      } else {
        document.getElementById('customer-registration-date').value = '';
      }
      
      // 预览照片，添加时间戳防止缓存
      const photoPreview = document.getElementById('photo-preview');
      if (customer.photo) {
        photoPreview.innerHTML = `<img src="/api/customers/${customerId}/photo?_t=${new Date().getTime()}" style="max-width: 200px; max-height: 200px;" alt="客户照片">`;
      } else {
        photoPreview.innerHTML = '';
      }
    })
    .catch(error => {
      console.error('加载客户数据失败:', error);
      showAlert('加载客户数据失败: ' + error.message, 'error');
    });
}

// 照片预览
function previewPhoto() {
  const photoInput = document.getElementById('customer-photo');
  const photoPreview = document.getElementById('photo-preview');
  
  if (photoInput.files.length > 0) {
    const file = photoInput.files[0];
    
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      showAlert('请选择图片文件', 'warning');
      photoInput.value = '';
      return;
    }
    
    // 检查文件大小
    if (file.size > 10 * 1024 * 1024) { // 10MB
      showAlert('图片大小不能超过10MB', 'warning');
      // 不清空输入，允许用户尝试压缩
    }
    
    // 创建预览
    const reader = new FileReader();
    reader.onload = function(e) {
      photoPreview.innerHTML = `
        <img src="${e.target.result}" style="max-width: 200px; max-height: 200px;" alt="照片预览">
        <div class="photo-size-info">图片大小: ${(file.size / (1024 * 1024)).toFixed(2)}MB</div>
      `;
    };
    reader.readAsDataURL(file);
  } else {
    photoPreview.innerHTML = '';
  }
}

// 压缩图片
function compressImage(file, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function() {
        // 计算缩放比例
        let width = img.width;
        let height = img.height;
        let scale = 1;
        
        if (width > maxWidth) {
          scale = maxWidth / width;
          width = maxWidth;
          height = height * scale;
        }
        
        if (height > maxHeight) {
          scale = maxHeight / height;
          height = maxHeight;
          width = width * scale;
        }
        
        // 创建canvas并绘制压缩图像
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // 创建新的File对象
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              reject(new Error('图片压缩失败'));
            }
          }, 
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// 保存客户
async function saveCustomer() {
  // 获取表单数据
  const name = document.getElementById('customer-name').value;
  const phone = document.getElementById('customer-phone').value;
  
  // 基本验证
  if (!name || !phone) {
    showAlert('姓名和电话是必填项', 'warning');
    return;
  }
  
  // 电话号码格式验证
  if (!validatePhoneNumber(phone)) {
    showAlert('请输入有效的电话号码', 'warning');
    return;
  }
  
  // 创建FormData对象
  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('age', document.getElementById('customer-age').value);
  formData.append('height', document.getElementById('customer-height').value);
  formData.append('upper_size', document.getElementById('customer-upper-size').value);
  formData.append('lower_size', document.getElementById('customer-lower-size').value);
  formData.append('body_type', document.getElementById('customer-body-type').value);
  formData.append('features', document.getElementById('customer-features').value);
  formData.append('reception', document.getElementById('customer-reception').value);
  formData.append('personality', document.getElementById('customer-personality').value);
  // 获取多选下拉的值
  const colorSelect = document.getElementById('customer-color-preference');
  const styleSelect = document.getElementById('customer-style-preference');
  const colorValues = Array.from(colorSelect.selectedOptions).map(opt => opt.value).join(',');
  const styleValues = Array.from(styleSelect.selectedOptions).map(opt => opt.value).join(',');
  formData.append('preferred_colors', colorValues);
  formData.append('preferred_styles', styleValues);
  formData.append('accompaniment', document.getElementById('customer-accompaniment').value);
  formData.append('department', document.getElementById('customer-department').value);
  formData.append('employee', document.getElementById('customer-employee').value);
  formData.append('registration_date', document.getElementById('customer-registration-date').value);
  
  // 打印表单数据用于调试
  console.log("FormData内容:");
  for (let pair of formData.entries()) {
    console.log(pair[0] + ': ' + pair[1]);
  }
  
  // 检查是否有照片上传
  const photoInput = document.getElementById('customer-photo');
  if (photoInput.files.length > 0) {
    let photoFile = photoInput.files[0];
    console.log("照片文件:", photoFile.name, "大小:", photoFile.size, "类型:", photoFile.type);
    
    // 如果图片大于2MB，进行压缩
    if (photoFile.size > 2 * 1024 * 1024) {
      try {
        const originalSize = photoFile.size;
        photoFile = await compressImage(photoFile, 1200, 1200, 0.7); // 最大尺寸1200px，质量70%
        console.log('图片已压缩，原始大小:', (originalSize / (1024 * 1024)).toFixed(2) + 'MB', 
                    '新大小:', (photoFile.size / (1024 * 1024)).toFixed(2) + 'MB');
      } catch (err) {
        console.error('图片压缩失败:', err);
        // 继续使用原图
      }
    }
    
    formData.append('photo', photoFile);
  } else {
    console.log("没有选择照片文件");
  }
  
  // 确定API端点和HTTP方法
  let url = '/api/customers';
  let method = 'POST';
  
  if (isEditing && currentCustomerId) {
    url = `/api/customers/${currentCustomerId}`;
    method = 'PUT';
  }
  
  console.log(`发送请求: ${method} ${url}`);
  
  // 显示加载状态
  const saveButton = document.querySelector('#customer-modal .modal-footer .btn-primary');
  const originalText = saveButton.textContent;
  saveButton.textContent = '保存中...';
  saveButton.disabled = true;
  
  // 发送请求
  try {
    console.log('准备发送FormData:');
    for (let pair of formData.entries()) {
      console.log(`${pair[0]}: ${pair[1] instanceof File ? `File: ${pair[1].name}(${pair[1].size} bytes)` : pair[1]}`);
    }
    
    console.log('请求配置:', {
      url,
      method,
      headers: {}, // 使用FormData时不设置Content-Type
      credentials: 'include',
      body: 'FormData对象' // 无法直接日志输出FormData内容
    });
    
    const response = await fetchWithAuth(url, {
      method: method,
      body: formData,
      // 当使用FormData时不要手动设置Content-Type，让浏览器自动设置
      headers: {}
    });
    
    console.log('请求状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const responseText = await response.text();
      console.log('响应内容:', responseText);
      throw response;
    }
    
    const data = await response.json();
    console.log('响应数据:', data);
    
    // 隐藏模态框
    document.getElementById('customer-modal').style.display = 'none';
    
    // 重置表单
    resetCustomerForm();
    
    // 重新加载客户列表，添加true参数强制刷新
    loadCustomers(currentPage, true);
    
    // 显示全局成功通知
    showGlobalNotification(isEditing ? '客户更新成功' : '客户创建成功');
  } catch (error) {
    console.error('保存客户失败:', error);
    try {
      const errorData = await error.text();
      console.log('错误详情:', errorData);
      try {
        const errorJson = JSON.parse(errorData);
        showAlert('保存客户失败: ' + (errorJson.message || '未知错误'), 'error');
      } catch (e) {
        showAlert('保存客户失败: ' + (errorData || '未知错误'), 'error');
      }
    } catch (e) {
      showAlert('保存客户失败: ' + (error.statusText || '服务器错误'), 'error');
    }
  } finally {
    // 恢复按钮状态
    saveButton.textContent = originalText;
    saveButton.disabled = false;
  }
}

// 验证电话号码格式
function validatePhoneNumber(phone) {
  // 简单验证：不为空且只包含数字和可能的+号
  return phone && /^[0-9+\-\s]+$/.test(phone);
}

// 删除客户
async function deleteCustomer() {
  if (!currentCustomerId) return;
  
  // 确认删除 (这部分已经由 showCustomerDetail 调用 showConfirm 完成，这里不再重复)
  // const confirmed = await showConfirm({
  //   title: '删除确认',
  //   content: '确定要删除该客户吗？此操作将同时删除该客户的所有销售记录和积分记录，且不可恢复！',
  //   type: 'danger'
  // });
  
  // if (!confirmed) {
  //   return;
  // }
  
  // 发送删除请求
  fetchWithAuth(`/api/customers/${currentCustomerId}`, {
    method: 'DELETE'
  })
    .then(response => {
      if (!response.ok) {
        throw response;
      }
      return response.json();
    })
    .then(data => {
      // 隐藏详情模态框
      const modal = document.getElementById('customer-detail-modal');
      if (modal) {
        console.log('[客户详情日志] 删除成功，关闭详情模态框');
      modal.style.display = 'none';
        modal.classList.remove('ant-modal-open');
      }
      
      // 重新加载客户列表，添加true参数强制刷新
      loadCustomers(currentPage, true);
      
      // 重置当前选中的客户ID
      currentCustomerId = null;
      
      // 显示全局成功通知
      showGlobalNotification('客户删除成功');
    })
    .catch(error => {
      console.error('删除客户失败:', error);
      error.json().then(data => {
        showAlert('删除客户失败: ' + (data.message || '未知错误'), 'error');
      }).catch(() => {
        showAlert('删除客户失败: 服务器错误', 'error');
      });
    });
}

// 重置客户表单
function resetCustomerForm() {
  document.getElementById('customer-form').reset();
  document.getElementById('photo-preview').innerHTML = '';
  isEditing = false;
  currentCustomerId = null;
  document.getElementById('modal-title').textContent = '新建客户';
  
  // 设置建档日期为今天
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('customer-registration-date').value = today;
  
  // 设置默认部门
  document.getElementById('customer-department').value = '成都青羊光华店';
  
  // 清空性格字段
  document.getElementById('customer-personality').value = '';
}

// 处理搜索
function handleSearch(page = 1) {
  if (!currentSortField) currentSortField = 'last_visit';
  if (!currentSortOrder) currentSortOrder = 'desc';
  // 修正：如果currentSortField为id，强制currentSortOrder为desc
  if (currentSortField === 'id') currentSortOrder = 'desc';
  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  // 每次都直接从select读取当前归属员工
  const employeeSelect = document.getElementById('employee-select');
  const employeeOtherInput = document.getElementById('employee-other-input');
  let employee = '';
  if (employeeSelect) {
    if (employeeSelect.value === '其他') {
      employee = employeeOtherInput.value.trim();
    } else {
      employee = employeeSelect.value;
    }
  }
  // 排序参数
  let sortParams = '';
  if (currentSortField === 'id') {
    sortParams = `&sort=id&order=desc`;
  } else if (currentSortField && currentSortOrder) {
    sortParams = `&sort=${encodeURIComponent(currentSortField)}&order=${encodeURIComponent(currentSortOrder)}`;
  }
  // 统一逻辑：有employee参数就查员工，没有就查全部，但都带排序
  let url = '';
  if (employee) {
    url = `/api/customers/search?employee=${encodeURIComponent(employee)}&page=${page}&pageSize=${pageSize}${sortParams}`;
    if (searchTerm) {
      url += `&q=${encodeURIComponent(searchTerm)}`;
    }
  } else if (searchTerm) {
    url = `/api/customers/search?q=${encodeURIComponent(searchTerm)}&page=${page}&pageSize=${pageSize}${sortParams}`;
  } else if (currentSortField === 'id') {
    url = `/api/customers?page=${page}&pageSize=${pageSize}&sort=id&order=desc`;
  } else {
    url = `/api/customers?page=${page}&pageSize=${pageSize}${sortParams}`;
  }
  // ...显示加载状态...
  const tableBody = document.getElementById('customers-list');
  tableBody.innerHTML = '<tr><td colspan="24" style="text-align: center;"><div class="spinner"></div><div>搜索中，请稍候...</div></td></tr>';
  const searchStartTime = Date.now();
  fetchWithAuth(url)
    .then(response => {
      if (!response.ok) throw new Error('搜索失败');
      return response.json();
    })
    .then(data => {
      if (!data.success || !data.data) throw new Error(data.message || '搜索失败');
      const elapsed = Date.now() - searchStartTime;
      const remainingWait = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        currentPage = data.pagination.currentPage;
        totalCustomers = data.pagination.total;
        totalPages = data.pagination.totalPages;
        renderCustomerTable(data.data);
        renderPagination();
      }, remainingWait);
    })
    .catch(error => {
      const elapsed = Date.now() - searchStartTime;
      const remainingWait = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        showAlert('搜索失败，请重试', 'warning');
        loadCustomers(1);
      }, remainingWait);
    });
}

// 添加全局通知函数（如果不存在）
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

// 帮助函数：刷新客户列表并强制重新请求服务器
function refreshCustomers() {
  // 重新加载当前页
  loadCustomers(currentPage, true);
  
  // 显示通知
  showAlert('已刷新客户数据', 'success');
}

// 初始化字段显示/隐藏设置
function initColumnToggleSettings() {
  const container = document.getElementById('column-toggles');
  if (!container) {
    console.error('未找到字段切换容器元素!');
    return;
  }
  
  container.innerHTML = '';
  
  // 为每个字段创建复选框
  columnSettings.forEach(column => {
    const checkboxDiv = document.createElement('div');
    checkboxDiv.className = 'checkbox-item';
    
    const checkboxId = `col-toggle-${column.id}`;
    
    checkboxDiv.innerHTML = `
      <input type="checkbox" id="${checkboxId}" name="${column.id}" ${column.visible ? 'checked' : ''}>
      <label for="${checkboxId}">${column.name}</label>
    `;
    
    container.appendChild(checkboxDiv);
  });
}

// 应用字段显示/隐藏设置
function applyColumnSettings() {
  // 获取所有复选框的状态
  columnSettings.forEach(column => {
    const checkbox = document.getElementById(`col-toggle-${column.id}`);
    if (checkbox) {
      column.visible = checkbox.checked;
    }
  });
  
  // 保存设置到本地存储
  saveColumnSettings();
  
  // 更新表头
  updateTableHeader();
  
  // 获取当前搜索条件
  const searchTerm = document.getElementById('search-input').value.trim();
  
  // 重新渲染表格，保持搜索条件
  if (searchTerm) {
    // 如果有搜索条件，使用搜索API
    handleSearch();
  } else {
    // 如果没有搜索条件，正常加载客户列表
    renderCustomerTable(customers);
  }
  
  // 关闭模态框
  const modal = document.getElementById('columns-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  showGlobalNotification('字段设置已更新');
}

// 重置字段显示/隐藏设置
function resetColumnSettings() {
  // 重置为所有字段都显示
  columnSettings = ALL_COLUMNS.map(col => ({ ...col, visible: true }));
  
  // 更新复选框
  initColumnToggleSettings();
  
  // 保存设置
  saveColumnSettings();
  
  // 更新表头
  updateTableHeader();
  
  // 获取当前搜索条件
  const searchTerm = document.getElementById('search-input').value.trim();
  
  // 重新渲染表格，保持搜索条件
  if (searchTerm) {
    // 如果有搜索条件，使用搜索API
    handleSearch();
  } else {
    // 如果没有搜索条件，正常加载客户列表
    renderCustomerTable(customers);
  }
  
  // 关闭模态框
  const modal = document.getElementById('columns-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  showGlobalNotification('字段设置已重置');
}

// 保存字段设置到本地存储
function saveColumnSettings() {
  try {
    const settingsToSave = columnSettings.map(col => ({
      id: col.id,
      visible: col.visible
    }));
    localStorage.setItem('customerColumnsSettings', JSON.stringify(settingsToSave));
    console.log('字段设置已保存到本地存储:', settingsToSave);
  } catch (error) {
    console.error('保存字段设置失败:', error);
  }
}

// 从本地存储加载字段设置
function loadColumnSettings() {
  try {
    const savedSettings = localStorage.getItem('customerColumnsSettings');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      
      // 更新当前设置
      parsedSettings.forEach(saved => {
        const column = columnSettings.find(col => col.id === saved.id);
        if (column) {
          column.visible = saved.visible;
        }
      });
      
      console.log('已从本地存储加载字段设置, 可见列数:', columnSettings.filter(col => col.visible).length);
    }
  } catch (error) {
    console.error('加载字段设置失败:', error);
    // 发生错误时重置为默认设置
    columnSettings = ALL_COLUMNS.map(col => ({ ...col, visible: true }));
  }
}

// 更新表头以反映字段显示/隐藏设置
function updateTableHeader() {
  const tableHead = document.querySelector('#customers-table thead tr');
  if (!tableHead) {
    console.error('未找到表头元素!');
    return;
  }
  
  // 清空当前表头
  tableHead.innerHTML = '';
  
  // 添加仅可见的列设置
  const visibleColumns = columnSettings.filter(col => col.visible);
  
  // 根据设置添加表头
  visibleColumns.forEach(column => {
    const th = document.createElement('th');
    
    // 为"最近回访"列添加排序功能
    if (column.id === 'last_visit') {
      // 直接设置文本内容
      th.textContent = column.name;
      
      // 添加点击事件
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        // 循环切换排序顺序：desc -> asc -> id desc -> desc ...
        if (currentSortField === 'last_visit' && currentSortOrder === 'desc') {
          currentSortOrder = 'asc';
        } else if (currentSortField === 'last_visit' && currentSortOrder === 'asc') {
          currentSortField = 'id';
          currentSortOrder = 'desc'; // 强制id排序为desc
        } else {
          currentSortField = 'last_visit';
          currentSortOrder = 'desc';
        }
        // 重新加载数据，始终用handleSearch(1)保证员工参数不丢失
        handleSearch(1);
      });
      // 显示排序箭头
      if (currentSortField === 'last_visit') {
        th.innerHTML += currentSortOrder === 'desc' ? ' ↓' : ' ↑';
      } else if (currentSortField === 'id' && th.textContent.includes('最近回访')) {
        th.innerHTML += ' (ID↓)';
      }
    } else if (column.id === 'last_consumption') {
      // 为"最近消费"列添加排序功能
      th.textContent = column.name;
      
      // 添加点击事件
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        // 循环切换排序顺序：desc -> asc -> id desc -> desc ...
        if (currentSortField === 'last_consumption' && currentSortOrder === 'desc') {
          currentSortOrder = 'asc';
        } else if (currentSortField === 'last_consumption' && currentSortOrder === 'asc') {
          currentSortField = 'id';
          currentSortOrder = 'desc'; // 强制id排序为desc
        } else {
          currentSortField = 'last_consumption';
          currentSortOrder = 'desc';
        }
        // 重新加载数据，始终用handleSearch(1)保证员工参数不丢失
        handleSearch(1);
      });
      // 显示排序箭头
      if (currentSortField === 'last_consumption') {
        th.innerHTML += currentSortOrder === 'desc' ? ' ↓' : ' ↑';
      } else if (currentSortField === 'id' && th.textContent.includes('最近消费')) {
        th.innerHTML += ' (ID↓)';
      }
    } else {
      // 其他列直接显示文本
      th.textContent = column.name;
    }
    
    tableHead.appendChild(th);
  });
  
  console.log('表头已更新，可见列数:', visibleColumns.length);
}

// 打开回访记录模态框
function openVisitModal(customerId, customerName, customerPhone) {
  console.log('打开回访模态框，客户ID:', customerId, '姓名:', customerName, '电话:', customerPhone);
  
  if (!customerId || !customerName || !customerPhone) {
    console.error('缺少必要的客户信息:', { customerId, customerName, customerPhone });
    showAlert('无法获取客户信息，请刷新页面后重试', 'warning');
    return;
  }
  
  // 填充客户信息
  document.getElementById('visit-customer-id').value = customerId;
  document.getElementById('visit-customer-name').value = customerName;
  document.getElementById('visit-customer-phone').value = customerPhone;
  
  // 设置回访日期默认为今天
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('visit-date').value = today;
  
  // 清空其他字段
  document.getElementById('visit-type').value = '';
  document.getElementById('visit-purpose').value = '';
  document.getElementById('visit-result').value = '';
  document.getElementById('visit-notes').value = '';
  
  // 显示模态框 - 尝试直接操作DOM
  try {
    // 获取模态框和遮罩层
    const visitModal = document.getElementById('visit-modal');
    
    // 确保模态框存在
    if (!visitModal) {
      throw new Error('未找到回访模态框元素');
    }
    
    // 直接设置样式属性
    visitModal.setAttribute('style', 'display: flex !important; align-items: center; justify-content: center; z-index: 9999;');
    
    // 确保模态框内容可见
    const modalContent = visitModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.setAttribute('style', 'position: relative; z-index: 10000; max-height: 90vh; overflow-y: auto;');
    }
    
    // 向控制台输出当前状态
    console.log('回访模态框已设置显示，当前模态框:', visitModal);
    console.log('当前display值:', window.getComputedStyle(visitModal).display);
    
  } catch (error) {
    console.error('显示回访模态框时出错:', error);
    showAlert('显示回访模态框时出错，请刷新页面后重试', 'warning');
  }
}

// 保存回访记录
function saveVisit() {
  // 获取表单数据
  const customerId = document.getElementById('visit-customer-id').value;
  const customerName = document.getElementById('visit-customer-name').value;
  const customerPhone = document.getElementById('visit-customer-phone').value;
  const visitDate = document.getElementById('visit-date').value;
  const visitType = document.getElementById('visit-type').value;
  const visitPurpose = document.getElementById('visit-purpose').value;
  const visitResult = document.getElementById('visit-result').value;
  const visitNotes = document.getElementById('visit-notes').value;
  
  // 基本验证
  if (!visitDate || !visitType) {
    showAlert('回访日期和回访方式为必填项!', 'warning');
    return;
  }
  
  // 构建请求数据
  const visitData = {
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: customerPhone,
    visit_date: visitDate,
    visit_type: visitType,
    visit_purpose: visitPurpose,
    visit_result: visitResult,
    notes: visitNotes
  };
  
  console.log('保存回访记录:', visitData);
  
  // 显示保存中状态
  const saveButton = document.getElementById('save-visit-btn');
  const originalText = saveButton.textContent;
  saveButton.textContent = '保存中...';
  saveButton.disabled = true;
  
  // 发送请求
  fetchWithAuth('/api/visits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(visitData)
  })
    .then(response => {
      console.log('回访记录保存响应状态:', response.status);
      if (!response.ok) {
        throw response;
      }
      return response.json();
    })
    .then(data => {
      console.log('回访记录保存成功:', data);
      
      // 隐藏模态框
      const modal = document.getElementById('visit-modal');
      modal.setAttribute('style', 'display: none !important');
      
      // 重新加载客户列表，以更新最近回访信息
      loadCustomers(currentPage, true);
      
      // 显示全局成功通知
      showGlobalNotification('回访记录保存成功');
    })
    .catch(error => {
      console.error('保存回访记录失败:', error);
      if (error.status === 401) {
        // 未授权，可能是会话过期
        showAlert('会话已过期，请重新登录', 'warning');
        window.location.href = '/';
        return;
      }
      
      try {
        error.json().then(data => {
          showAlert('保存回访记录失败: ' + (data.message || '未知错误'), 'error');
        }).catch(() => {
          showAlert('保存回访记录失败: 服务器错误', 'error');
        });
      } catch (e) {
        showAlert('保存回访记录失败: 服务器错误', 'error');
      }
    })
    .finally(() => {
      // 恢复按钮状态
      saveButton.textContent = originalText;
      saveButton.disabled = false;
    });
}

// 添加一个专门用于表格操作列的回访函数
function openVisitForCustomer(customerId, customerName, customerPhone) {
  console.log('通过表格操作打开回访模态框，客户ID:', customerId);
  
  // 关闭可能打开的其他模态框
  const allModals = document.querySelectorAll('.modal');
  allModals.forEach(modal => {
    if (modal.id !== 'visit-modal') {
      modal.style.display = 'none';
    }
  });
  
  // 打开回访模态框
  openVisitModal(customerId, customerName, customerPhone);
  
  // 阻止事件冒泡
  if (event) {
    // 阻止默认行为
    if (event.preventDefault) event.preventDefault();
    // 阻止事件冒泡
    if (event.stopPropagation) event.stopPropagation();
    // IE兼容性处理
    if (window.event) window.event.cancelBubble = true;
  }
  
  return false; // 确保阻止默认行为
}

// 初始化自定义多选下拉框
function initCustomSelects() {
  const selects = document.querySelectorAll('.custom-select');
  
  selects.forEach(select => {
    const nativeSelect = select.querySelector('select');
    const optionsContainer = select.querySelector('.select-options');
    const trigger = document.createElement('div');
    trigger.className = 'select-trigger';
    trigger.textContent = '请选择';
    select.insertBefore(trigger, nativeSelect);
    
    // 创建选项
    Array.from(nativeSelect.options).forEach(option => {
      const optionElement = document.createElement('div');
      optionElement.className = 'select-option';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = option.value;
      checkbox.checked = option.selected;
      
      const label = document.createElement('span');
      label.textContent = option.text;
      
      optionElement.appendChild(checkbox);
      optionElement.appendChild(label);
      optionsContainer.appendChild(optionElement);
      
      // 点击选项时更新选中状态
      optionElement.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        updateSelectValue();
      });
    });
    
    // 点击触发器显示/隐藏选项
    trigger.addEventListener('click', () => {
      select.classList.toggle('active');
    });
    
    // 点击外部关闭下拉框
    document.addEventListener('click', (e) => {
      if (!select.contains(e.target)) {
        select.classList.remove('active');
      }
    });
    
    // 更新选中值
    function updateSelectValue() {
      const selectedOptions = Array.from(optionsContainer.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
      
      // 更新原生select的选中状态
      Array.from(nativeSelect.options).forEach(option => {
        option.selected = selectedOptions.includes(option.value);
      });
      
      // 更新触发器显示
      if (selectedOptions.length > 0) {
        trigger.textContent = selectedOptions.join(', ');
        trigger.classList.add('selected');
      } else {
        trigger.textContent = '请选择';
        trigger.classList.remove('selected');
      }
      
      // 更新选项的选中样式
      optionsContainer.querySelectorAll('.select-option').forEach(option => {
        const checkbox = option.querySelector('input[type="checkbox"]');
        option.classList.toggle('selected', checkbox.checked);
      });
    }
  });
}

// 导出客户数据
async function exportCustomers() {
  try {
    // 显示加载提示
    showGlobalNotification('正在导出客户数据，请稍候...');
    
    // 调用导出API
    const response = await fetchWithAuth('/api/customers/export', {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('导出失败');
    }
    
    // 获取文件名
    const contentDisposition = response.headers.get('content-disposition');
    let filename = '客户数据.xlsx';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // 下载文件
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showGlobalNotification('客户数据导出成功');
  } catch (error) {
    console.error('导出客户数据失败:', error);
    showGlobalNotification('导出失败: ' + error.message, 'error');
  }
}

// 全局alert函数，避免未定义报错
function showAlert(message, type = 'error') {
  alert(message);
}

// ===== 客户详情双页面切换功能 =====

// 初始化客户详情页面结构
function initializeCustomerDetailPages() {
  // 确保页面切换按钮存在
  const pageTabs = document.querySelector('.page-tabs');
  if (!pageTabs) {
    console.error('页面切换按钮不存在');
    return;
  }

  // 绑定页面切换事件
  const tabs = pageTabs.querySelectorAll('.page-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPage = tab.getAttribute('data-page');
      switchPage(targetPage);
    });
  });

  // 默认显示基本信息页面
  switchPage('basic-info');
}

// 切换页面
function switchPage(pageName) {
  console.log(`切换到页面: ${pageName}`);
  
  // 更新页面切换按钮状态
  const tabs = document.querySelectorAll('.page-tab');
  tabs.forEach(tab => {
    if (tab.getAttribute('data-page') === pageName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // 更新页面内容显示状态
  const pages = document.querySelectorAll('.page-content');
  pages.forEach(page => {
    if (page.id === `${pageName}-page`) {
      page.classList.add('active');
    } else {
      page.classList.remove('active');
    }
  });

  // 根据页面类型加载相应内容
  if (pageName === 'basic-info') {
    loadBasicInfoPage(currentCustomerId);
  } else if (pageName === 'consumption-details') {
    loadConsumptionDetailsPage(currentCustomerId);
  } else if (pageName === 'visit-records') {
    loadVisitRecordsPage(currentCustomerId);
  }
}

// 加载基本信息页面
function loadBasicInfoPage(customerId) {
  const basicInfoPage = document.getElementById('basic-info-page');
  if (!basicInfoPage) {
    console.error('基本信息页面不存在');
    return;
  }

  // 显示加载指示器
  basicInfoPage.innerHTML = '<div style="text-align: center; padding: 30px;"><div class="spinner"></div><div>加载客户详情...</div></div>';

  // 添加时间戳参数，强制从服务器获取最新数据
  const timestamp = new Date().getTime();
  fetchWithAuth(`/api/customers/${customerId}?_t=${timestamp}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取客户详情失败');
      }
      return response.json();
    })
    .then(customer => {
      // 客户详情内容
      let html = `
        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
          <div style="flex: 1; min-width: 200px;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">基本信息</h4>
            <p><strong>姓名:</strong> ${customer.name}</p>
            <p><strong>电话:</strong> ${customer.phone}</p>
            <p><strong>年龄:</strong> ${customer.age || ''}</p>
            <p><strong>身高:</strong> ${customer.height || ''}</p>
            <p><strong>上衣码数:</strong> ${customer.upper_size || ''}</p>
            <p><strong>下衣码数:</strong> ${customer.lower_size || ''}</p>
            <p><strong>体型:</strong> ${customer.body_type || ''}</p>
            <p><strong>特征:</strong> ${customer.features || ''}</p>
          </div>
          <div style="flex: 1; min-width: 200px;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">偏好信息</h4>
            <p><strong>接待:</strong> ${customer.reception || ''}</p>
            <p><strong>性格:</strong> ${customer.personality || ''}</p>
            <p><strong>偏爱色系:</strong> ${customer.preferred_colors || ''}</p>
            <p><strong>偏爱风格:</strong> ${customer.preferred_styles || ''}</p>
            <p><strong>陪同:</strong> ${customer.accompaniment || ''}</p>
            <p><strong>归属部门:</strong> ${customer.department || ''}</p>
            <p><strong>归属员工:</strong> ${customer.employee || ''}</p>
            <p><strong>建档日期:</strong> ${formatDate(customer.registration_date) || ''}</p>
          </div>
          <div style="flex: 1; min-width: 200px;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">消费信息</h4>
            <p><strong>消费金额:</strong> ${formatCurrency(customer.total_consumption)}</p>
            <p><strong>消费数量:</strong> ${customer.consumption_count || 0}</p>
            <p><strong>消费次数:</strong> ${customer.consumption_times || 0}</p>
            <p><strong>累计积分:</strong> ${customer.total_points || 0}</p>
            <p><strong>可用积分:</strong> ${customer.available_points || 0}</p>
            <p><strong>最近消费:</strong> ${formatDate(customer.last_consumption) || ''}</p>
            <p><strong>最近回访:</strong> ${formatDateTime(customer.last_visit) || '无回访记录'}</p>
          </div>
        </div>
      `;
      
      // 照片区域
      if (customer.photo) {
        html += `
          <div style="width: 100%; margin-top: 20px;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">客户照片</h4>
            <div style="text-align: center;">
              <img src="/api/customers/${customer.id}/photo?_t=${new Date().getTime()}" style="max-width: 300px; max-height: 300px;" alt="客户照片">
            </div>
          </div>
        `;
      }
      
      basicInfoPage.innerHTML = html;
      console.log('基本信息页面加载完成');
    })
    .catch(error => {
      console.error('获取客户详情失败:', error);
      basicInfoPage.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">获取客户详情失败: ${error.message}</div>`;
    });
}

// 加载消费详情页面
function loadConsumptionDetailsPage(customerId) {
  const consumptionDetailsPage = document.getElementById('consumption-details-page');
  if (!consumptionDetailsPage) {
    console.error('消费详情页面不存在');
    return;
  }

  // 显示加载指示器
  const consumptionContent = consumptionDetailsPage.querySelector('.consumption-details-content');
  consumptionContent.innerHTML = '<div style="text-align: center; padding: 30px;"><div class="spinner"></div><div>加载消费详情...</div></div>';

  // 获取消费详情数据
  fetchWithAuth(`/api/customers/${customerId}/consumption-details`)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取消费详情失败');
      }
      return response.json();
    })
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '获取消费详情失败');
      }

      console.log('消费详情API返回数据:', data);
      console.log('销售记录数量:', data.data.length);
      data.data.forEach((sale, index) => {
        console.log(`销售记录 ${index + 1}:`, {
          sale_id: sale.sale_id,
          date: sale.date,
          transaction_number: sale.transaction_number,
          total_amount: sale.total_amount,
          items_count: sale.items ? sale.items.length : 0
        });
      });

      renderConsumptionDetails(data.data, consumptionContent);
    })
    .catch(error => {
      console.error('获取消费详情失败:', error);
      consumptionContent.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">获取消费详情失败: ${error.message}</div>`;
    });
}

// 渲染消费详情表格
function renderConsumptionDetails(consumptionData, container) {
  if (!consumptionData || consumptionData.length === 0) {
    container.innerHTML = `
      <div class="consumption-empty">
        <div class="consumption-empty-icon">📊</div>
        <div class="consumption-empty-text">暂无消费记录</div>
      </div>
    `;
    return;
  }

  let html = '<h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">消费记录详情</h4>';

  // 按销售记录分组显示
  consumptionData.forEach((sale, index) => {
    html += `
      <div class="consumption-group">
        <div class="consumption-group-header">
          <div class="consumption-group-title">
            交易号: ${sale.transaction_number || '无'}
          </div>
          <div class="consumption-group-info">
            ${sale.date || '无日期'} | ${sale.store || '无店铺'} | 总金额: ${formatCurrency(sale.total_amount)}
          </div>
        </div>
        <div class="consumption-group-content">
          <table class="consumption-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>货号</th>
                <th>尺码</th>
                <th>数量</th>
                <th>金额</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (sale.items && sale.items.length > 0) {
      sale.items.forEach(item => {
        html += `
          <tr>
            <td>${sale.date || ''}</td>
            <td>${item.product_code || ''}</td>
            <td>${item.size || ''}</td>
            <td>${item.quantity || 1}</td>
            <td>${formatCurrency(item.amount)}</td>
          </tr>
        `;
      });
    } else {
      // 如果没有商品明细，显示销售记录本身
      html += `
        <tr>
          <td>${sale.date || ''}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${formatCurrency(sale.total_amount)}</td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  console.log('消费详情页面加载完成');
}

// 加载回访记录页面
function loadVisitRecordsPage(customerId) {
  const visitRecordsPage = document.getElementById('visit-records-page');
  if (!visitRecordsPage) {
    console.error('回访记录页面不存在');
    return;
  }

  // 显示加载指示器
  const visitRecordsContent = visitRecordsPage.querySelector('.visit-records-content');
  visitRecordsContent.innerHTML = '<div style="text-align: center; padding: 30px;"><div class="spinner"></div><div>加载回访记录...</div></div>';

  // 获取回访记录数据
  fetchWithAuth(`/api/customers/${customerId}/visits`)
    .then(response => {
      if (!response.ok) {
        throw new Error('获取回访记录失败');
      }
      return response.json();
    })
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '获取回访记录失败');
      }

      console.log('回访记录API返回数据:', data);
      console.log('回访记录数量:', data.data.length);
      
      renderVisitRecordsTable(data.data, visitRecordsContent);
    })
    .catch(error => {
      console.error('获取回访记录失败:', error);
      visitRecordsContent.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">获取回访记录失败: ${error.message}</div>`;
    });
}

// 渲染回访记录表格
function renderVisitRecordsTable(visitData, container) {
  if (!visitData || visitData.length === 0) {
    container.innerHTML = `
      <div class="visit-records-empty">
        <div class="visit-records-empty-icon">📋</div>
        <div class="visit-records-empty-text">暂无回访记录</div>
      </div>
    `;
    return;
  }

  let html = '<h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">回访记录详情</h4>';
  
  html += `
    <div class="visit-records-table-container">
      <table class="visit-records-table">
        <thead>
          <tr>
            <th>回访日期</th>
            <th>回访方式</th>
            <th>回访目的</th>
            <th>回访结果</th>
            <th>备注</th>
            <th>记录时间</th>
          </tr>
        </thead>
        <tbody>
  `;

  visitData.forEach(visit => {
    html += `
      <tr>
        <td>${formatDate(visit.visit_date) || ''}</td>
        <td>${visit.visit_type || ''}</td>
        <td>${visit.visit_purpose || ''}</td>
        <td>${visit.visit_result || ''}</td>
        <td title="${visit.notes || ''}">${truncateText(visit.notes || '', 30)}</td>
        <td>${formatDateTime(visit.created_at) || ''}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  console.log('回访记录页面加载完成');
}

// 截取文本函数
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}