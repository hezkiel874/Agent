const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");

// ─── Konfigurasi ───────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Edit system prompt sesuai kepribadian agent kamu
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "Kamu adalah asisten AI pribadi yang cerdas, ramah, dan membantu. " +
  "Jawab pertanyaan dengan jelas dan ringkas dalam Bahasa Indonesia, " +
  "kecuali user meminta bahasa lain.";

const MAX_HISTORY = 20; // jumlah pesan yang diingat per user
// ───────────────────────────────────────────────────────────────

if (!BOT_TOKEN || !ANTHROPIC_API_KEY) {
  console.error("❌ Pastikan BOT_TOKEN dan ANTHROPIC_API_KEY sudah diset di environment variables.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Simpan riwayat percakapan per user
const histories = {};

// ─── Helper ────────────────────────────────────────────────────
function getHistory(chatId) {
  if (!histories[chatId]) histories[chatId] = [];
  return histories[chatId];
}

function addToHistory(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  // Batasi panjang riwayat
  if (history.length > MAX_HISTORY) {
    histories[chatId] = history.slice(-MAX_HISTORY);
  }
}

function clearHistory(chatId) {
  histories[chatId] = [];
}

// ─── Command: /start ───────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "kamu";
  bot.sendMessage(
    msg.chat.id,
    `👋 Halo, *${name}*! Saya adalah agent AI pribadimu.\n\n` +
    `Kamu bisa langsung ngobrol denganku. Perintah yang tersedia:\n\n` +
    `🔄 /reset — Hapus riwayat percakapan\n` +
    `ℹ️ /info — Info tentang agent ini\n` +
    `❓ /help — Bantuan`,
    { parse_mode: "Markdown" }
  );
});

// ─── Command: /reset ───────────────────────────────────────────
bot.onText(/\/reset/, (msg) => {
  clearHistory(msg.chat.id);
  bot.sendMessage(msg.chat.id, "✅ Riwayat percakapan telah dihapus. Mari mulai dari awal!");
});

// ─── Command: /info ────────────────────────────────────────────
bot.onText(/\/info/, (msg) => {
  const histLen = getHistory(msg.chat.id).length;
  bot.sendMessage(
    msg.chat.id,
    `🤖 *Info Agent*\n\n` +
    `Model: Claude Sonnet\n` +
    `Pesan dalam memori: ${histLen}/${MAX_HISTORY}\n\n` +
    `_System prompt aktif:_\n${SYSTEM_PROMPT}`,
    { parse_mode: "Markdown" }
  );
});

// ─── Command: /help ────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `❓ *Bantuan*\n\n` +
    `Ketik pesan apa saja untuk ngobrol dengan agent AI.\n\n` +
    `*Perintah:*\n` +
    `/start — Mulai bot\n` +
    `/reset — Hapus riwayat chat\n` +
    `/info — Lihat info & status\n` +
    `/help — Tampilkan bantuan ini`,
    { parse_mode: "Markdown" }
  );
});

// ─── Handler pesan utama ───────────────────────────────────────
bot.on("message", async (msg) => {
  // Abaikan command
  if (msg.text && msg.text.startsWith("/")) return;
  // Abaikan jika bukan pesan teks
  if (!msg.text) {
    bot.sendMessage(msg.chat.id, "Maaf, saya hanya bisa memproses pesan teks saat ini.");
    return;
  }

  const chatId = msg.chat.id;
  const userText = msg.text;

  // Tambahkan ke riwayat
  addToHistory(chatId, "user", userText);

  // Tampilkan indikator "mengetik..."
  bot.sendChatAction(chatId, "typing");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: getHistory(chatId),
    });

    const reply = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Simpan balasan ke riwayat
    addToHistory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("Error dari Claude API:", err.message);

    // Hapus pesan user terakhir dari history jika gagal
    const history = getHistory(chatId);
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history.pop();
    }

    bot.sendMessage(
      chatId,
      "⚠️ Maaf, terjadi kesalahan. Silakan coba lagi beberapa saat."
    );
  }
});

// ─── Error handling global ─────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

console.log("🤖 Bot Telegram Agent AI berjalan...");
