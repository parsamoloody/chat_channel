# Telegram Chat Bot

Telegram anonymous chat bot built with TypeScript, GrammY, and Prisma ORM.

---

## Prerequisites

- Node.js (version 18 or higher recommended)
- PostgreSQL database
- Telegram Bot Token (obtained from @BotFather)

---

## Setup and Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/chat_db?schema=public"
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_BOT_USERNAME="your_bot_username"
NODE_ENV="production"
TELEGRAM_POLLING="true"

# Optional: Media and Rate Limit Configuration
MEDIA_RATE_LIMIT_ENABLED="false"
MEDIA_FILE_SIZE_LIMIT_ENABLED="false"
MEDIA_RATE_LIMIT_COUNT=10
MEDIA_RATE_LIMIT_UNIT="hour"
MEDIA_RATE_LIMIT_PERIOD=1
MEDIA_MAX_FILE_SIZE_MB=5
```

### 3. Setup Database Schema

Push the Prisma schema to your PostgreSQL database:

```bash
npm run prisma:generate
npm run prisma:push
```

### 4. Build the Project

Compile TypeScript source files into the `dist` directory:

```bash
npm run build
```

---

## Running the Application

### Development Mode

Run directly with hot-reload via `ts-node`:

```bash
npm run start:dev
```

### Production Mode (Standard)

```bash
npm start
```

### Running with PM2 (Recommended for Production)

Using PM2 keeps the application running continuously in the background and handles restarts.

1. Install PM2 globally (if not already installed):

```bash
npm install -g pm2
```

2. Start the application using the ecosystem config file:

```bash
pm2 start ecosystem.config.js
```

Or start directly with the main build file:

```bash
pm2 start dist/src/main.js --name "chat-channel" --time
```

3. Enable automatic start on server reboot:

```bash
pm2 startup
```

Run the specific command generated in your terminal output (e.g. `sudo env PATH=... pm2 startup systemd -u ...`), then save the running processes:

```bash
pm2 save
```

4. Common PM2 management commands:

```bash
# Check status
pm2 status

# View live logs
pm2 logs chat-channel

# Restart application
pm2 restart chat-channel

# Stop application
pm2 stop chat-channel
```

---

## Testing

Run unit and integration test suites:

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with code coverage
npm run test:cov
```

---

## Application Features and Architecture

### 1. Matching Flow
- Users connect through Telegram deep links using `/start <match_key>`.
- The first user with a unique `match_key` is placed into an in-memory waiting queue.
- When the second user starts with the same `match_key`, the bot links both users, creates the private chat, stores the match key in the database, and connects them directly.
- Any subsequent user trying to reuse an existing `match_key` receives an invalid or expired key notice.

### 2. User Controls
- Direct Messaging: Messages, media, stickers, and animations are forwarded to the active chat partner.
- Show Partner Profile: Displays the Telegram profile picture and name of the active partner.
- Chat Management: Lists all existing conversations and allows users to switch active chats.
- Terminate Chat: Closes the current conversation with confirmation and prompts the next available chat if present.

---

## Database Models

- User: Telegram user profile, active chat reference, and status.
- Match: Pair record storing the unique `matchKey`, `user1Id`, and `user2Id`.
- Chat: Private room established between matched users.
- ChatParticipant: Association between users and chats.
- Message: Log of exchanged messages and media references.
