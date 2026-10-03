# Getting Started & Usage Guide: Telegram Hidden Chat Bot

This guide provides a step-by-step walkthrough on how to set up, run, test, and use the **Telegram Hidden Chat Bot**.

---

## 1. What is the Hidden Chat Bot?

In dating platforms, once two users mutually match in a **Dating Bot**, they are provided with a dedicated link to a separate **Chat Bot**. 

The Chat Bot:
1. Receives matched users via a Telegram deep link (`https://t.me/<bot>?start=ref_<matchId>`).
2. Associates their Telegram account with an internal User profile.
3. Automatically pairs the two users into a private, **hidden chat**.
4. Keeps the chat hidden from normal chat lists so it cannot be found by unauthorized users.
5. Reliably delivers messages between the two matched participants.
6. Provides an administrative API for moderators and dating bot admins to audit chats and referrals.

---

## 2. Prerequisites

- **Node.js**: version `20.x` or higher (`node -v`)
- **npm**: version `10.x` or higher (`npm -v`)
- **PostgreSQL**: Running locally or on a remote server (`psql --version`)
- **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather) on Telegram

---

## 3. Configuration (`.env`)

Your project configuration is located in `.env`:

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://chat_app:root@localhost:5432/chat_db"

# Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN="8599741980:AAFnSp2gn_nWI04o6dUrwpkndJD3sdpsvcI"

# Secret key for Admin moderation API endpoints
ADMIN_API_KEY="dev_admin_api_key_hidden_chats"

# Server port
PORT=3000

# Environment mode ('development', 'production', 'test')
NODE_ENV=development

# Optional: Set to 'true' to run Telegram in Polling mode for local testing
TELEGRAM_POLLING=false
```

---

## 4. Step-by-Step Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Push Database Schema to PostgreSQL
Generate the Prisma client and synchronize the schema with PostgreSQL:
```bash
npm run prisma:generate
npm run prisma:push
```

### Step 3: Run the Automated Test Suite
Run all unit, integration, and E2E tests:
```bash
npm test
```
All 68 tests will execute sequentially against PostgreSQL and pass cleanly.

---

## 5. How to Run the Bot

You have two operating modes:

### Option A: Local Development with Polling (Easiest for Local Testing)
In polling mode, the bot continuously connects directly to Telegram. You do **not** need a public HTTPS domain or ngrok!

1. Edit `.env` and set:
   ```env
   TELEGRAM_POLLING=true
   ```
2. Start the development server:
   ```bash
   npm run start:dev
   ```
3. Open Telegram, search for your bot, and send `/start`!

---

### Option B: Production Mode with Webhooks
In production, Telegram pushes updates directly to your server via HTTPS webhooks.

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```
3. Set your webhook with Telegram:
   ```bash
   curl -F "url=https://your-domain.com/api/v1/telegram/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
   ```

---

## 6. How the System Works in Practice

### Scenario 1: Dating Bot Creates a Match
1. Two users, Alice and Bob, match in the Dating Bot.
2. The Dating Bot inserts a Match record (or syncs via API):
   ```sql
   INSERT INTO "Match" ("id", "externalMatchId", "user1Id", "user2Id", "status", "createdAt")
   VALUES (gen_random_uuid(), 'match_1001', '<alice_uuid>', '<bob_uuid>', 'ACTIVE', NOW());
   ```
3. The Dating Bot gives Alice and Bob the deep link:
   ```text
   https://t.me/your_chat_bot?start=ref_match_1001
   ```

### Scenario 2: Alice Opens the Chat Bot
1. Alice clicks the link. Telegram opens the Chat Bot with `/start ref_match_1001`.
2. The bot:
   - Creates Alice's User record.
   - Parses `ref_match_1001` -> extracts reference ID `match_1001`.
   - Resolves the match and verifies Alice is an authorized participant.
   - Atomically creates a **Hidden Chat** with Alice and Bob as participants.
   - Responds:
     > *"🎉 You have been connected to a private hidden chat with your match! Any messages you send here are private between you two."*

### Scenario 3: Bob Opens the Chat Bot
1. Bob clicks the same link (`https://t.me/your_chat_bot?start=ref_match_1001`).
2. The bot finds the existing hidden chat, links Bob, and responds:
   > *"🎉 You have been connected to a private hidden chat with your match!"*
3. Because of database unique constraints (`Chat.matchId`), no duplicate chats are created.

### Scenario 4: Chatting Between Matched Users
- When Alice types a message into Telegram:
  ```text
  Hey Bob! Nice to match with you!
  ```
- The Chat Bot saves the message in the hidden chat and relays it to Bob's Telegram chat:
  ```text
  💬 Hey Bob! Nice to match with you!
  ```

### Scenario 5: Organic User (No Referral Link)
- If a random user opens the bot and clicks `/start` without a link:
- The bot responds:
  > *"Welcome! You entered without a match referral link. When you match with someone in our dating service, click their link to start a private chat."*
- No chats or invalid associations are created.

---

## 7. REST API Usage Examples

You can test these endpoints using `curl` or Postman.

### 1. Healthcheck
```bash
curl -X GET http://localhost:3000/api/v1/health
```
**Response:**
```json
{
  "status": "ok",
  "service": "hidden-chat-bot",
  "timestamp": "2026-10-03T18:50:00.000Z"
}
```

---

### 2. User Chat List (`GET /api/v1/chats`)
Normal users only see non-hidden chats. Hidden chats are **strictly excluded**.
```bash
curl -X GET http://localhost:3000/api/v1/chats \
  -H "x-user-id: <user_uuid>"
```
**Response:**
```json
{
  "data": []
}
```

---

### 3. Access a Specific Chat (`GET /api/v1/chats/:chatId`)
A participant can access their chat:
```bash
curl -X GET http://localhost:3000/api/v1/chats/<chat_id> \
  -H "x-user-id: <authorized_participant_uuid>"
```

If an unauthorized user tries to access the chat:
```bash
curl -X GET http://localhost:3000/api/v1/chats/<chat_id> \
  -H "x-user-id: <intruder_uuid>"
```
**Response (`403 Forbidden`):**
```json
{
  "statusCode": 403,
  "error": "UserNotChatParticipantError",
  "message": "You are not authorized to access this chat"
}
```

---

### 4. Send a Message (`POST /api/v1/chats/:chatId/messages`)
```bash
curl -X POST http://localhost:3000/api/v1/chats/<chat_id>/messages \
  -H "Content-Type: application/json" \
  -H "x-user-id: <authorized_participant_uuid>" \
  -d '{"content": "Hello there!"}'
```

---

### 5. Read Messages (`GET /api/v1/chats/:chatId/messages`)
```bash
curl -X GET "http://localhost:3000/api/v1/chats/<chat_id>/messages?limit=20&offset=0" \
  -H "x-user-id: <authorized_participant_uuid>"
```

---

### 6. Admin: List All Hidden Chats (`GET /api/v1/admin/chats`)
Requires `x-admin-key`:
```bash
curl -X GET "http://localhost:3000/api/v1/admin/chats?limit=10&offset=0" \
  -H "x-admin-key: dev_admin_api_key_hidden_chats"
```
**Response:**
```json
{
  "data": [
    {
      "chat": {
        "id": "e36e1c45-...",
        "matchId": "match-uuid",
        "visibility": "HIDDEN",
        "title": "Match Chat (12345)",
        "createdAt": "2026-10-03T18:00:00.000Z"
      },
      "participants": [
        { "id": "p1", "chatId": "...", "userId": "alice-uuid", "role": "MEMBER" },
        { "id": "p2", "chatId": "...", "userId": "bob-uuid", "role": "MEMBER" }
      ]
    }
  ],
  "total": 1
}
```

---

### 7. Admin: Inspect Chat, Participants & Match Details (`GET /api/v1/admin/chats/:chatId`)
```bash
curl -X GET http://localhost:3000/api/v1/admin/chats/<chat_id> \
  -H "x-admin-key: dev_admin_api_key_hidden_chats"
```

---

### 8. Admin: Audit Referral History (`GET /api/v1/admin/referrals`)
```bash
curl -X GET "http://localhost:3000/api/v1/admin/referrals?limit=50" \
  -H "x-admin-key: dev_admin_api_key_hidden_chats"
```
**Response:**
```json
{
  "data": [
    {
      "id": "ref-1",
      "userId": "user-uuid",
      "type": "MATCH",
      "referenceId": "12345",
      "source": "REFERRAL",
      "rawPayload": "ref_12345",
      "status": "RESOLVED",
      "createdAt": "2026-10-03T18:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

## 8. Summary of NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run start:dev` | `ts-node -r reflect-metadata src/main.ts` | Runs server in development mode with live execution |
| `npm run build` | `tsc` | Compiles TypeScript into `./dist/` |
| `npm start` | `node dist/src/main.js` | Runs compiled production server |
| `npm test` | `jest --runInBand` | Runs all 68 unit, integration, and E2E tests |
| `npm run test:unit` | `jest --testPathPattern="unit"` | Runs unit tests |
| `npm run test:integration` | `jest --testPathPattern="integration" --runInBand` | Runs database integration tests |
| `npm run test:e2e` | `jest --testPathPattern="e2e" --runInBand` | Runs E2E scenario API tests |
| `npm run prisma:generate` | `prisma generate` | Generates typed Prisma Client |
| `npm run prisma:push` | `prisma db push` | Syncs schema with PostgreSQL |
