/**
 * 骨架屏加载组件
 * 在数据加载时显示骨架屏，提升用户体验
 */
class Skeleton {
  constructor() {
    this.addSkeletonStyles();
  }

  // 添加骨架屏CSS样式
  addSkeletonStyles() {
    if (document.getElementById('skeleton-styles')) return;

    const style = document.createElement('style');
    style.id = 'skeleton-styles';
    style.textContent = `
      .skeleton {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: skeleton-loading 1.5s infinite;
      }

      @keyframes skeleton-loading {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      .skeleton-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
      }

      .skeleton-line {
        height: 16px;
        border-radius: 4px;
        margin: 4px 0;
      }

      .skeleton-line.short {
        width: 60%;
      }

      .skeleton-line.medium {
        width: 80%;
      }

      .skeleton-line.long {
        width: 100%;
      }

      .skeleton-button {
        width: 80px;
        height: 32px;
        border-radius: 4px;
      }

      .skeleton-table-row {
        display: table-row;
        width: 100%;
      }

      .skeleton-table-cell {
        display: table-cell;
        padding: 12px 16px;
        vertical-align: middle;
      }

      .skeleton-card {
        border: 1px solid #f0f0f0;
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
      }

      .skeleton-text {
        display: inline-block;
        height: 14px;
        border-radius: 4px;
      }

      .skeleton-title {
        height: 20px;
        border-radius: 4px;
        margin-bottom: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  // 创建表格骨架屏
  createTableSkeleton(rows = 5, columns = 6) {
    const table = document.createElement('table');
    table.className = 'ant-table-content';
    table.style.width = '100%';

    // 表头骨架
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let i = 0; i < columns; i++) {
      const th = document.createElement('th');
      th.style.padding = '12px 16px';
      const skeletonLine = document.createElement('div');
      skeletonLine.className = 'skeleton skeleton-line short';
      th.appendChild(skeletonLine);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 表格内容骨架
    const tbody = document.createElement('tbody');
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('tr');
      for (let j = 0; j < columns; j++) {
        const td = document.createElement('td');
        td.style.padding = '12px 16px';
        const skeletonLine = document.createElement('div');
        skeletonLine.className = `skeleton skeleton-line ${this.getRandomWidth()}`;
        td.appendChild(skeletonLine);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
  }

  // 创建卡片骨架屏
  createCardSkeleton() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';

    // 标题
    const title = document.createElement('div');
    title.className = 'skeleton skeleton-title medium';
    card.appendChild(title);

    // 内容行
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = `skeleton skeleton-line ${this.getRandomWidth()}`;
      card.appendChild(line);
    }

    return card;
  }

  // 创建列表骨架屏
  createListSkeleton(items = 5) {
    const list = document.createElement('div');
    list.style.padding = '16px';

    for (let i = 0; i < items; i++) {
      const item = document.createElement('div');
      item.style.cssText = 'display: flex; align-items: center; margin-bottom: 16px; padding: 12px 0; border-bottom: 1px solid #f0f0f0;';

      // 头像
      const avatar = document.createElement('div');
      avatar.className = 'skeleton skeleton-avatar';
      avatar.style.marginRight = '12px';

      // 内容
      const content = document.createElement('div');
      content.style.flex = '1';
      
      const title = document.createElement('div');
      title.className = 'skeleton skeleton-line medium';
      title.style.marginBottom = '8px';
      
      const subtitle = document.createElement('div');
      subtitle.className = 'skeleton skeleton-line short';

      content.appendChild(title);
      content.appendChild(subtitle);

      // 操作按钮
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      
      for (let j = 0; j < 2; j++) {
        const button = document.createElement('div');
        button.className = 'skeleton skeleton-button';
        button.style.marginLeft = '8px';
        actions.appendChild(button);
      }

      item.appendChild(avatar);
      item.appendChild(content);
      item.appendChild(actions);
      list.appendChild(item);
    }

    return list;
  }

  // 创建表单骨架屏
  createFormSkeleton(fields = 6) {
    const form = document.createElement('div');
    form.style.padding = '16px';

    for (let i = 0; i < fields; i++) {
      const field = document.createElement('div');
      field.style.marginBottom = '16px';

      // 标签
      const label = document.createElement('div');
      label.className = 'skeleton skeleton-line short';
      label.style.width = '80px';
      label.style.marginBottom = '8px';

      // 输入框
      const input = document.createElement('div');
      input.className = 'skeleton skeleton-line long';
      input.style.height = '32px';

      field.appendChild(label);
      field.appendChild(input);
      form.appendChild(field);
    }

    return form;
  }

  // 获取随机宽度类
  getRandomWidth() {
    const widths = ['short', 'medium', 'long'];
    return widths[Math.floor(Math.random() * widths.length)];
  }

  // 显示骨架屏
  show(container, type = 'table', options = {}) {
    if (typeof container === 'string') {
      container = document.getElementById(container) || document.querySelector(container);
    }

    if (!container) {
      console.warn('Skeleton: 容器元素未找到');
      return;
    }

    // 保存原始内容
    container.dataset.originalContent = container.innerHTML;

    let skeleton;
    switch (type) {
      case 'table':
        skeleton = this.createTableSkeleton(options.rows, options.columns);
        break;
      case 'card':
        skeleton = this.createCardSkeleton();
        break;
      case 'list':
        skeleton = this.createListSkeleton(options.items);
        break;
      case 'form':
        skeleton = this.createFormSkeleton(options.fields);
        break;
      default:
        skeleton = this.createTableSkeleton();
    }

    container.innerHTML = '';
    container.appendChild(skeleton);
    container.classList.add('skeleton-container');
  }

  // 隐藏骨架屏
  hide(container) {
    if (typeof container === 'string') {
      container = document.getElementById(container) || document.querySelector(container);
    }

    if (!container) {
      console.warn('Skeleton: 容器元素未找到');
      return;
    }

    if (container.dataset.originalContent !== undefined) {
      container.innerHTML = container.dataset.originalContent;
      delete container.dataset.originalContent;
    }

    container.classList.remove('skeleton-container');
  }

  // 快捷方法：表格骨架屏
  showTable(container, rows = 5, columns = 6) {
    this.show(container, 'table', { rows, columns });
  }

  // 快捷方法：列表骨架屏
  showList(container, items = 5) {
    this.show(container, 'list', { items });
  }

  // 快捷方法：表单骨架屏
  showForm(container, fields = 6) {
    this.show(container, 'form', { fields });
  }
}

// 创建全局骨架屏实例
window.skeleton = new Skeleton();

// 导出类（如果需要）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Skeleton;
}