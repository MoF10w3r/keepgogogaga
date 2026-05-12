#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
鸽子养殖后台管理系统 - 后端服务
纯 Python 标准库实现，零外部依赖
数据存储：JSON 文件
API 风格：RESTful JSON

启动方式: python server.py [端口]
默认端口: 8080
"""

import json
import os
import sys
import hashlib
import secrets
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import re
import threading
import time

# ==================== 配置 ====================
DATA_FILE = "data.json"
USERS_FILE = "users.json"
SESSION_EXPIRE = 86400  # 24小时过期
DEFAULT_PORT = 8080

# 内存 session 存储: token -> {username, expire_time}
_sessions = {}
_sessions_lock = threading.Lock()

# ==================== 数据操作 ====================

def load_data():
    """加载数据文件，不存在则返回空结构"""
    if not os.path.exists(DATA_FILE):
        return {"warehouses": [], "next_ids": {"warehouse": 1, "row": 1, "column": 1, "cage": 1}}
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # 确保有 next_ids 字段
    if "next_ids" not in data:
        data["next_ids"] = {"warehouse": 1, "row": 1, "column": 1, "cage": 1}
    # 确保 warehouses 列表存在
    if "warehouses" not in data:
        data["warehouses"] = []
    return data


def save_data(data):
    """保存数据到文件（原子写入）"""
    tmp_file = DATA_FILE + ".tmp"
    with open(tmp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # Windows 下原子替换
    if os.path.exists(DATA_FILE):
        os.remove(DATA_FILE)
    os.rename(tmp_file, DATA_FILE)


def _next_id(data, entity_type):
    """获取下一个自增 ID"""
    nid = data["next_ids"].get(entity_type, 1)
    data["next_ids"][entity_type] = nid + 1
    return nid


# ==================== 用户认证 ====================

def _hash_password(password, salt=None):
    """SHA256 哈希密码 + 随机盐"""
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return f"{salt}${h}"


def _verify_password(password, stored):
    """验证密码"""
    salt, _ = stored.split('$', 1)
    return _hash_password(password, salt) == stored


def load_users():
    """加载用户数据"""
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_users(users):
    """保存用户数据"""
    tmp = USERS_FILE + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
    if os.path.exists(USERS_FILE):
        os.remove(USERS_FILE)
    os.rename(tmp, USERS_FILE)


def create_session(username):
    """创建 session，返回 token"""
    token = secrets.token_hex(32)
    with _sessions_lock:
        _sessions[token] = {
            "username": username,
            "expire": time.time() + SESSION_EXPIRE
        }
    return token


def get_session(token):
    """获取 session 中的用户名，过期返回 None"""
    with _sessions_lock:
        s = _sessions.get(token)
        if s is None:
            return None
        if time.time() > s["expire"]:
            del _sessions[token]
            return None
        return s["username"]


def destroy_session(token):
    """销毁 session"""
    with _sessions_lock:
        _sessions.pop(token, None)


# ==================== 业务逻辑 ====================

def get_all_warehouses(data):
    """获取所有仓库及其统计信息"""
    result = []
    for wh in data.get("warehouses", []):
        rows = wh.get("rows", [])
        total_rows = len(rows)
        total_columns = sum(len(r.get("columns", [])) for r in rows)
        total_cages = 0
        for r in rows:
            for c in r.get("columns", []):
                total_cages += len(c.get("cages", []))
        result.append({
            "id": wh["id"],
            "name": wh.get("name", ""),
            "total_rows": total_rows,
            "total_columns": total_columns,
            "total_cages": total_cages
        })
    return result


def add_warehouse(data, name):
    """添加仓库"""
    wh_id = _next_id(data, "warehouse")
    warehouse = {
        "id": wh_id,
        "name": name.strip(),
        "rows": []
    }
    data.setdefault("warehouses", []).append(warehouse)
    save_data(data)
    return warehouse


def delete_warehouse(data, wh_id):
    """删除仓库（级联删除排、列、笼）"""
    warehouses = data.get("warehouses", [])
    new_whs = [wh for wh in warehouses if wh["id"] != wh_id]
    if len(new_whs) == len(warehouses):
        return None  # 未找到
    data["warehouses"] = new_whs
    save_data(data)
    return True


def get_warehouse_detail(data, wh_id):
    """获取仓库详情（含所有排）"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            rows = wh.get("rows", [])
            result = []
            for r in rows:
                cols = r.get("columns", [])
                total_cols = len(cols)
                total_cages_per_col = 0
                for c in cols:
                    total_cages_per_col += len(c.get("cages", []))
                result.append({
                    "id": r["id"],
                    "row_number": r.get("row_number", 0),
                    "total_columns": total_cols,
                    "cages_per_column": total_cages_per_col // max(total_cols, 1),
                    "total_cages": total_cages_per_col
                })
            return result
    return None


def add_row(data, wh_id, row_number):
    """添加排"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            row_id = _next_id(data, "row")
            row_obj = {
                "id": row_id,
                "row_number": row_number,
                "columns": []
            }
            wh.setdefault("rows", []).append(row_obj)
            save_data(data)
            return row_obj
    return None


def delete_row(data, wh_id, row_id):
    """删除排（级联删除列、笼）"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            rows = wh.get("rows", [])
            new_rows = [r for r in rows if r["id"] != row_id]
            if len(new_rows) == len(rows):
                return None
            wh["rows"] = new_rows
            save_data(data)
            return True
    return None


def get_row_detail(data, wh_id, row_id):
    """获取排详情（含所有列）"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    cols = r.get("columns", [])
                    result = []
                    for c in cols:
                        cages = c.get("cages", [])
                        result.append({
                            "id": c["id"],
                            "col_number": c.get("col_number", 0),
                            "total_cages": len(cages),
                            "cages": cages
                        })
                    return result
    return None


def add_column(data, wh_id, row_id, col_number):
    """添加列"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    col_id = _next_id(data, "column")
                    col_obj = {
                        "id": col_id,
                        "col_number": col_number,
                        "cages": []
                    }
                    r.setdefault("columns", []).append(col_obj)
                    save_data(data)
                    return col_obj
    return None


def delete_column(data, wh_id, row_id, col_id):
    """删除列（级联删除笼）"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    cols = r.get("columns", [])
                    new_cols = [c for c in cols if c["id"] != col_id]
                    if len(new_cols) == len(cols):
                        return None
                    r["columns"] = new_cols
                    save_data(data)
                    return True
    return None


def get_column_detail(data, wh_id, row_id, col_id):
    """获取列详情（含所有笼）"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    for c in r.get("columns", []):
                        if c["id"] == col_id:
                            return c.get("cages", [])
    return None


def add_cage(data, wh_id, row_id, col_id, cage_number):
    """添加笼"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    for c in r.get("columns", []):
                        if c["id"] == col_id:
                            cage_id = _next_id(data, "cage")
                            cage_obj = {
                                "id": cage_id,
                                "cage_number": cage_number
                            }
                            c.setdefault("cages", []).append(cage_obj)
                            save_data(data)
                            return cage_obj
    return None


def delete_cage(data, wh_id, row_id, col_id, cage_id):
    """删除笼"""
    for wh in data.get("warehouses", []):
        if wh["id"] == wh_id:
            for r in wh.get("rows", []):
                if r["id"] == row_id:
                    for c in r.get("columns", []):
                        if c["id"] == col_id:
                            cages = c.get("cages", [])
                            new_cages = [cg for cg in cages if cg["id"] != cage_id]
                            if len(new_cages) == len(cages):
                                return None
                            c["cages"] = new_cages
                            save_data(data)
                            return True
    return None


# ==================== HTTP 处理器 ====================

class PigeonHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        """自定义日志格式"""
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def _send_json(self, status_code, data):
        """发送 JSON 响应"""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        """读取请求体"""
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            raw = self.rfile.read(content_length)
            return json.loads(raw.decode('utf-8'))
        return {}

    def _get_token(self):
        """从 Cookie 或 Authorization 头提取 token"""
        # 优先从 Cookie 读取
        cookie = self.headers.get('Cookie', '')
        for item in cookie.split(';'):
            item = item.strip()
            if item.startswith('token='):
                return item[6:]
        # 其次从 Authorization header
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:]
        return None

    def _require_auth(self):
        """认证检查，未登录返回 None，已登录返回用户名"""
        token = self._get_token()
        if not token:
            self._send_json(401, {"code": -1, "msg": "请先登录"})
            return None
        username = get_session(token)
        if not username:
            self._send_json(401, {"code": -1, "msg": "登录已过期，请重新登录"})
            return None
        return username

    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """处理 GET 请求"""
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        try:
            # ---- 用户认证 API（无需登录）----

            # GET /api/session - 获取当前 session 信息
            if path == '/api/session':
                token = self._get_token()
                username = get_session(token) if token else None
                if username:
                    self._send_json(200, {"code": 0, "data": {"username": username}})
                else:
                    self._send_json(200, {"code": 0, "data": None})
                return

            # ---- 静态文件（无需登录）----
            if not path.startswith('/api'):
                self._serve_static(path)
                return

            # ---- 业务 API（需登录）----

            if not self._require_auth():
                return

            # GET /api/warehouses - 获取仓库列表
            if path == '/api/warehouses':
                data = load_data()
                self._send_json(200, {"code": 0, "data": get_all_warehouses(data)})
                return

            # GET /api/warehouses/:wh_id/rows - 获取排列表
            match = re.match(r'^/api/warehouses/(\d+)/rows$', path)
            if match:
                wh_id = int(match.group(1))
                data = load_data()
                detail = get_warehouse_detail(data, wh_id)
                if detail is not None:
                    self._send_json(200, {"code": 0, "data": detail})
                else:
                    self._send_json(404, {"code": -1, "msg": "仓库不存在"})
                return

            # GET /api/warehouses/:wh_id/rows/:row_id/columns - 获取列列表
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                data = load_data()
                detail = get_row_detail(data, wh_id, row_id)
                if detail is not None:
                    self._send_json(200, {"code": 0, "data": detail})
                else:
                    self._send_json(404, {"code": -1, "msg": "排不存在"})
                return

            # GET /api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages - 获取笼列表
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns/(\d+)/cages$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                col_id = int(match.group(3))
                data = load_data()
                detail = get_column_detail(data, wh_id, row_id, col_id)
                if detail is not None:
                    self._send_json(200, {"code": 0, "data": detail})
                else:
                    self._send_json(404, {"code": -1, "msg": "列不存在"})
                return

            self._send_json(404, {"code": -1, "msg": "接口不存在"})

        except Exception as e:
            self._send_json(500, {"code": -1, "msg": str(e)})

    def do_POST(self):
        """处理 POST 请求"""
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        try:
            body = self._read_body()

            # ---- 用户认证 API（无需登录）----

            # POST /api/register - 注册
            if path == '/api/register':
                username = (body.get('username', '') or '').strip()
                password = (body.get('password', '') or '').strip()
                if not username or not password:
                    self._send_json(400, {"code": -1, "msg": "用户名和密码不能为空"})
                    return
                if len(username) < 2 or len(username) > 30:
                    self._send_json(400, {"code": -1, "msg": "用户名需2-30个字符"})
                    return
                if len(password) < 4:
                    self._send_json(400, {"code": -1, "msg": "密码至少4位"})
                    return
                users = load_users()
                if username in users:
                    self._send_json(400, {"code": -1, "msg": "用户名已存在"})
                    return
                users[username] = _hash_password(password)
                save_users(users)
                token = create_session(username)
                self._send_json(200, {"code": 0, "data": {"username": username, "token": token}})
                return

            # POST /api/login - 登录
            if path == '/api/login':
                username = (body.get('username', '') or '').strip()
                password = (body.get('password', '') or '').strip()
                if not username or not password:
                    self._send_json(400, {"code": -1, "msg": "用户名和密码不能为空"})
                    return
                users = load_users()
                stored = users.get(username)
                if not stored or not _verify_password(password, stored):
                    self._send_json(401, {"code": -1, "msg": "用户名或密码错误"})
                    return
                token = create_session(username)
                self._send_json(200, {"code": 0, "data": {"username": username, "token": token}})
                return

            # POST /api/logout - 登出
            if path == '/api/logout':
                token = self._get_token()
                if token:
                    destroy_session(token)
                self._send_json(200, {"code": 0, "msg": "已登出"})
                return

            # ---- 业务 API（需登录）----

            if not self._require_auth():
                return

            data = load_data()

            # POST /api/warehouses - 添加仓库
            if path == '/api/warehouses':
                name = body.get('name', '')
                if not name.strip():
                    self._send_json(400, {"code": -1, "msg": "仓库名称不能为空"})
                    return
                result = add_warehouse(data, name)
                self._send_json(200, {"code": 0, "data": result})
                return

            # POST /api/warehouses/:wh_id/rows - 添加排
            match = re.match(r'^/api/warehouses/(\d+)/rows$', path)
            if match:
                wh_id = int(match.group(1))
                row_number = body.get('row_number', 1)
                result = add_row(data, wh_id, row_number)
                if result:
                    self._send_json(200, {"code": 0, "data": result})
                else:
                    self._send_json(404, {"code": -1, "msg": "仓库不存在"})
                return

            # POST /api/warehouses/:wh_id/rows/:row_id/columns - 添加列
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                col_number = body.get('col_number', 1)
                result = add_column(data, wh_id, row_id, col_number)
                if result:
                    self._send_json(200, {"code": 0, "data": result})
                else:
                    self._send_json(404, {"code": -1, "msg": "排不存在"})
                return

            # POST /api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages - 添加笼
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns/(\d+)/cages$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                col_id = int(match.group(3))
                cage_number = body.get('cage_number', 1)
                result = add_cage(data, wh_id, row_id, col_id, cage_number)
                if result:
                    self._send_json(200, {"code": 0, "data": result})
                else:
                    self._send_json(404, {"code": -1, "msg": "列不存在"})
                return

            self._send_json(404, {"code": -1, "msg": "接口不存在"})

        except Exception as e:
            self._send_json(500, {"code": -1, "msg": str(e)})

    def do_DELETE(self):
        """处理 DELETE 请求"""
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        try:
            if not self._require_auth():
                return

            data = load_data()

            # DELETE /api/warehouses/:wh_id - 删除仓库
            match = re.match(r'^/api/warehouses/(\d+)$', path)
            if match:
                wh_id = int(match.group(1))
                result = delete_warehouse(data, wh_id)
                if result is not None:
                    self._send_json(200, {"code": 0, "msg": "删除成功"})
                else:
                    self._send_json(404, {"code": -1, "msg": "仓库不存在"})
                return

            # DELETE /api/warehouses/:wh_id/rows/:row_id - 删除排
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                result = delete_row(data, wh_id, row_id)
                if result is not None:
                    self._send_json(200, {"code": 0, "msg": "删除成功"})
                else:
                    self._send_json(404, {"code": -1, "msg": "排不存在"})
                return

            # DELETE /api/warehouses/:wh_id/rows/:row_id/columns/:col_id - 删除列
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns/(\d+)$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                col_id = int(match.group(3))
                result = delete_column(data, wh_id, row_id, col_id)
                if result is not None:
                    self._send_json(200, {"code": 0, "msg": "删除成功"})
                else:
                    self._send_json(404, {"code": -1, "msg": "列不存在"})
                return

            # DELETE /api/warehouses/:wh_id/rows/:row_id/columns/:col_id/cages/:cage_id - 删除笼
            match = re.match(r'^/api/warehouses/(\d+)/rows/(\d+)/columns/(\d+)/cages/(\d+)$', path)
            if match:
                wh_id = int(match.group(1))
                row_id = int(match.group(2))
                col_id = int(match.group(3))
                cage_id = int(match.group(4))
                result = delete_cage(data, wh_id, row_id, col_id, cage_id)
                if result is not None:
                    self._send_json(200, {"code": 0, "msg": "删除成功"})
                else:
                    self._send_json(404, {"code": -1, "msg": "笼不存在"})
                return

            self._send_json(404, {"code": -1, "msg": "接口不存在"})

        except Exception as e:
            self._send_json(500, {"code": -1, "msg": str(e)})

    def _serve_static(self, path):
        """提供静态文件服务"""
        # 根路径返回 index.html
        if path == '' or path == '/':
            path = '/index.html'

        # 安全检查：防止目录遍历
        safe_path = os.path.normpath(path).lstrip('\\/')
        if '..' in safe_path:
            self._send_json(403, {"code": -1, "msg": "禁止访问"})
            return

        # 构建文件路径（优先从 static 目录查找）
        file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', safe_path)
        if not os.path.exists(file_path):
            self._send_json(404, {"code": -1, "msg": "文件不存在"})
            return

        # 根据扩展名设置 Content-Type
        ext = os.path.splitext(file_path)[1].lower()
        content_types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon',
            '.svg': 'image/svg+xml',
        }
        ct = content_types.get(ext, 'application/octet-stream')

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self._send_json(404, {"code": -1, "msg": "文件不存在"})


# ==================== 启动入口 ====================

def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"端口号无效: {sys.argv[1]}，使用默认端口 {DEFAULT_PORT}")
            port = DEFAULT_PORT

    # 确保数据目录存在
    if not os.path.exists(DATA_FILE):
        save_data(load_data())

    server = HTTPServer(('0.0.0.0', port), PigeonHandler)
    print(f"=" * 50)
    print(f"  鸽子养殖后台管理系统")
    print(f"  http://localhost:{port}")
    print(f"=" * 50)
    print(f"按 Ctrl+C 停止服务器...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止。")
        server.server_close()


if __name__ == '__main__':
    main()
