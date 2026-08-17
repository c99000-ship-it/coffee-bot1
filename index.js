const { Telegraf } = require('telegraf');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN не задан!');
  process.exit(1);
}

const bot = new Telegraf(token);

const users = {};
const cooldowns = {};
const COOLDOWN_MS = 5 * 60 * 1000;

const RARITY_CHANCES = {
  COMMON: 75,
  UNCOMMON: 23.5,
  RARE: 1,
  EPIC: 0.4,
  LEGENDARY: 0.1
};

function getUserName(user) {
  const parts = [];
  if (user.first_name) parts.push(user.first_name);
  if (user.last_name) parts.push(user.last_name);
  if (!parts.length && user.username) parts.push('@' + user.username);
  return parts.join(' ') || `Пользователь ${user.id}`;
}

function getRarity() {
  const rand = Math.random() * 100;
  let sum = 0;
  for (const [type, chance] of Object.entries(RARITY_CHANCES)) {
    sum += chance;
    if (rand <= sum) return type;
  }
  return 'COMMON';
}

function getCoffeeName(rarity) {
  const names = {
    COMMON: 'Обычный эспрессо',
    UNCOMMON: 'Карамельный латте',
    RARE: 'Кофе "Иллюзия"',
    EPIC: 'Кофе "Хронос"',
    LEGENDARY: Math.random() > 0.5 ? 'Кофе "Регулус"' : 'Кофе "Клео"'
  };
  return names[rarity] || 'Кофе неизвестного сорта';
}

function getMessageForRarity(rarity, count) {
  const messages = {
    COMMON: `Вы получили обычное кофе. (x${count})`,
    UNCOMMON: `Неплохо! Вы получили необычное кофе. (x${count})`,
    RARE: `Ого! Вам досталось редкое кофе! (x${count})`,
    EPIC: `💥 НЕВЕРОЯТНО! Вам выпало сверхъестественное кофе! (x${count})`,
    LEGENDARY: `🔥 ЛЕГЕНДАРНОЕ СОБЫТИЕ! Вы нашли кофе "${getCoffeeName(rarity)}"! Это огромная редкость! (x${count})`
  };
  return messages[rarity];
}

function initUser(userId, userObj) {
  if (!users[userId]) {
    users[userId] = {
      name: getUserName(userObj),
      total: 0,
      types: { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 },
      history: []
    };
  }
}

bot.command('кофе', async (ctx) => {
  const user = ctx.from;
  const now = Date.now();
  const userId = user.id;

  initUser(userId, user);

  if (cooldowns[userId] && now < cooldowns[userId]) {
    const remaining = Math.ceil((cooldowns[userId] - now) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return ctx.reply(`⏳ Ещё рано! Подождите ${minutes} мин ${seconds} сек.`);
  }

  const rarity = getRarity();
  users[userId].total++;
  users[userId].types[rarity]++;
  users[userId].history.push({ date: now, rarity });
  cooldowns[userId] = now + COOLDOWN_MS;

  const countInType = users[userId].types[rarity];
  const coffeeName = getCoffeeName(rarity);
  const message = getMessageForRarity(rarity, countInType);

  await ctx.reply(`☕ Вы взяли чашку кофе!\n\n${coffeeName}\n${message}`);
});

bot.command('кофе хелп', async (ctx) => {
  const text = `☕ **Список команд кофе-бота**:

/кофе — Взять чашку кофе (таймер 5 мин).
/кофе стата вся — Статистика за всё время.
/кофе стата месяц — Статистика за месяц.
/кофе стата неделя — Статистика за неделю.
/кофе стата день — Статистика за день.
/кофе хелп — Показать это меню.`;
  await ctx.reply(text, { parse_mode: 'Markdown' });
});

function getStatsForPeriod(userId, periodMs) {
  const now = Date.now();
  const history = users[userId]?.history || [];
  const filtered = history.filter(item => now - item.date <= periodMs);
  const counts = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
  filtered.forEach(item => counts[item.rarity]++);
  return { total: filtered.length, types: counts };
}

bot.hears(/^\/кофе стата (вся|месяц|неделя|день)$/, async (ctx) => {
  const match = ctx.message.text.match(/^\/кофе стата (вся|месяц|неделя|день)$/);
  if (!match) return;

  const type = match[1];
  const userId = ctx.from.id;
  if (!users[userId] || users[userId].total === 0) {
    return ctx.reply('📊 У вас пока нет истории кофепития.');
  }

  let periodMs, title;
  switch (type) {
    case 'вся': periodMs = Infinity; title = '🏆 Статистика за всё время'; break;
    case 'месяц': periodMs = 30 * 24 * 60 * 60 * 1000; title = '📅 Статистика за месяц'; break;
    case 'неделя': periodMs = 7 * 24 * 60 * 60 * 1000; title = '📆 Статистика за неделю'; break;
    case 'день': periodMs = 24 * 60 * 60 * 1000; title = '☀️ Статистика за день'; break;
  }

  const stats = getStatsForPeriod(userId, periodMs);
  let text = `${title}\n\nВсего чашек: ${stats.total}\n\nРазбивка по редкостям:\n`;
  const labels = { COMMON: 'Обычные', UNCOMMON: 'Необычные', RARE: 'Редкие', EPIC: 'Сверхъестественные', LEGENDARY: 'Легендарные' };

  for (const [key, count] of Object.entries(stats.types)) {
    if (count > 0) text += `• ${labels[key]}: ${count}\n`;
  }
  await ctx.reply(text);
});

bot.command('топ', async (ctx) => {
  const list = Object.values(users).filter(u => u.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  if (list.length === 0) return ctx.reply('Пока никто не пил кофе.');
  let text = '🏆 Топ кофеманов:\n\n';
  list.forEach((u, i) => text += `${i + 1}. ${u.name} — ${u.total} чашек\n`);
  await ctx.reply(text);
});

console.log('🚀 Бот Coffee v2 запускается...');
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
// Фейковый HTTP-сервер, чтобы Render не ругался на отсутствие порта
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running\n');
});

server.listen(PORT, () => {
  console.log(`🚀 Fake HTTP server listening on port \${PORT}`);
});
