# claw-TG
本项目由AI编写，适配于clawcloudRUN自动登录脚本。借用cloudflare的workers可以通过telegram远程进行action.
# ClawCloud Run 自动保活配置指南

> 本文档整理了完整的配置流程、注意事项和常见问题排查方法。

---

## 目录

- [前置准备](#前置准备)
- [配置 GitHub Actions](#配置-github-actions)
- [配置 Telegram Bot 触发](#配置-telegram-bot-触发)
- [配置 Cloudflare Workers](#配置-cloudflare-workers)
- [配置自动更新 Cookie](#配置自动更新-cookie)
- [配置防止 60 天禁用](#配置防止-60-天禁用)
- [注意事项](#注意事项)
- [常见问题排查](#常见问题排查)

---

## 前置准备

需要准备以下材料：

| 材料 | 获取方式 |
|---|---|
| Telegram Bot Token | 找 @BotFather，发送 `/newbot` 创建 |
| 自己的 Telegram Chat ID | 找 @userinfobot，发送任意消息获取 |
| GitHub Personal Access Token | 见下方步骤 |
| Cloudflare 账号 | 免费注册 [dash.cloudflare.com](https://dash.cloudflare.com) |

### 生成 GitHub Personal Access Token

1. GitHub → 右上角头像 → **Settings**
2. 左侧底部 → **Developer settings**
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
4. Repository access 选择 **Only select repositories**，选择你的仓库
5. Permissions 勾选：
   - **Actions** → `Read and write`
   - **Secrets** → `Read and write`（用于自动更新 Cookie）
6. 生成后**立刻复制**，只显示一次

> ⚠️ **安全提示**：Token、Session 等敏感信息不要粘贴到任何对话框、截图或公开场合，泄露后需立即撤销重建。

---

## 配置 GitHub Actions

编辑仓库中的 `.github/workflows/keep-alive.yml`：

```yaml
name: ClawCloud 自动登录保活

on:
  workflow_dispatch:      # 允许手动触发
  schedule:
    - cron: '0 7 */5 * *'  # UTC 7:00，每5天运行一次

permissions:
  contents: write         # 允许写入仓库（防止60天禁用用）

jobs:
  auto-login:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 设置 Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: 安装依赖
        run: |
          pip install playwright requests pynacl
          playwright install chromium
          playwright install-deps

      - name: 运行自动登录
        # ... 原有步骤保持不变

      - name: 保持仓库活跃
        run: |
          git config user.email "action@github.com"
          git config user.name "GitHub Action"
          echo "last run: $(date)" > last_run.txt
          git add last_run.txt
          git commit -m "chore: keep alive $(date +%Y-%m-%d)"
          git push
        env:
          GITHUB_TOKEN: ${{ secrets.REPO_TOKEN }}
```

### Cron 时间说明

> GitHub Actions 使用 **UTC 时间**，北京时间 = UTC + 8

| Cron 表达式 | UTC 时间 | 北京时间 |
|---|---|---|
| `0 0 * * 1` | 周一 00:00 | 周一 08:00 |
| `0 4 * * 1` | 周一 04:00 | 周一 12:00 |
| `0 7 */5 * *` | 每5天 07:00 | 每5天 15:00 |

### 配置 Secrets

仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 名称 | 说明 |
|---|---|
| `GH_SESSION` | ClawCloud 登录 Cookie |
| `REPO_TOKEN` | GitHub Token（用于自动回写 Cookie 和保持活跃） |

---

## 配置 Telegram Bot 触发

### 创建 Bot

1. Telegram 搜索 **@BotFather**
2. 发送 `/newbot`，按提示设置名称
3. 收到 Token，格式为 `1234567890:ABCdefGHI...`

### 获取 Chat ID

1. Telegram 搜索 **@userinfobot**
2. 发送任意消息，收到的数字即为 Chat ID

---

## 配置 Cloudflare Workers

### 创建 Worker

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages** → **创建 Worker**
3. 粘贴以下完整代码，替换顶部 5 个变量
4. 点击 **部署**

### Worker 完整代码

```javascript
const BOT_TOKEN = '你的 Telegram Bot Token';
const GITHUB_TOKEN = '你的 GitHub Token';
const REPO_OWNER = '你的 GitHub 用户名';
const REPO_NAME = 'ClawCloud-Run';
const ALLOWED_CHAT_ID = 你的Chat ID数字;  // 纯数字，不加引号

export default {
  async fetch(request) {

    if (request.method !== 'POST') {
      return new Response('Bot is running!', { status: 200 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response('ok');
    }

    const message = body?.message;
    if (!message) return new Response('ok');

    const chatId = message.chat.id;
    const text = message.text;

    if (chatId !== ALLOWED_CHAT_ID) {
      return new Response('ok');
    }

    let replyText = '';

    if (text === '/run') {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/keep-alive.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'TelegramBot'
          },
          body: JSON.stringify({ ref: 'main' })
        }
      );
      const resText = await res.text();
      replyText = res.ok ? '✅ Actions 已触发！' : `❌ 触发失败: ${res.status}\n${resText}`;

    } else if (text === '/status') {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=1`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'TelegramBot'
          }
        }
      );
      const data = await res.json();
      const run = data.workflow_runs?.[0];
      if (run) {
        replyText = `📋 最近一次运行\n状态: ${run.status}\n结论: ${run.conclusion ?? '进行中'}\n时间: ${run.created_at}`;
      } else {
        replyText = '暂无运行记录';
      }

    } else {
      replyText = '可用命令：\n/run - 立即触发登录\n/status - 查看最近运行状态';
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: replyText })
    });

    return new Response('ok');
  }
}
```

### 绑定 Webhook

部署完成后，在浏览器地址栏输入（不要发给任何人）：

```
https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook?url=https://<你的Worker名>.workers.dev
```

返回 `{"ok":true}` 即绑定成功。

### Bot 可用命令

| 命令 | 功能 |
|---|---|
| `/run` | 立即触发 Actions 登录 |
| `/status` | 查看最近一次运行状态 |

---

## 配置自动更新 Cookie

配置 `REPO_TOKEN` Secret 后，脚本登录成功时会自动将新 Cookie 写回 `GH_SESSION`，无需手动操作。

Telegram 通知变化：

```
# 未配置 REPO_TOKEN（需手动更新）
请更新 Secret GH_SESSION: FnlhS9cF4nMP...

# 已配置 REPO_TOKEN（全自动）
GH_SESSION 已自动更新 ✅
```

---

## 配置防止 60 天禁用

GitHub 规定：仓库 **60 天没有任何 commit**，定时 Actions 会被自动禁用。

在 `keep-alive.yml` 最后添加自动提交步骤（见上方完整配置），每次运行会自动提交 `last_run.txt`，永久保持仓库活跃。

---

## 注意事项

### 安全相关

- ⚠️ **Token、Cookie、Chat ID 等敏感信息不要出现在任何对话、截图、公开文档中**
- Bot Token 泄露后立即去 @BotFather 发送 `/revoke` 撤销
- GitHub Token 泄露后立即去 Settings → Developer settings → 删除重建
- `ALLOWED_CHAT_ID` 必须设置，防止他人触发你的 Actions

### yml 文件相关

- `workflow_dispatch:` 只能出现**一次**，重复会导致语法错误
- 文件名必须和 Worker 代码中的路径**完全一致**（本例为 `keep-alive.yml`）
- 加入 `保持仓库活跃` 步骤时，必须在顶部声明 `permissions: contents: write`

### Cloudflare Workers 相关

- `ALLOWED_CHAT_ID` 必须是**纯数字**，不能加引号
  ```javascript
  // ❌ 错误
  const ALLOWED_CHAT_ID = '123456789';
  // ✅ 正确
  const ALLOWED_CHAT_ID = 123456789;
  ```
- 代码中只能有**一个** `export default {}`，不能重复

### 多账号风险

- 多账号从同一 IP 顺序登录，ClawCloud 识别风险较高
- 推荐多账号分别 Fork 独立仓库，错开执行时间（间隔 2 小时以上）

---

## 常见问题排查

| 错误 | 原因 | 解决方法 |
|---|---|---|
| `401 Bad credentials` | GitHub Token 无效或过期 | 重新生成 Token 并更新 Worker 代码 |
| `404 Not Found` | 工作流文件名不匹配 | 检查 `.github/workflows/` 下实际文件名 |
| `1101 错误` | Worker 代码运行时报错 | 检查变量是否填写完整，Chat ID 是否为纯数字 |
| `触发失败` | `workflow_dispatch` 重复或缺失 | 确保 yml 中只有一个 `workflow_dispatch:` |
| Actions 被禁用 | 超过 60 天无 commit | 添加自动提交步骤并配置 `REPO_TOKEN` |
| Cookie 过期 | ClawCloud Session 失效 | 配置 `REPO_TOKEN` 实现自动更新 |

---

## 最终状态检查

完成所有配置后，应实现：

- [x] 每5天自动登录 ClawCloud 保活
- [x] Cookie 过期自动更新，无需手动干预
- [x] 仓库自动提交，永不触发 60 天禁用
- [x] Telegram 发送 `/run` 可随时手动触发
- [x] Telegram 发送 `/status` 可查看运行状态
