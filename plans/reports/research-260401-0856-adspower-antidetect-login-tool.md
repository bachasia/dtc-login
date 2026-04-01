# Research Report: AdsPower Antidetect Browser — Xây dựng Tool Login

**Date:** 2026-04-01 | **Topic:** AdsPower Local API & Login Automation Tool

---

## Executive Summary

AdsPower là antidetect browser phổ biến nhất cho multi-account management. Nó cung cấp **Local API** chạy ở `localhost:50325` cho phép lập trình viên mở/đóng browser profile, quản lý fingerprint, và kết nối Selenium/Puppeteer/Playwright để tự động hóa đăng nhập. Cách tiếp cận tối ưu để xây tool login là: **gọi Local API để mở profile → lấy WebSocket endpoint → kết nối automation library → thực hiện login flow → đóng browser**.

---

## Table of Contents

1. [AdsPower Overview](#1-adspower-overview)
2. [Local API Architecture](#2-local-api-architecture)
3. [Automation Integration](#3-automation-integration)
4. [Implementation Guide](#4-implementation-guide)
5. [Security & Rate Limits](#5-security--rate-limits)
6. [Resources](#6-resources)

---

## 1. AdsPower Overview

- **Loại:** Antidetect browser (Chromium-based SunBrowser + Firefox-based FlowerBrowser)
- **Mục đích chính:** Multi-account management, fingerprint spoofing, chống bị detect
- **Fingerprint masking:** 50+ tham số (User Agent, Canvas, WebGL, AudioContext, timezone, fonts...)
- **Pricing:** Free tier (5 profiles), từ $9/tháng; **Local API chỉ có ở paid plan**
- **Cert:** SOC 2 Type II (2025)

---

## 2. Local API Architecture

### Endpoints

```
Base URL: http://local.adspower.net:50325/
Alt URL:  http://localhost:50325/
```

### Authentication

```
Header: Authorization: Bearer <API_KEY>
```

Cần enable "Security Verification" trong AdsPower Settings, sau đó lấy API Key.

### Key Endpoints

| Method | Endpoint                             | Mô tả                      |
| ------ | ------------------------------------ | -------------------------- |
| GET    | `/api/v1/browser/start?user_id={id}` | Mở browser profile         |
| GET    | `/api/v1/browser/stop?user_id={id}`  | Đóng browser profile       |
| GET    | `/api/v1/browser/active`             | Kiểm tra profile đang chạy |
| POST   | `/api/v1/user/create`                | Tạo profile mới            |
| GET    | `/api/v1/user/list`                  | Liệt kê profiles           |
| DELETE | `/api/v1/user/delete`                | Xóa profile                |

### Response từ `browser/start`

```json
{
  "code": 0,
  "data": {
    "ws": {
      "selenium": "127.0.0.1:9222",
      "puppeteer": "ws://127.0.0.1:9222/devtools/browser/xxx"
    },
    "debug_port": "9222",
    "webdriver": "/path/to/chromedriver"
  },
  "msg": "success"
}
```

### Rate Limits

| Số profiles | Giới hạn   |
| ----------- | ---------- |
| 0–200       | 2 req/sec  |
| 200–5,000   | 5 req/sec  |
| 5,000+      | 10 req/sec |

---

## 3. Automation Integration

### Cách hoạt động

1. AdsPower chạy ở background, expose local HTTP API
2. Gọi `browser/start` → nhận WebSocket URL + WebDriver path
3. Kết nối Selenium (`debuggerAddress`) hoặc Puppeteer (`browserWSEndpoint`) vào browser đang chạy
4. Tự động hóa login form trong browser profile có fingerprint thật
5. Gọi `browser/stop` khi xong

### Điểm mạnh so với automation thuần

- Browser có fingerprint thật (không bị detect là headless/bot)
- Mỗi profile có cookies, localStorage riêng
- IP proxy gắn theo profile
- Bypass hầu hết bot detection systems

---

## 4. Implementation Guide

### Python + Selenium (khuyến nghị)

```python
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

ADS_API = "http://local.adspower.net:50325"
API_KEY = "your_api_key"
PROFILE_ID = "your_profile_id"

headers = {"Authorization": f"Bearer {API_KEY}"}

def open_browser(profile_id: str):
    """Mở AdsPower profile và trả về Selenium driver."""
    resp = requests.get(
        f"{ADS_API}/api/v1/browser/start",
        params={"user_id": profile_id},
        headers=headers
    ).json()

    if resp["code"] != 0:
        raise RuntimeError(f"Không mở được browser: {resp['msg']}")

    data = resp["data"]
    options = Options()
    options.add_experimental_option("debuggerAddress", data["ws"]["selenium"])

    driver = webdriver.Chrome(
        executable_path=data["webdriver"],
        options=options
    )
    return driver

def close_browser(profile_id: str):
    """Đóng AdsPower profile."""
    requests.get(
        f"{ADS_API}/api/v1/browser/stop",
        params={"user_id": profile_id},
        headers=headers
    )

def login(profile_id: str, url: str, username: str, password: str):
    """Login vào website qua AdsPower profile."""
    driver = open_browser(profile_id)
    try:
        driver.get(url)
        # Điền form login
        driver.find_element("id", "username").send_keys(username)
        driver.find_element("id", "password").send_keys(password)
        driver.find_element("css selector", "[type='submit']").click()
        # Chờ và kiểm tra login thành công
        ...
    finally:
        driver.quit()
        close_browser(profile_id)
```

### Node.js + Puppeteer

```javascript
const axios = require('axios')
const puppeteer = require('puppeteer-core')

const ADS_API = 'http://local.adspower.net:50325'
const API_KEY = 'your_api_key'
const PROFILE_ID = 'your_profile_id'

async function loginWithAdspower(profileId, url, username, password) {
  const headers = { Authorization: `Bearer ${API_KEY}` }

  // Mở profile
  const { data: resp } = await axios.get(`${ADS_API}/api/v1/browser/start`, {
    params: { user_id: profileId },
    headers,
  })

  if (resp.code !== 0) throw new Error(resp.msg)

  // Kết nối Puppeteer
  const browser = await puppeteer.connect({
    browserWSEndpoint: resp.data.ws.puppeteer,
  })

  try {
    const [page] = await browser.pages()
    await page.goto(url)
    await page.type('#username', username)
    await page.type('#password', password)
    await page.click('[type="submit"]')
    await page.waitForNavigation()
  } finally {
    await browser.disconnect()
    await axios.get(`${ADS_API}/api/v1/browser/stop`, {
      params: { user_id: profileId },
      headers,
    })
  }
}
```

### PyPI Package (đơn giản hơn)

```python
from adspower.sync_api.selenium import Profile, Group

# Dùng existing profile
profile = Profile.query(name='my_profile')[0]
browser = profile.get_browser(headless=False)
browser.get('https://target-site.com')
# ... login actions ...
profile.quit()
```

---

## 5. Security & Rate Limits

- **API Key:** Bắt buộc khi enable security verification; lưu ở `.env`, không commit
- **HTTPS:** Local API dùng HTTP (localhost only) — không expose ra internet
- **Rate limit:** Xây sleep/retry logic để không bị throttle
- **Profile isolation:** Mỗi profile có cookies riêng → không cross-contaminate sessions
- **Lưu ý pháp lý:** Nhiều platform cấm multi-account → cần tuân thủ ToS của từng platform

---

## 6. Resources

### Official

- [AdsPower Local API Docs](https://localapi-doc-en.adspower.com/docs/Rdw7Iu)
- [AdsPower GitHub (official)](https://github.com/AdsPower/localAPI)
- [Python Examples](https://github.com/AdsPower/localAPI/tree/main/py-examples)
- [AdsPower Local API page](https://www.adspower.com/local-api)

### Packages

- [adspower PyPI](https://pypi.org/project/adspower/)
- [Postman API Collection](https://documenter.getpostman.com/view/45822952/2sB34hEzQH)

### Tutorials

- [Open Browser API Docs](https://localapi-doc-en.adspower.com/docs/FFMFMf)
- [Code Samples](https://localapi-doc-en.adspower.com/docs/K4IsTq)
- [Dolphin Anty: Selenium vs Puppeteer vs Playwright](https://dolphin-anty.com/blog/en/api-automation-in-browsers-what-are-selenium-puppeteer-and-playwright-2024/)
- [AdsPower Review (Bright Data)](https://brightdata.com/blog/proxy-101/adspower-review)

---

## Unresolved Questions

1. **Login target:** DTC (adspower.com/vn) hay site khác? Cần biết login URL, selector của form fields.
2. **Số lượng profiles:** Bao nhiêu account cần login đồng thời? → ảnh hưởng plan pricing và rate limit strategy.
3. **Headless mode:** Cần chạy headless hay có UI? AdsPower thường yêu cầu chạy với UI để tránh detect.
4. **Credentials storage:** Lưu ở đâu? Database, file, hay env vars?
5. **AdsPower version:** Local API v1 hay v2? (v2 có thêm cross-device monitoring)
6. **Playwright support:** AdsPower chính thức support Selenium & Puppeteer; Playwright cần workaround qua CDP.
