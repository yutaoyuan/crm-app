/**
 * 虚拟滚动组件
 * 用于优化大量数据的表格渲染性能
 */
class VirtualScrollTable {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? 
      document.querySelector(container) : container;
    
    if (!this.container) {
      throw new Error('Container not found');
    }

    this.options = {
      itemHeight: 50, // 每行高度
      buffer: 5, // 缓冲区行数
      threshold: 100, // 启用虚拟滚动的最小数据量
      ...options
    };

    this.data = [];
    this.columns = [];
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalHeight = 0;
    
    this.init();
  }

  // 初始化
  init() {
    this.createElements();
    this.bindEvents();
    this.updateContainerHeight();
  }

  // 创建DOM元素
  createElements() {
    this.container.innerHTML = '';
    this.container.style.cssText = `
      position: relative;
      overflow: auto;
      height: 100%;
    `;

    // 滚动容器
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.style.cssText = `
      height: 100%;
      overflow-y: auto;
      overflow-x: auto;
    `;

    // 总高度占位容器
    this.totalContainer = document.createElement('div');
    this.totalContainer.style.cssText = `
      position: relative;
      width: 100%;
    `;

    // 可见内容容器
    this.visibleContainer = document.createElement('div');
    this.visibleContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    `;

    // 表格容器
    this.tableContainer = document.createElement('div');
    this.tableContainer.style.cssText = `
      width: 100%;
      min-width: max-content;
    `;

    // 表格
    this.table = document.createElement('table');
    this.table.className = 'ant-table-content virtual-scroll-table';
    this.table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    `;

    // 表头
    this.thead = document.createElement('thead');
    this.tbody = document.createElement('tbody');
    
    this.table.appendChild(this.thead);
    this.table.appendChild(this.tbody);
    this.tableContainer.appendChild(this.table);
    this.visibleContainer.appendChild(this.tableContainer);
    this.totalContainer.appendChild(this.visibleContainer);
    this.scrollContainer.appendChild(this.totalContainer);
    this.container.appendChild(this.scrollContainer);
  }

  // 绑定事件
  bindEvents() {
    this.scrollContainer.addEventListener('scroll', () => {
      this.handleScroll();
    });

    window.addEventListener('resize', () => {
      this.updateContainerHeight();
      this.render();
    });
  }

  // 处理滚动
  handleScroll() {
    const scrollTop = this.scrollContainer.scrollTop;
    if (Math.abs(scrollTop - this.scrollTop) < this.options.itemHeight / 2) {
      return; // 滚动距离太小，不更新
    }

    this.scrollTop = scrollTop;
    this.updateVisibleRange();
    this.renderVisibleItems();
  }

  // 更新容器高度
  updateContainerHeight() {
    this.containerHeight = this.scrollContainer.clientHeight;
  }

  // 设置列配置
  setColumns(columns) {
    this.columns = columns;
    this.renderHeader();
  }

  // 设置数据
  setData(data) {
    this.data = data;
    this.totalHeight = data.length * this.options.itemHeight;
    this.totalContainer.style.height = `${this.totalHeight}px`;
    
    // 如果数据量小于阈值，使用普通渲染
    if (data.length < this.options.threshold) {
      this.renderAll();
    } else {
      this.updateVisibleRange();
      this.renderVisibleItems();
    }
  }

  // 渲染表头
  renderHeader() {
    this.thead.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    this.columns.forEach(column => {
      const th = document.createElement('th');
      th.textContent = column.title || column.key;
      th.style.cssText = `
        padding: 12px 16px;
        background-color: #fafafa;
        border-bottom: 1px solid #f0f0f0;
        text-align: left;
        font-weight: 500;
        position: sticky;
        top: 0;
        z-index: 10;
        ${column.width ? `width: ${column.width}px;` : ''}
        ${column.minWidth ? `min-width: ${column.minWidth}px;` : ''}
      `;
      
      // 添加排序功能
      if (column.sortable) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          this.handleSort(column.key);
        });
      }
      
      headerRow.appendChild(th);
    });
    
    this.thead.appendChild(headerRow);
  }

  // 更新可见范围
  updateVisibleRange() {
    const visibleItemCount = Math.ceil(this.containerHeight / this.options.itemHeight);
    const startIndex = Math.floor(this.scrollTop / this.options.itemHeight);
    
    this.visibleStart = Math.max(0, startIndex - this.options.buffer);
    this.visibleEnd = Math.min(
      this.data.length,
      startIndex + visibleItemCount + this.options.buffer
    );
  }

  // 渲染可见项目
  renderVisibleItems() {
    const visibleData = this.data.slice(this.visibleStart, this.visibleEnd);
    this.renderRows(visibleData, this.visibleStart);
    
    // 更新可见容器位置
    const offsetY = this.visibleStart * this.options.itemHeight;
    this.visibleContainer.style.transform = `translateY(${offsetY}px)`;
  }

  // 渲染所有数据（用于小数据量）
  renderAll() {
    this.renderRows(this.data, 0);
    this.visibleContainer.style.transform = 'translateY(0px)';
  }

  // 渲染行
  renderRows(data, startIndex) {
    this.tbody.innerHTML = '';
    
    data.forEach((item, index) => {
      const row = document.createElement('tr');
      row.style.height = `${this.options.itemHeight}px`;
      row.className = 'virtual-table-row';
      
      // 添加斑马纹
      if ((startIndex + index) % 2 === 1) {
        row.style.backgroundColor = '#fafafa';
      }

      // 添加hover效果
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#e6f7ff';
      });
      
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = (startIndex + index) % 2 === 1 ? '#fafafa' : '';
      });

      this.columns.forEach(column => {
        const cell = document.createElement('td');
        cell.style.cssText = `
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        `;

        // 渲染单元格内容
        if (column.render && typeof column.render === 'function') {
          const content = column.render(item[column.key], item, startIndex + index);
          if (typeof content === 'string') {
            cell.innerHTML = content;
          } else {
            cell.appendChild(content);
          }
        } else {
          cell.textContent = item[column.key] || '';
        }

        row.appendChild(cell);
      });

      // 添加行点击事件
      if (this.options.onRowClick) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          this.options.onRowClick(item, startIndex + index);
        });
      }

      this.tbody.appendChild(row);
    });
  }

  // 处理排序
  handleSort(columnKey) {
    if (!this.sortConfig) {
      this.sortConfig = {};
    }

    const currentOrder = this.sortConfig[columnKey];
    let newOrder;
    
    if (!currentOrder || currentOrder === 'desc') {
      newOrder = 'asc';
    } else {
      newOrder = 'desc';
    }

    // 重置其他列的排序
    this.sortConfig = { [columnKey]: newOrder };

    // 排序数据
    this.data.sort((a, b) => {
      const aValue = a[columnKey];
      const bValue = b[columnKey];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      if (typeof aValue === 'string') {
        const result = aValue.localeCompare(bValue);
        return newOrder === 'asc' ? result : -result;
      } else {
        const result = aValue - bValue;
        return newOrder === 'asc' ? result : -result;
      }
    });

    // 重新渲染
    this.scrollContainer.scrollTop = 0;
    this.scrollTop = 0;
    this.render();

    // 触发排序事件
    if (this.options.onSort) {
      this.options.onSort(columnKey, newOrder);
    }
  }

  // 重新渲染
  render() {
    if (this.data.length < this.options.threshold) {
      this.renderAll();
    } else {
      this.updateVisibleRange();
      this.renderVisibleItems();
    }
  }

  // 滚动到指定位置
  scrollTo(index) {
    const scrollTop = index * this.options.itemHeight;
    this.scrollContainer.scrollTop = scrollTop;
  }

  // 滚动到顶部
  scrollToTop() {
    this.scrollTo(0);
  }

  // 滚动到底部
  scrollToBottom() {
    this.scrollTo(this.data.length - 1);
  }

  // 获取当前可见的数据索引范围
  getVisibleRange() {
    return {
      start: this.visibleStart,
      end: this.visibleEnd,
      total: this.data.length
    };
  }

  // 更新单行数据
  updateRow(index, newData) {
    if (index >= 0 && index < this.data.length) {
      this.data[index] = { ...this.data[index], ...newData };
      
      // 如果该行在可见范围内，重新渲染
      if (index >= this.visibleStart && index < this.visibleEnd) {
        this.render();
      }
    }
  }

  // 添加数据
  addData(newData) {
    if (Array.isArray(newData)) {
      this.data.push(...newData);
    } else {
      this.data.push(newData);
    }
    
    this.totalHeight = this.data.length * this.options.itemHeight;
    this.totalContainer.style.height = `${this.totalHeight}px`;
    this.render();
  }

  // 移除数据
  removeData(index) {
    if (index >= 0 && index < this.data.length) {
      this.data.splice(index, 1);
      this.totalHeight = this.data.length * this.options.itemHeight;
      this.totalContainer.style.height = `${this.totalHeight}px`;
      this.render();
    }
  }

  // 清空数据
  clearData() {
    this.data = [];
    this.totalHeight = 0;
    this.totalContainer.style.height = '0px';
    this.tbody.innerHTML = '';
  }

  // 获取性能指标
  getPerformanceMetrics() {
    return {
      totalItems: this.data.length,
      visibleItems: this.visibleEnd - this.visibleStart,
      renderRatio: (this.visibleEnd - this.visibleStart) / this.data.length,
      isVirtualized: this.data.length >= this.options.threshold
    };
  }

  // 销毁组件
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// 创建便捷的表格创建函数
window.createVirtualTable = function(container, options = {}) {
  return new VirtualScrollTable(container, options);
};

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VirtualScrollTable;
}