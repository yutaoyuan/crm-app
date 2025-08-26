// 全局变量
let sales = {}; // 修改为对象，用于存储销售数据缓存
let currentSaleId = null;
let currentPage = 1;
let pageSize = parseInt(localStorage.getItem('salesPageSize')) || 10; // 优先读取本地存储
let totalPages = 1;
let allCustomers = []; // 存储所有客户数据用于搜索
let selectedCustomer = null; // 当前选择的客户
let totalSales = 0; // 总销售记录数
let pageCache = {}; // 用于缓存已加载的页面数据
const CACHE_RANGE = 2; // 当前页前后各缓存2页
let currentSearchTerm = ''; // 添加变量来保存当前搜索状态
let isLoading = false;
let searchQuery = '';

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
  }
  
  // 确保URL是绝对路径
  const baseUrl = window.location.origin;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  
  // 执行请求
  return fetch(fullUrl, mergedOptions)
    .then(response => {
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
  // 检查用户是否已登录
  if (typeof checkAuth === 'function') {
    checkAuth();
  }
  
  // 初始化模态框
  const saleModal = setupModal('sale-modal', 'new-sale-btn', ['.close-modal']);
  
  // 设置新建销售记录按钮事件
  document.getElementById('new-sale-btn').addEventListener('click', () => {
    showNewSaleModal();
  });
  
  // 设置搜索功能
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
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
  
  // 加载销售记录
  loadSales();
  
  // 加载客户列表供选择
  loadCustomersForDropdown();
  
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
  }
  
  // 添加导购1和导购2的联动事件
  const salesperson1Select = document.getElementById('salesperson1');
  const salesperson2Select = document.getElementById('salesperson2');
  
  if (salesperson1Select && salesperson2Select) {
    salesperson1Select.addEventListener('change', function() {
      const selectedValue = this.value;
      // 如果导购1选择了值，则禁用导购2中的相同选项
      Array.from(salesperson2Select.options).forEach(option => {
        if (option.value) { // 只处理有值的选项
          option.disabled = option.value === selectedValue;
        }
      });
    });
    
    salesperson2Select.addEventListener('change', function() {
      const selectedValue = this.value;
      // 如果导购2选择了值，则禁用导购1中的相同选项
      Array.from(salesperson1Select.options).forEach(option => {
        if (option.value) { // 只处理有值的选项
          option.disabled = option.value === selectedValue;
        }
      });
    });
  }
});

// Load sales with pagination and optional search
function loadSales() {
    isLoading = true;
    
    // 显示加载动画
    const loadingSpinner = document.getElementById('loading-spinner');
    const salesTable = document.getElementById('sales-table');
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    if (salesTable) salesTable.style.display = 'none';
    
    // 构建基础URL
    let url = `/api/sales?page=${currentPage}&limit=${pageSize}`;
    if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    // 如果没有搜索词，尝试加载前后页的数据
    const loadAdjacentPages = !searchQuery;
    
    // 主请求
    fetchWithAuth(url)
    .then(response => {
        if (!response.ok) {
            throw new Error(response.statusText || '获取销售记录失败');
        }
        return response.json();
    })
    .then(data => {
        // 更新主数据
        renderSalesTable(data.data);
        totalSales = data.total;
        totalPages = Math.ceil(data.total / pageSize);
        pageCache[currentPage] = data.data;
        
        // 如果没有搜索词，加载相邻页面
        if (loadAdjacentPages) {
            const adjacentPromises = [];
            
            // 加载前后2页的数据
            for (let i = Math.max(1, currentPage - CACHE_RANGE); i <= Math.min(totalPages, currentPage + CACHE_RANGE); i++) {
                if (i !== currentPage && !pageCache[i]) {
                    const adjacentUrl = `/api/sales?page=${i}&limit=${pageSize}`;
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
                .then(() => {
                })
                .catch(error => {
                    console.error('预加载相邻页面时发生错误:', error);
                });
        }
        
        // 更新分页控件
        renderPagination();
    })
    .catch(error => {
        console.error('加载销售记录失败:', error);
        showAlert(error.message || '加载销售记录失败', 'error');
        renderSalesTable([]);
        // 重置分页信息
        totalSales = 0;
        totalPages = 1;
        renderPagination();
    })
    .finally(() => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        if (salesTable) salesTable.style.display = 'table';
        isLoading = false;
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
      localStorage.setItem('salesPageSize', pageSize); // 新增：保存到本地存储
      currentPage = 1;
      pageCache = {}; // 新增：切换每页条数时清空缓存，确保数据刷新
      loadSales();
    });
    paginationEl.appendChild(pageSizeSelect);
  
    // 创建"首页"按钮
    const firstBtn = document.createElement('button');
    firstBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
    firstBtn.textContent = '首页';
    firstBtn.disabled = currentPage === 1;
    firstBtn.addEventListener('click', () => changePage(1));
    paginationEl.appendChild(firstBtn);
  
    // 创建"上一页"按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = `pagination-button ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => changePage(currentPage - 1));
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
        pageBtn.addEventListener('click', () => changePage(i));
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
    nextBtn.addEventListener('click', () => changePage(currentPage + 1));
    paginationEl.appendChild(nextBtn);
  
    // 创建"末页"按钮
    const lastBtn = document.createElement('button');
    lastBtn.className = `pagination-button ${currentPage === totalPages ? 'disabled' : ''}`;
    lastBtn.textContent = '末页';
    lastBtn.disabled = currentPage === totalPages;
    lastBtn.addEventListener('click', () => changePage(totalPages));
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
    pageInfo.textContent = `${currentPage}/${totalPages}页，共${totalSales || 0}条记录`;
    paginationEl.appendChild(pageInfo);
  
    paginationContainer.appendChild(paginationEl);
  
    // 跳转按钮事件
    document.getElementById('page-jump-btn').addEventListener('click', () => {
        const input = document.getElementById('page-jump-input');
        const page = parseInt(input.value);
        if (page && page >= 1 && page <= totalPages) {
            changePage(page);
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
  
    // 保证分页容器为flex布局
    paginationEl.style.display = 'flex';
    paginationEl.style.alignItems = 'center';
    paginationEl.style.gap = '8px';
}

// 切换页面
function changePage(page) {
    if (page < 1 || page > totalPages || page === currentPage || isLoading) {
        return;
    }
    
    // 如果目标页面已经在缓存中
    if (pageCache[page] && !searchQuery) {
        currentPage = page;
        renderSalesTable(pageCache[page]);
        renderPagination();
    } else {
        currentPage = page;
        loadSales();
    }
}

// 预加载相邻页面
function loadAdjacentPages(page) {
    if (searchQuery) return; // 搜索模式下不预加载
    
    const adjacentPromises = [];
    
    // 加载前后2页的数据
    for (let i = Math.max(1, page - CACHE_RANGE); i <= Math.min(totalPages, page + CACHE_RANGE); i++) {
        if (i !== page && !pageCache[i]) {
            const url = `/api/sales?page=${i}&limit=${pageSize}`;
            adjacentPromises.push(
                fetchWithAuth(url)
                    .then(response => response.json())
                    .then(data => {
                        if (data && data.success === true && Array.isArray(data.data)) {
                            pageCache[i] = data.data;
                        }
                    })
                    .catch(error => console.error(`加载第${i}页数据失败:`, error))
            );
        }
    }
    
    Promise.all(adjacentPromises)
        .then(() => console.log('相邻页面预加载完成'))
        .catch(error => console.error('预加载相邻页面时发生错误:', error));
}

// 处理搜索
function handleSearch() {
    const searchInput = document.getElementById('search-input');
    const newSearchQuery = searchInput.value.trim();
    
    if (newSearchQuery === searchQuery) {
        return; // 如果搜索词没有变化，不执行搜索
    }
    
    // 重置分页和缓存
    searchQuery = newSearchQuery;
    currentPage = 1;
    pageCache = {};
    
    // 重新加载数据
    loadSales();
}

// 渲染销售记录表格
function renderSalesTable(salesList) {
    const tableBody = document.getElementById('sales-list');
    if (!tableBody) {
        return;
    }
    
    tableBody.innerHTML = '';
    
    if (!salesList || salesList.length === 0) {
        const row = document.createElement('tr');
    row.innerHTML = `<td colspan="14" style="text-align: center;">暂无销售记录</td>`; // 更新colspan
        tableBody.appendChild(row);
        return;
    }

    // 只显示当前页的数据
    salesList.forEach(sale => {
    // 计算总数量
    const totalQuantity = Array.isArray(sale.items) ? 
      sale.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
      
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.id || ''}</td>
            <td>${sale.name || ''}</td>
            <td>${sale.phone || ''}</td>
            <td>${sale.transaction_number || ''}</td>
            <td>${formatDate(sale.date) || ''}</td>
            <td>${sale.sale_type || ''}</td>
            <td>${sale.store || ''}</td>
            <td>${sale.salesperson1 || ''}</td>
            <td>${sale.salesperson2 || ''}</td>
        <td>${totalQuantity}</td>
        <td>${formatCurrency(sale.total_amount)}</td>
            <td>${sale.notes || ''}</td>
        `;
        // 添加点击事件，确保sale.id存在
        if (sale.id) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => showSaleDetail(sale.id));
        }
        tableBody.appendChild(row);
    });
}

// 显示新建销售记录模态框
function showNewSaleModal() {
  try {
    // 重置表单
    document.getElementById('sale-form').reset();
    document.getElementById('customer_selected').innerHTML = '';
    document.getElementById('customer_selected').style.display = 'none';
    
    // 设置当前日期
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('sale-date').value = `${year}-${month}-${day}`;
    
    // 重置客户选择
    selectedCustomer = null;
    document.getElementById('customer_id').value = '';
    document.getElementById('customer_search').value = '';
    
    // 重置导购选择
    const salesperson1Select = document.getElementById('salesperson1');
    const salesperson2Select = document.getElementById('salesperson2');
    if (salesperson1Select && salesperson2Select) {
      Array.from(salesperson1Select.options).forEach(option => option.disabled = false);
      Array.from(salesperson2Select.options).forEach(option => option.disabled = false);
    }
    
    // 清空商品明细表格
    const salesItemsBody = document.getElementById('sales-items-body');
    salesItemsBody.innerHTML = '';
    
    // 添加默认商品明细行
    addSalesItemRow();
    
    // 重置总金额
    document.getElementById('total-amount').value = '0.00';
    
    // 显示模态框
    const modal = document.getElementById('sale-modal');
    modal.style.display = 'block';
    
    // 确保不会重复绑定事件监听器
    const addSalesItemButton = document.getElementById('add-sales-item');
    if (addSalesItemButton) {
        // 移除旧的事件监听器 (如果存在)
        const newAddSalesItemButton = addSalesItemButton.cloneNode(true);
        addSalesItemButton.parentNode.replaceChild(newAddSalesItemButton, addSalesItemButton);
        // 添加新的事件监听器
        newAddSalesItemButton.addEventListener('click', addSalesItemRow);
    }
  } catch (error) {
    console.error('显示新建销售记录模态框失败:', error);
    showAlert('显示新建销售记录模态框失败: ' + error.message, 'error');
  }
}

// 添加商品明细行
function addSalesItemRow() {
  const salesItemsBody = document.getElementById('sales-items-body');
  const row = document.createElement('tr');
  
  row.innerHTML = `
    <td><input type="text" class="product-code" style="width: 150px; text-align: center;" required></td>
    <td>
      <select class="size" style="width: 90px; text-align: center;">
        <option value="">请选择</option>
        <option value="1码">1码</option>
        <option value="2码">2码</option>
        <option value="3码">3码</option>
        <option value="4码">4码</option>
        <option value="5码">5码</option>
        <option value="6码">6码</option>
      </select>
    </td>
    <td><input type="number" class="quantity" min="1" value="1" style="width: 80px; text-align: center;" required></td>
    <td><input type="number" class="amount" min="0" step="0.01" style="width: 150px; text-align: center;" required></td>
    <td>
      <button type="button" class="ant-btn ant-btn-danger ant-btn-sm delete-item" style="height: 30px; width: 57px;">
        <i class="anticon anticon-delete"></i> 删除
      </button>
    </td>
  `;
  
  // 添加删除按钮事件
  const deleteButton = row.querySelector('.delete-item');
  deleteButton.addEventListener('click', () => {
    row.remove();
    calculateTotalAmount();
  });
  
  // 添加数量和金额输入事件
  const quantityInput = row.querySelector('.quantity');
  const amountInput = row.querySelector('.amount');
  
  quantityInput.addEventListener('input', calculateTotalAmount);
  amountInput.addEventListener('input', calculateTotalAmount);
  
  salesItemsBody.appendChild(row);
}

// 计算总金额
function calculateTotalAmount() {
  const rows = document.querySelectorAll('#sales-items-body tr');
  let total = 0;
  
  rows.forEach(row => {
    const quantity = parseFloat(row.querySelector('.quantity').value) || 0;
    const amount = parseFloat(row.querySelector('.amount').value) || 0;
    total += quantity * amount;
  });
  
  document.getElementById('total-amount').value = total.toFixed(2);
}

// 保存销售记录
function saveSale(event) {
  // 阻止表单默认提交行为
  if (event) {
    event.preventDefault();
  }
  
  const nameInput = document.getElementById('customer-name');
  const phoneInput = document.getElementById('customer-phone');
  const dateInput = document.getElementById('sale-date');
  const totalAmountInput = document.getElementById('total-amount');
  const customerIdInput = document.getElementById('customer_id');
  
  // 简单验证
  if (!nameInput.value.trim()) {
    showAlert('请输入客户姓名', 'warning');
    nameInput.focus();
    return;
  }
  
  if (!phoneInput.value.trim()) {
    showAlert('请输入客户电话', 'warning');
    phoneInput.focus();
    return;
  }
  
  if (!dateInput.value) {
    showAlert('请选择日期', 'warning');
    dateInput.focus();
    return;
  }
  
  // 验证商品明细
  const salesItems = [];
  const rows = document.querySelectorAll('#sales-items-body tr');
  
  if (rows.length === 0) {
    showAlert('请至少添加一条商品明细', 'warning');
    return;
  }
  
  let hasError = false;
  rows.forEach((row, index) => {
    const productCode = row.querySelector('.product-code').value.trim();
    const size = row.querySelector('.size').value;
    const quantity = parseInt(row.querySelector('.quantity').value) || 0;
    const amount = parseFloat(row.querySelector('.amount').value) || 0;
    
    if (!productCode) {
      showAlert(`第 ${index + 1} 行商品明细的货号不能为空`, 'warning');
      hasError = true;
      return;
    }
    
    if (quantity <= 0) {
      showAlert(`第 ${index + 1} 行商品明细的数量必须大于0`, 'warning');
      hasError = true;
      return;
    }
    
    if (amount <= 0) {
      showAlert(`第 ${index + 1} 行商品明细的金额必须大于0`, 'warning');
      hasError = true;
      return;
    }
    
    salesItems.push({
      product_code: productCode,
      size: size,
      quantity: quantity,
      amount: amount
    });
  });
  
  if (hasError) {
    return;
  }
  
  // 构建销售记录数据
  const saleData = {
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    transaction_number: document.getElementById('transaction-number').value.trim(),
    date: dateInput.value,
    sale_type: document.getElementById('sale-type').value.trim(),
    store: document.getElementById('store').value.trim(),
    salesperson1: document.getElementById('salesperson1').value.trim(),
    salesperson2: document.getElementById('salesperson2').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    total_amount: parseFloat(totalAmountInput.value) || 0,
    sales_items: salesItems
  };
  
  // 如果已选择客户，添加客户ID
  if (customerIdInput.value) {
    saleData.customer_id = customerIdInput.value;
  }
  
  // 打印数据，便于调试
  console.log('准备提交的销售记录数据:', saleData);
  
  // 发送请求前禁用保存按钮
  const saveButton = document.getElementById('save-sale-btn');
  saveButton.disabled = true;
  saveButton.textContent = '保存中...';
  
  fetchWithAuth('/api/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(saleData)
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(text || '创建销售记录失败');
        });
      }
      return response.json();
    })
    .then(data => {
      // 关闭模态框
      const modal = document.getElementById('sale-modal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      // 刷新列表
      loadSales();
      
      // 显示全局通知
      showGlobalNotification('销售记录创建成功');
    })
    .catch(error => {
      console.error('保存销售记录失败:', error);
      showAlert('保存销售记录失败: ' + error.message, 'error');
    })
    .finally(() => {
      // 恢复保存按钮状态
      saveButton.disabled = false;
      saveButton.textContent = '保存';
    });
}

// 显示销售记录详情
function showSaleDetail(saleId) {
  currentSaleId = saleId;
  
  // 先检查并移除任何已存在的模态框，确保不会重复创建
  const existingModal = document.getElementById('sale-detail-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // 创建模态框框架
  const modalHTML = `
    <div id="sale-detail-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">销售详情</h3>
          <span class="close">&times;</span>
        </div>
        <div class="modal-body" id="sale-detail-content">
          <div class="loading-spinner">加载中...</div>
        </div>
        <div class="modal-footer">
          <button class="ant-btn ant-btn-danger" id="delete-sale-btn">删除</button>
          <button class="ant-btn ant-btn" id="close-detail-btn">关闭</button>
        </div>
      </div>
    </div>
  `;
  
  try {
    // 直接将HTML添加到body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 获取并显示模态框
    const modal = document.getElementById('sale-detail-modal');
    if (!modal) {
      throw new Error('无法找到模态框元素');
    }
    
    modal.style.display = 'block';
    modal.classList.add('ant-modal-open');
    
    // 删除按钮事件 - 移动到这里，确保无论API是否成功都可以删除
    const deleteBtn = document.getElementById('delete-sale-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm({
          title: '删除确认',
          content: '确定要删除这条销售记录吗？',
          type: 'danger'
        });

        if (confirmed) {
          deleteSale(saleId); // 直接使用传入的 saleId 参数
          modal.style.display = 'none';
          modal.classList.remove('ant-modal-open');
          if (modal.parentNode) {
            document.body.removeChild(modal);
          }
        }
      });
    }
    
    // 关闭按钮事件
    const closeButton = document.querySelector('#sale-detail-modal .close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
        modal.classList.remove('ant-modal-open');
        if (modal.parentNode) {
          document.body.removeChild(modal);
        }
      });
    }
    
    // 关闭按钮事件
    const closeDetailBtn = document.getElementById('close-detail-btn');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        modal.classList.remove('ant-modal-open');
        if (modal.parentNode) {
          document.body.removeChild(modal);
        }
      });
    }
    
    // 获取销售详情
    fetchWithAuth(`/api/sales/${saleId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('获取销售详情失败');
        }
        return response.json();
      })
      .then(sale => {
        const detailContent = document.getElementById('sale-detail-content');
        if (!detailContent) {
             return; // Stop execution if content element not found
         }

        // 构建商品明细表格HTML
        let itemsHTML = '<p>无商品明细</p>';
        if (sale.items && sale.items.length > 0) {
          itemsHTML = `
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f0f0f0;">
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">货号</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">尺码</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">数量</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">金额</th>
                </tr>
              </thead>
              <tbody>
                ${sale.items.map(item => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${item.product_code || ''}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${item.size || ''}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity || 0}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(item.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
        
        // 构建详情HTML，风格对齐积分详情
        const html = `
          <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <!-- 客户信息 - 第一列 -->
            <div style="flex: 1; min-width: 200px;">
              <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">客户信息</h4>
              <p><strong>姓名:</strong> ${sale.name || ''}</p>
              <p><strong>电话:</strong> ${sale.phone || ''}</p>
            </div>
            <!-- 销售信息 - 第二列 -->
            <div style="flex: 1; min-width: 200px;">
              <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">销售信息</h4>
              <p><strong>流水号:</strong> ${sale.transaction_number || ''}</p>
              <p><strong>日期:</strong> ${formatDate(sale.date) || ''}</p>
              <p><strong>销售类型:</strong> ${sale.sale_type || ''}</p>
              <p><strong>门店:</strong> ${sale.store || ''}</p>
              <p><strong>导购1:</strong> ${sale.salesperson1 || ''}</p>
              <p><strong>导购2:</strong> ${sale.salesperson2 || ''}</p>
              <p><strong>总金额:</strong> ${formatCurrency(sale.total_amount)}</p>
            </div>
          </div>
          <!-- 商品明细表格 - 独占一行 -->
          <div style="width: 100%; margin-bottom: 20px;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">商品明细</h4>
            ${itemsHTML}
          </div>
          <!-- 备注信息 - 独占一行 -->
          <div style="width: 100%;">
            <h4 style="color: #1890ff; font-size: 16px; padding-bottom: 8px; border-bottom: 2px solid #1890ff; margin-bottom: 12px;">备注</h4>
            <p>${sale.notes || '无'}</p>
          </div>
        `;
        
        detailContent.innerHTML = html;
      })
      .catch(error => {
        const detailContent = document.getElementById('sale-detail-content');
        if (detailContent) {
          detailContent.innerHTML = `<div class="error-message">加载详情失败: ${error.message}</div>`;
        }
      });
  } catch (err) {
    showAlert('显示销售记录详情失败: ' + err.message, 'error');
  }
}

// 删除销售记录
function deleteSale(saleId) {
  fetchWithAuth(`/api/sales/${saleId}`, {
    method: 'DELETE'
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('删除销售记录失败');
      }
      return response.json();
    })
    .then(data => {
      showGlobalNotification('销售记录删除成功');
      loadSales();
    })
    .catch(error => {
      console.error('删除销售记录失败:', error);
      showAlert('删除销售记录失败: ' + error.message, 'error');
    });
}

// 格式化日期为 YYYY-MM-DD
function formatDate(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return dateStr;
  }
}

// 格式化货币
function formatCurrency(amount) {
  const num = parseFloat(amount || 0);
  return '¥' + num.toFixed(2);
}

// 添加全局通知函数
function showGlobalNotification(message) {
    let notificationContainer = document.getElementById('global-notification-container');
    
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
    
    notification.innerHTML = `
        <div style="margin-right: 15px;">
            <div style="font-weight: bold; margin-bottom: 5px;">localhost:3001 提示</div>
            <div>${message}</div>
        </div>
        <button class="btn btn-primary" style="min-width: 60px;">确定</button>
    `;
    
    notificationContainer.appendChild(notification);
    
    const confirmBtn = notification.querySelector('button');
    confirmBtn.addEventListener('click', () => {
        notification.remove();
    });
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// 加载客户数据供选择
function loadCustomersForDropdown() {
  console.log('客户搜索功能已更新为动态搜索模式');
}

// 显示客户下拉菜单
function showCustomerDropdown() {
    const searchInput = document.getElementById('customer_search');
    const searchTerm = searchInput.value.trim();
    const dropdown = document.getElementById('customer_dropdown');
    dropdown.innerHTML = '';

    if (searchTerm && !/^\d+$/.test(searchTerm)) {
        dropdown.innerHTML = '<div class="customer-item">请输入电话号码...</div>';
        dropdown.classList.add('active');
        return;
    }

    if (searchTerm.length < 4) {
        dropdown.innerHTML = '<div class="customer-item">输入电话前4位开始搜索...</div>';
        dropdown.classList.add('active');
        return;
    }

    if (searchTerm.length > 11) {
        dropdown.innerHTML = '<div class="customer-item">电话号码格式错误...</div>';
        dropdown.classList.add('active');
        return;
    }

    fetch(`/api/customers/search?q=${encodeURIComponent(searchTerm)}`)
        .then(res => res.json())
        .then(data => {
            let customers = (data && data.data) ? data.data : [];
            
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
            dropdown.innerHTML = '<div class="customer-item">搜索失败...</div>';
            dropdown.classList.add('active');
        });
}

// 选择客户
function selectCustomer(customer) {
  selectedCustomer = customer;
  
  // 更新隐藏输入和显示信息
  document.getElementById('customer_id').value = customer.id;
  document.getElementById('customer_search').value = '';
  document.getElementById('customer-name').value = customer.name;
  document.getElementById('customer-name').readOnly = true;
  document.getElementById('customer-phone').value = customer.phone;
  document.getElementById('customer-phone').readOnly = true;
  
  const selectedInfo = document.getElementById('customer_selected');
  selectedInfo.innerHTML = `
    <div class="selected-customer">
      <strong>${customer.name}</strong> (${customer.phone})
      <button type="button" class="remove-customer-btn">&times;</button>
    </div>
  `;
  selectedInfo.style.display = 'block';
  
  // 添加移除客户按钮事件
  selectedInfo.querySelector('.remove-customer-btn').addEventListener('click', function() {
    resetCustomerSelection();
  });
}

// 重置客户选择
function resetCustomerSelection() {
  selectedCustomer = null;
  document.getElementById('customer_id').value = '';
  document.getElementById('customer_selected').innerHTML = '';
  document.getElementById('customer_selected').style.display = 'none';
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-name').readOnly = false;
  document.getElementById('customer-phone').value = '';
  document.getElementById('customer-phone').readOnly = false;
}

// 显示提示信息
function showAlert(message, type = 'error') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.left = '50%';
    alertDiv.style.transform = 'translateX(-50%)';
    alertDiv.style.padding = '15px';
    alertDiv.style.borderRadius = '4px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '200px';
    alertDiv.style.textAlign = 'center';
    
    if (type === 'error') {
        alertDiv.style.backgroundColor = '#fff2f0';
        alertDiv.style.border = '1px solid #ffccc7';
        alertDiv.style.color = '#cf1322';
    } else {
        alertDiv.style.backgroundColor = '#f6ffed';
        alertDiv.style.border = '1px solid #b7eb8f';
        alertDiv.style.color = '#389e0d';
    }
    
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}