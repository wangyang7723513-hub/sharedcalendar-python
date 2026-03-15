"""
共享日历后端服务
功能：飞书多维表格 API 代理、用户认证、日程管理
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import time
import hashlib
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ============ 飞书应用配置 ============
APP_ID = "cli_a92477eaf7b9dcd1"
APP_SECRET = "Gu8bVzPrmITg45o8439bNbG8PlXSxj1X"

# 用户表配置
USER_APP_TOKEN = "F8YKb0nv2aqROZsBnXQcCUp2nyJ"
USER_TABLE_ID = "tblkk7TcwCpxVObB"

# 日程表配置
SCHEDULE_APP_TOKEN = "DTgCbvlLuavkhssC3RPcq5dinAe"
SCHEDULE_TABLE_ID = "tblFgmWvYKCCulGW"

# 飞书 API 基础 URL
FEISHU_BASE_URL = "https://open.feishu.cn/open-apis"

# Token 缓存
_token_cache = {
    "token": None,
    "expire_time": 0
}


def get_tenant_access_token():
    """获取飞书 tenant_access_token（带缓存）"""
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expire_time"]:
        return _token_cache["token"]

    url = f"{FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal"
    payload = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }
    resp = requests.post(url, json=payload)
    data = resp.json()

    if data.get("code") == 0:
        _token_cache["token"] = data["tenant_access_token"]
        _token_cache["expire_time"] = now + data.get("expire", 7200) - 300
        return _token_cache["token"]
    else:
        raise Exception(f"获取 token 失败: {data}")


def feishu_headers():
    """构建飞书 API 请求头"""
    token = get_tenant_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }


def hash_password(password):
    """简单密码哈希"""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


# ============ 静态文件服务 ============
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


# ============ 用户相关 API ============
@app.route('/api/register', methods=['POST'])
def register():
    """用户注册"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    nickname = data.get('nickname', '').strip()
    avatar_color = data.get('avatar_color', '#6366f1')

    if not username or not password or not nickname:
        return jsonify({"success": False, "message": "请填写完整信息"}), 400

    # 检查用户是否已存在
    search_url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{USER_APP_TOKEN}/tables/{USER_TABLE_ID}/records/search"
    search_body = {
        "filter": {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": "username",
                    "operator": "is",
                    "value": [username]
                }
            ]
        }
    }
    resp = requests.post(search_url, headers=feishu_headers(), json=search_body)
    result = resp.json()

    if result.get("data", {}).get("total", 0) > 0:
        return jsonify({"success": False, "message": "用户名已存在"}), 400

    # 创建新用户
    create_url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{USER_APP_TOKEN}/tables/{USER_TABLE_ID}/records"
    create_body = {
        "fields": {
            "username": username,
            "password": hash_password(password),
            "nickname": nickname,
            "avatar_color": avatar_color
        }
    }
    resp = requests.post(create_url, headers=feishu_headers(), json=create_body)
    result = resp.json()

    if result.get("code") == 0:
        record = result.get("data", {}).get("record", {})
        return jsonify({
            "success": True,
            "message": "注册成功",
            "user": {
                "id": record.get("record_id"),
                "username": username,
                "nickname": nickname,
                "avatar_color": avatar_color
            }
        })
    else:
        return jsonify({"success": False, "message": f"注册失败: {result.get('msg', '未知错误')}"}), 500


@app.route('/api/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"success": False, "message": "请输入用户名和密码"}), 400

    search_url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{USER_APP_TOKEN}/tables/{USER_TABLE_ID}/records/search"
    search_body = {
        "filter": {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": "username",
                    "operator": "is",
                    "value": [username]
                }
            ]
        }
    }
    resp = requests.post(search_url, headers=feishu_headers(), json=search_body)
    result = resp.json()

    records = result.get("data", {}).get("items", [])
    if not records:
        return jsonify({"success": False, "message": "用户不存在"}), 401

    user_record = records[0]
    fields = user_record.get("fields", {})

    stored_password = fields.get("password", "")
    # password 可能是文本类型返回列表
    if isinstance(stored_password, list):
        stored_password = stored_password[0].get("text", "") if stored_password else ""

    if stored_password != hash_password(password):
        return jsonify({"success": False, "message": "密码错误"}), 401

    nickname = fields.get("nickname", username)
    if isinstance(nickname, list):
        nickname = nickname[0].get("text", "") if nickname else username

    avatar_color = fields.get("avatar_color", "#6366f1")
    if isinstance(avatar_color, list):
        avatar_color = avatar_color[0].get("text", "") if avatar_color else "#6366f1"

    uname = fields.get("username", username)
    if isinstance(uname, list):
        uname = uname[0].get("text", "") if uname else username

    return jsonify({
        "success": True,
        "message": "登录成功",
        "user": {
            "id": user_record.get("record_id"),
            "username": uname,
            "nickname": nickname,
            "avatar_color": avatar_color
        }
    })


@app.route('/api/users', methods=['GET'])
def get_users():
    """获取所有用户列表"""
    url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{USER_APP_TOKEN}/tables/{USER_TABLE_ID}/records/search"
    body = {
        "page_size": 100
    }
    resp = requests.post(url, headers=feishu_headers(), json=body)
    result = resp.json()

    users = []
    for item in result.get("data", {}).get("items", []):
        fields = item.get("fields", {})

        nickname = fields.get("nickname", "")
        if isinstance(nickname, list):
            nickname = nickname[0].get("text", "") if nickname else ""

        avatar_color = fields.get("avatar_color", "#6366f1")
        if isinstance(avatar_color, list):
            avatar_color = avatar_color[0].get("text", "") if avatar_color else "#6366f1"

        username = fields.get("username", "")
        if isinstance(username, list):
            username = username[0].get("text", "") if username else ""

        users.append({
            "id": item.get("record_id"),
            "username": username,
            "nickname": nickname,
            "avatar_color": avatar_color
        })

    return jsonify({"success": True, "users": users})


# ============ 日程相关 API ============
@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    """获取日程列表，支持按月份筛选"""
    year = request.args.get('year')
    month = request.args.get('month')

    url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{SCHEDULE_APP_TOKEN}/tables/{SCHEDULE_TABLE_ID}/records/search"

    body = {"page_size": 500}

    if year and month:
        # date 字段为文本类型，使用 contains 匹配年月前缀
        year_month_prefix = f"{year}-{month.zfill(2)}"

        body["filter"] = {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": "date",
                    "operator": "contains",
                    "value": [year_month_prefix]
                }
            ]
        }

    resp = requests.post(url, headers=feishu_headers(), json=body)
    result = resp.json()

    schedules = []
    for item in result.get("data", {}).get("items", []):
        fields = item.get("fields", {})

        # 解析各字段
        date_val = fields.get("date", "")
        if isinstance(date_val, (int, float)):
            # 飞书日期字段返回毫秒时间戳
            import datetime
            date_val = datetime.datetime.fromtimestamp(date_val / 1000).strftime('%Y-%m-%d')
        elif isinstance(date_val, list):
            date_val = date_val[0].get("text", "") if date_val else ""

        content = fields.get("content", "")
        if isinstance(content, list):
            content = content[0].get("text", "") if content else ""

        user_id = fields.get("user_id", "")
        if isinstance(user_id, list):
            user_id = user_id[0].get("text", "") if user_id else ""

        nickname = fields.get("nickname", "")
        if isinstance(nickname, list):
            nickname = nickname[0].get("text", "") if nickname else ""

        avatar_color = fields.get("avatar_color", "#6366f1")
        if isinstance(avatar_color, list):
            avatar_color = avatar_color[0].get("text", "") if avatar_color else "#6366f1"

        schedules.append({
            "id": item.get("record_id"),
            "date": date_val,
            "content": content,
            "user_id": user_id,
            "nickname": nickname,
            "avatar_color": avatar_color
        })

    return jsonify({"success": True, "schedules": schedules})


@app.route('/api/schedules', methods=['POST'])
def create_schedule():
    """创建新日程"""
    data = request.json
    date = data.get('date')
    content = data.get('content', '').strip()
    user_id = data.get('user_id')
    nickname = data.get('nickname')
    avatar_color = data.get('avatar_color', '#6366f1')

    if not date or not content or not user_id:
        return jsonify({"success": False, "message": "请填写完整信息"}), 400

    url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{SCHEDULE_APP_TOKEN}/tables/{SCHEDULE_TABLE_ID}/records"
    body = {
        "fields": {
            "date": date,
            "content": content,
            "user_id": user_id,
            "nickname": nickname,
            "avatar_color": avatar_color
        }
    }

    resp = requests.post(url, headers=feishu_headers(), json=body)
    result = resp.json()

    if result.get("code") == 0:
        record = result.get("data", {}).get("record", {})
        return jsonify({
            "success": True,
            "message": "添加成功",
            "schedule": {
                "id": record.get("record_id"),
                "date": date,
                "content": content,
                "user_id": user_id,
                "nickname": nickname,
                "avatar_color": avatar_color
            }
        })
    else:
        return jsonify({"success": False, "message": f"添加失败: {result.get('msg', '未知错误')}"}), 500


@app.route('/api/schedules/<record_id>', methods=['DELETE'])
def delete_schedule(record_id):
    """删除日程"""
    url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{SCHEDULE_APP_TOKEN}/tables/{SCHEDULE_TABLE_ID}/records/{record_id}"
    resp = requests.delete(url, headers=feishu_headers())
    result = resp.json()

    if result.get("code") == 0:
        return jsonify({"success": True, "message": "删除成功"})
    else:
        return jsonify({"success": False, "message": f"删除失败: {result.get('msg', '未知错误')}"}), 500


@app.route('/api/schedules/<record_id>', methods=['PUT'])
def update_schedule(record_id):
    """更新日程"""
    data = request.json
    content = data.get('content', '').strip()

    if not content:
        return jsonify({"success": False, "message": "内容不能为空"}), 400

    url = f"{FEISHU_BASE_URL}/bitable/v1/apps/{SCHEDULE_APP_TOKEN}/tables/{SCHEDULE_TABLE_ID}/records/{record_id}"
    body = {
        "fields": {
            "content": content
        }
    }

    resp = requests.put(url, headers=feishu_headers(), json=body)
    result = resp.json()

    if result.get("code") == 0:
        return jsonify({"success": True, "message": "更新成功"})
    else:
        return jsonify({"success": False, "message": f"更新失败: {result.get('msg', '未知错误')}"}), 500


if __name__ == '__main__':
    print("[*] 共享日历服务启动中...")
    print("[*] 访问地址: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
