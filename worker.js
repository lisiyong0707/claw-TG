const BOT_TOKEN = '';
const GITHUB_TOKEN = '';
const REPO_OWNER = 'nyn-1670';
const REPO_NAME = 'ClawCloud-Run';
const ALLOWED_CHAT_ID = ;

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
