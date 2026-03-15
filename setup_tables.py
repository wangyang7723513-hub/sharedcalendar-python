"""
初始化飞书多维表格字段
自动检查并创建 User_Table 和 Schedule_Table 所需的字段
"""
import requests
import json

APP_ID = "cli_a92477eaf7b9dcd1"
APP_SECRET = "Gu8bVzPrmITg45o8439bNbG8PlXSxj1X"
BASE = "https://open.feishu.cn/open-apis"

# 用户表
USER_APP_TOKEN = "F8YKb0nv2aqROZsBnXQcCUp2nyJ"
USER_TABLE_ID = "tblkk7TcwCpxVObB"

# 日程表
SCHEDULE_APP_TOKEN = "DTgCbvlLuavkhssC3RPcq5dinAe"
SCHEDULE_TABLE_ID = "tblFgmWvYKCCulGW"


def get_token():
    r = requests.post(
        f"{BASE}/auth/v3/tenant_access_token/internal",
        json={"app_id": APP_ID, "app_secret": APP_SECRET}
    )
    return r.json()["tenant_access_token"]


def get_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }


def list_fields(token, app_token, table_id):
    url = f"{BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
    r = requests.get(url, headers=get_headers(token))
    data = r.json()
    fields = {}
    for f in data.get("data", {}).get("items", []):
        fields[f["field_name"]] = f["type"]
    return fields


def create_field(token, app_token, table_id, field_name, field_type):
    """
    field_type:
      1 = 多行文本
      2 = 数字
      5 = 日期
    """
    url = f"{BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
    body = {
        "field_name": field_name,
        "type": field_type
    }
    r = requests.post(url, headers=get_headers(token), json=body)
    result = r.json()
    if result.get("code") == 0:
        print(f"  [OK] {field_name} (type={field_type})")
    else:
        print(f"  [FAIL] {field_name}: {result.get('msg', 'unknown error')}")
    return result


def main():
    token = get_token()
    print("Token OK\n")

    # ====== User Table ======
    print("=== User Table ===")
    existing = list_fields(token, USER_APP_TOKEN, USER_TABLE_ID)
    print(f"Existing fields: {list(existing.keys())}")

    user_fields = {
        "username": 1,      # 文本
        "password": 1,      # 文本
        "nickname": 1,      # 文本
        "avatar_color": 1,  # 文本
    }

    for name, ftype in user_fields.items():
        if name not in existing:
            print(f"  Creating: {name}")
            create_field(token, USER_APP_TOKEN, USER_TABLE_ID, name, ftype)
        else:
            print(f"  Exists: {name}")

    # ====== Schedule Table ======
    print("\n=== Schedule Table ===")
    existing = list_fields(token, SCHEDULE_APP_TOKEN, SCHEDULE_TABLE_ID)
    print(f"Existing fields: {list(existing.keys())}")

    schedule_fields = {
        "date": 1,          # 文本（存储 YYYY-MM-DD 格式）
        "content": 1,       # 文本
        "user_id": 1,       # 文本
        "nickname": 1,      # 文本
        "avatar_color": 1,  # 文本
    }

    for name, ftype in schedule_fields.items():
        if name not in existing:
            print(f"  Creating: {name}")
            create_field(token, SCHEDULE_APP_TOKEN, SCHEDULE_TABLE_ID, name, ftype)
        else:
            print(f"  Exists: {name}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
