// 当DOM加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginButton = document.getElementById('login-button');
  const errorMessage = document.getElementById('error-message');
  
  // 设置默认账号密码
  usernameInput.value = 'zhaochunyan';
  passwordInput.value = 'zcy@123456';
  
  // 禁用自动登录检查
  // checkLoginStatus();
  
  // 为表单添加提交事件
  loginForm.addEventListener('submit', handleLogin);
  
  // 为登录按钮添加点击事件（作为备用）
  loginButton.addEventListener('click', handleLogin);
  
  // 检查登录状态函数 - 只在需要时手动调用
  function checkLoginStatus() {
    fetch('/api/auth/status')
      .then(response => response.json())
      .then(data => {
        // 只有当明确返回已登录状态时才重定向
        if (data.isLoggedIn === true || data.authenticated === true) {
          // 已登录，重定向到客户管理页面
          window.location.href = '/pages/customers.html';
        }
      })
      .catch(error => {
        console.error('检查登录状态失败:', error);
        // 失败时不做任何重定向，保持在登录页面
      });
  }
  
  // 登录处理函数
  function handleLogin(e) {
    // 阻止表单的默认提交行为
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    // 获取用户名和密码
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    // 表单验证
    if (!username || !password) {
      showError('用户名和密码不能为空');
      return;
    }
    
    // 禁用登录按钮，防止重复提交
    loginButton.disabled = true;
    loginButton.textContent = '登录中...';
    
    // 发送登录请求
    fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // 确保发送会话cookie
      credentials: 'include',
      body: JSON.stringify({ username, password })
    })
      .then(response => {
        if (!response.ok) {
          throw response;
        }
        return response.json();
      })
      .then(data => {
        console.log('登录成功，存储会话信息');
        
        // 保存一个登录标记到localStorage，用于认证检查
        localStorage.setItem('token', 'loggedIn');
        localStorage.setItem('username', username);
        
        // 登录成功，跳转到客户管理页面
        window.location.href = '/pages/customers.html';
      })
      .catch(error => {
        // 根据错误状态码显示不同的错误信息
        if (error.status === 401) {
          showError('用户名或密码错误');
        } else {
          showError('登录失败，请稍后重试');
        }
        
        // 重置按钮状态
        loginButton.disabled = false;
        loginButton.textContent = '登录';
      });
  }
  
  // 显示错误信息
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    // 5秒后自动隐藏错误信息
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  }
}); 