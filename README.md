# keepgogogaga
养鸽系统（只有登录+增删改查笼子功能）
项目概览：

```markdown
# 🕊️ 鸽子养殖后台管理系统 (keepgoogoo)

> 一个**纯 Python 标准库 + 原生 HTML/JS/CSS** 搭建的鸽子养殖鸽仓网格化管理工具，零外部依赖，开箱即用。

## 📦 项目定位

这是一套面向鸽子养殖场日常管理的轻量级后台系统。核心概念是 **「仓库 → 排 → 列 → 笼」** 四级层级结构，通过网页可视化界面进行增删查改，替代传统的纸质/Excel 台账。

## 🏗️ 技术架构

```
keepgoogoo/
├── server.py            # 后端：纯标准库 HTTP 服务器 + RESTful API
├── data.json            # 业务数据存储（JSON 文件）
├── users.json           # 用户密码存储（SHA256 + 随机盐哈希）
└── static/
    ├── index.html       # 前端页面（单页应用）
    ├── app.js           # 前端逻辑（原生 JS，前端分页）
    └── style.css        # 样式（深色侧边栏 + 浅色内容区）
```

| 层 | 技术选型 | 说明 |
|---|---|---|
| 后端 | Python 3 stdlib (`http.server`) | 零 pip 依赖，直接跑 |
| 前端 | 原生 HTML/CSS/JS | 无 React/Vue，无 node_modules |
| 数据 | JSON 文件 | 原子写入，单文件即可持久化 |
| 认证 | Token-based Session | 内存 session + Cookie/Bearer 双通道 |

## 🚀 快速启动

```bash
# 1. 进入项目目录
cd keepgoogoo

# 2. 启动服务器（默认 8080 端口）
python server.py

# 3. 自定义端口
python server.py 3000

# 4. 浏览器打开
# http://localhost:8080
```

**环境要求：** Python 3.6+（无需任何 pip 安装）

## 🔐 用户认证

系统内置了注册/登录/登出功能：

- 首次使用需要**注册账号**（用户名 2-30 字符，密码至少 4 位）
- 密码使用 **SHA-256 + 16 字节随机盐** 哈希存储，不存明文
- Session 有效期 24 小时，过期自动跳转登录页

## 📊 数据模型

```
仓库 (Warehouse)
  └── 排 (Row)
       └── 列 (Column)
            └── 笼 (Cage)
```

四级嵌套结构，所有增删操作均为**级联删除**——删除仓库会连带删除其下所有排、列、笼。

## 🔧 API 接口

所有 API 均返回 JSON，格式为 `{"code": 0, "data": ...}` 或 `{"code": -1, "msg": "..."}`。

### 认证接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/register` | 注册 `{username, password}` |
| POST | `/api/login` | 登录 `{username, password}` |
| POST | `/api/logout` | 登出 |
| GET | `/api/session` | 获取当前 session 信息 |

### 仓库接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/warehouses` | 获取仓库列表（含统计信息） |
| POST | `/api/warehouses` | 添加仓库 `{name}` |
| DELETE | `/api/warehouses/:wh_id` | 删除仓库（级联删除） |

### 排接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/warehouses/:wh_id/rows` | 获取排列表 |
| POST | `/api/warehouses/:wh_id/rows` | 添加排 `{row_number}` |
| DELETE | `/api/warehouses/:wh_id/rows/:row_id` | 删除排（级联删除） |

### 列接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/warehouses/:wh_id/rows/:row_id/columns` | 获取列列表 |
| POST | `/api/warehouses/:wh_id/rows/:row_id/columns` | 添加列 `{col_number}` |
| DELETE | `/api/warehouses/:wh_id/rows/:row_id/columns/:col_id` | 删除列（级联删除） |

### 笼接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages` | 获取笼列表 |
| POST | `/api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages` | 添加笼 `{cage_number}` |
| DELETE | `/api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages/:cage_id` | 删除笼 |

## 🎨 界面功能

- **深色侧边栏导航**：系统首页 / 鸽仓信息列表 / 导出预放仔名单 / 导出待处理异常名单
- **面包屑导航**：支持层级回退，一目了然当前所在位置
- **四级弹窗管理**：仓库列表 → 排管理弹窗 → 列管理弹窗 → 笼管理弹窗
- **前端分页 + 搜索**：表格内置搜索过滤和分页
- **Toast 提示 + 确认弹窗**：操作反馈友好

## 💾 数据存储说明

- `data.json`：业务数据，自动创建，程序负责原子写入（先写 `.tmp` 再 rename）
- `users.json`：用户数据，同样原子写入
- 所有数据均在进程启动目录，备份只需复制这两个 `.json` 文件

## ⚙️ 设计特点

1. **零外部依赖**：后端只用 Python 标准库，前端只写原生三件套，clone 即跑
2. **原子写入**：数据文件先写临时文件再重命名，避免写入过程中崩溃导致数据损坏
3. **全级联删除**：业务上符合「仓库→排→列→笼」的强归属关系
4. **内存 Session**：无 Redis/DB 依赖，单机轻量部署
5. **CORS 全放行**：开发调试阶段不做限制，生产环境可按需收紧

## ⚠️ 注意事项

- 当前 session 存储在**内存**中，重启服务后所有用户需重新登录
- 适合**单机内网**场景，未做并发锁（`HTTPServer` 默认多线程可处理轻度并发读写冲突）
- 生产部署建议前面套一层 Nginx 做 TLS + 反向代理

**大量使用ai，注意甄别**
