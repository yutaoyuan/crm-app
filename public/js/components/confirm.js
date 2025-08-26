// 确认框组件
class Confirm {
    constructor() {
        this.init();
    }

    init() {
        // 创建确认框容器
        this.container = document.createElement('div');
        this.container.id = 'custom-confirm-container';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;
        document.body.appendChild(this.container);

        // 创建确认框主体
        this.modal = document.createElement('div');
        this.modal.style.cssText = `
            background-color: white;
            border-radius: 8px;
            padding: 24px;
            width: 400px;
            max-width: 90%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            animation: confirmFadeIn 0.3s ease;
        `;

        // 创建标题
        this.title = document.createElement('h3');
        this.title.style.cssText = `
            margin: 0 0 16px 0;
            color: #333;
            font-size: 18px;
            font-weight: 500;
        `;

        // 创建内容
        this.content = document.createElement('div');
        this.content.style.cssText = `
            margin-bottom: 24px;
            color: #666;
            font-size: 14px;
            line-height: 1.5;
        `;

        // 创建按钮容器
        this.buttonContainer = document.createElement('div');
        this.buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        `;

        // 创建取消按钮
        this.cancelButton = document.createElement('button');
        this.cancelButton.className = 'btn btn-default';
        this.cancelButton.textContent = '取消';
        this.cancelButton.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            background: white;
            color: #666;
            cursor: pointer;
            transition: all 0.3s;
        `;

        // 创建确认按钮
        this.confirmButton = document.createElement('button');
        this.confirmButton.className = 'btn btn-primary';
        this.confirmButton.textContent = '确定';
        this.confirmButton.style.cssText = `
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: #1890ff;
            color: white;
            cursor: pointer;
            transition: all 0.3s;
        `;

        // 添加按钮悬停效果
        this.cancelButton.onmouseover = () => {
            this.cancelButton.style.backgroundColor = '#f5f5f5';
        };
        this.cancelButton.onmouseout = () => {
            this.cancelButton.style.backgroundColor = 'white';
        };
        this.confirmButton.onmouseover = () => {
            this.confirmButton.style.backgroundColor = '#40a9ff';
        };
        this.confirmButton.onmouseout = () => {
            this.confirmButton.style.backgroundColor = '#1890ff';
        };

        // 组装确认框
        this.buttonContainer.appendChild(this.cancelButton);
        this.buttonContainer.appendChild(this.confirmButton);
        this.modal.appendChild(this.title);
        this.modal.appendChild(this.content);
        this.modal.appendChild(this.buttonContainer);
        this.container.appendChild(this.modal);

        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes confirmFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    show(options = {}) {
        return new Promise((resolve) => {
            const {
                title = '确认',
                content = '确定要执行此操作吗？',
                confirmText = '确定',
                cancelText = '取消',
                type = 'default' // default, danger
            } = options;

            // 设置内容
            this.title.textContent = title;
            this.content.textContent = content;
            this.confirmButton.textContent = confirmText;
            this.cancelButton.textContent = cancelText;

            // 设置按钮样式
            if (type === 'danger') {
                this.confirmButton.style.backgroundColor = '#ff4d4f';
                this.confirmButton.onmouseover = () => {
                    this.confirmButton.style.backgroundColor = '#ff7875';
                };
                this.confirmButton.onmouseout = () => {
                    this.confirmButton.style.backgroundColor = '#ff4d4f';
                };
            } else {
                this.confirmButton.style.backgroundColor = '#1890ff';
                this.confirmButton.onmouseover = () => {
                    this.confirmButton.style.backgroundColor = '#40a9ff';
                };
                this.confirmButton.onmouseout = () => {
                    this.confirmButton.style.backgroundColor = '#1890ff';
                };
            }

            // 显示确认框
            this.container.style.display = 'flex';

            // 绑定事件
            const handleConfirm = () => {
                this.hide();
                resolve(true);
            };

            const handleCancel = () => {
                this.hide();
                resolve(false);
            };

            const handleKeyDown = (e) => {
                if (e.key === 'Enter') {
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    handleCancel();
                }
            };

            this.confirmButton.onclick = handleConfirm;
            this.cancelButton.onclick = handleCancel;
            this.container.onclick = (e) => {
                if (e.target === this.container) {
                    handleCancel();
                }
            };
            document.addEventListener('keydown', handleKeyDown);

            // 清理事件监听
            this.cleanup = () => {
                document.removeEventListener('keydown', handleKeyDown);
                this.confirmButton.onclick = null;
                this.cancelButton.onclick = null;
                this.container.onclick = null;
            };
        });
    }

    hide() {
        this.container.style.display = 'none';
        if (this.cleanup) {
            this.cleanup();
        }
    }
}

// 创建全局单例
const confirm = new Confirm();

// 导出确认框函数
window.showConfirm = (options) => {
    return confirm.show(options);
}; 