# Telegram Chat Bot

Telegram anonymous chat bot built with **TypeScript, GrammY, and Prisma**.

## Architecture & Matching Flow

### 1. In-Memory Key Matching
- Users connect via Telegram deep links or `/start <match_key>`.
- The bot does **not** check pre-generated keys in a database pool.
- When **User 1** starts with a `match_key`:
  - If the key was already used in DB, the bot informs them that the key is invalid.
  - If the key is new, User 1 is registered in the in-memory waiting queue.
- When **User 2** starts with the **same** `match_key`:
  - The bot detects the match in memory.
  - Creates the private chat for both users.
  - **Saves the match key in the database**.
  - Automatically sets the active chat for both users and notifies both of them.
- When **User 3** (or any subsequent user) starts with the same `match_key`:
  - The bot detects that the key already exists in the database.
  - Responds with an invalid key message (`❌ این کلید نامعتبر است یا قبلاً استفاده شده است`).

### 2. User Features
- **Direct Messaging**: Messages sent by a user are forwarded directly to their active chat partner.
- **Show Partner Profile (نمایش پروفایل کاربر)**: Displays the real Telegram profile picture and name of the active chat partner.
- **Chat Management (چت ها)**: Lists active chats, allowing users with multiple matches to switch conversations seamlessly.
- **Terminate Chat (پایان چت)**: Prompts confirmation, ends the chat, notifies the partner, and switches to the next available chat or clears active chat.

## Database Schema (Prisma)
- **User**: Telegram user identity and active chat session tracking.
- **Match**: Completed matches with `matchKey` (@unique), `user1Id`, `user2Id`.
- **Chat**: Chat room created for the match.
- **ChatParticipant**: Links users to the chat room.
- **Message**: History of messages exchanged in the chat room.

## Scripts

```bash
# Build
npm run build

# Run in development mode
npm run start:dev

# Run in production mode
npm start

# Run tests
npm test

# Prisma migrations / generate
npm run prisma:generate
npm run prisma:push
```

## Environment Variables (.env)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_channel_dev?schema=public"
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_BOT_USERNAME="your_bot_username"
NODE_ENV="development"
TELEGRAM_POLLING="true"
```
