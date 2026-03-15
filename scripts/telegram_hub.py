"""
Telegram Command & Control (C2) Hub — AegisCorp
Secure remote management bridge for the agent squad.
"""

import os
import logging
import asyncio
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# Load environment
project_root = Path(__file__).parent.parent
load_dotenv(project_root / '.env')

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger("AegisCorp.Telegram")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
# CHAT_ID is used for whitelisting. If 'your_chat_id_here', we'll allow the first user to bind.
ALLOWED_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

class TelegramHub:
    def __init__(self):
        self.app = ApplicationBuilder().token(TOKEN).build()
        self._setup_handlers()
        logger.info("🤖 Telegram Hub initialized.")

    def _setup_handlers(self):
        self.app.add_handler(CommandHandler("start", self.start_command))
        self.app.add_handler(CommandHandler("status", self.status_command))
        self.app.add_handler(CommandHandler("alex", self.alex_command))
        self.app.add_handler(CommandHandler("monica", self.monica_command))
        self.app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), self.handle_message))

    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Welcome message and identity verification."""
        chat_id = update.effective_chat.id
        user = update.effective_user.first_name
        
        # Check if whitelisted
        global ALLOWED_CHAT_ID
        if ALLOWED_CHAT_ID == "your_chat_id_here":
            # Bind to the first person who talks to it (CEO setup mode)
            ALLOWED_CHAT_ID = str(chat_id)
            await update.message.reply_text(
                f"🛡️ **Terminal Secured.**\n\nWelcome CEO {user}. I have bound this bot to your Chat ID: `{chat_id}`.\n\n"
                f"You can now control the AegisCorp squad from this terminal.",
                parse_mode='Markdown'
            )
            # Update .env programmatically if possible, or just log it
            logger.info(f"✅ Bound Telegram Hub to Chat ID: {chat_id}")
        elif str(chat_id) != str(ALLOWED_CHAT_ID):
            await update.message.reply_text("🚫 Access Denied. Unauthorized user detected.")
            return

        keyboard = [['/status', '/roi'], ['/alex', '/monica']]
        reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
        
        await update.message.reply_text(
            "📍 **AegisCorp Command & Control Hub**\n\n"
            "Systems are green. The squad is standing by.\n\n"
            "Directives can be issued via /monica or research via /alex.",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Returns the current squad status."""
        if str(update.effective_chat.id) != str(ALLOWED_CHAT_ID): return
        
        # Mocking status for initial setup
        # In production, this pulls from analytics.json and coin-base reports
        status_msg = (
            "📊 **Current Squad Status**\n\n"
            "👑 **Monica**: Lead (Coordination)\n"
            "🔍 **Alex**: Active (Market Sweep)\n"
            "🎨 **Zara**: Idle (Drafting complete)\n"
            "💻 **Dev**: Working (CI/CD Optimization)\n\n"
            "📈 **Net Performance**: $1,240.50 (Live)\n"
            "🧠 **Intelligence Spend**: 4.2k tokens used"
        )
        await update.message.reply_text(status_msg, parse_mode='Markdown')

    async def alex_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Pass a message to Alex (Research)."""
        if str(update.effective_chat.id) != str(ALLOWED_CHAT_ID): return
        query = " ".join(context.args)
        if not query:
            await update.message.reply_text("🔍 Please provide a research topic. Usage: `/alex check BTC price`", parse_mode='Markdown')
            return
            
        await update.message.reply_text(f"🔍 **Alex**: Receiving research directive... analyzing `{query}`", parse_mode='Markdown')
        # Here we would trigger Alex's agent logic

    async def monica_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Pass a message to Monica (Lead)."""
        if str(update.effective_chat.id) != str(ALLOWED_CHAT_ID): return
        directive = " ".join(context.args)
        if not directive:
            await update.message.reply_text("👑 Please provide a directive. Usage: `/monica scale outreach`", parse_mode='Markdown')
            return
            
        await update.message.reply_text(f"👑 **Monica**: Lead directive received: `{directive}`. Distributing to specialists.", parse_mode='Markdown')

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Fallback for non-command text."""
        if str(update.effective_chat.id) != str(ALLOWED_CHAT_ID): return
        await update.message.reply_text("Enter a command or talk to an agent (e.g., /alex, /monica).")

    def run(self):
        logger.info("🚀 Telegram Hub starting...")
        self.app.run_polling()

if __name__ == "__main__":
    hub = TelegramHub()
    hub.run()
