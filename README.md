# Telegram Hidden Chat Bot — Modular Monolith

A production-ready Telegram "Hidden Chat" Bot designed as a **Modular Monolith** using **Node.js, TypeScript, NestJS, Prisma, and GrammY**.

This system is an independent chat bot that connects users who have matched with each other in an external Dating Bot via Telegram deep links (`https://t.me/chat_bot?start=ref_<context>`).

---

## 1. System Architecture

The application is structured as a **Modular Monolith** adhering to Clean Architecture and Domain-Driven Design (DDD) principles.

```
src/
├── app/
│   ├── app.module.ts                   # Root application module aggregating domain modules
│   └── app.controller.ts               # Healthcheck endpoint (GET /api/v1/health)
│
├── modules/
│   ├── telegram/                       # Telegram presentation & adapter layer
│   │   ├── application/                # HandleTelegramStartUseCase, HandleTelegramMessageUseCase
│   │   ├── infrastructure/             # TelegramBotService (GrammY instance & lifecycle)
│   │   ├── presentation/               # TelegramController (Webhook POST /api/v1/telegram/webhook)
│   │   └── telegram.module.ts
│   │
│   ├── users/                          # User identity module
│   │   ├── application/                # FindOrCreateTelegramUserUseCase
│   │   ├── domain/                     # User entity, IUserRepository interface
│   │   ├── infrastructure/             # PrismaUserRepository
│   │   └── users.module.ts
│   │
│   ├── referrals/                      # Referral & Deep-link ingestion module
│   │   ├── application/                # ProcessReferralUseCase
│   │   ├── domain/                     # Referral entity, ReferralPayload VO, ReferralType, IReferralRepository
│   │   ├── infrastructure/             # PrismaReferralRepository
│   │   └── referrals.module.ts
│   │
│   ├── matches/                        # Dating Match Context module
│   │   ├── application/                # ResolveMatchContextUseCase
│   │   ├── domain/                     # Match entity, MatchStatus, IMatchRepository
│   │   ├── infrastructure/             # PrismaMatchRepository
│   │   └── matches.module.ts
│   │
│   ├── chats/                          # Chat & Participant authorization module
│   │   ├── application/                # GetOrCreateMatchChatUseCase, GetUserChatsUseCase, GetChatDetailsUseCase
│   │   ├── domain/                     # Chat entity, ChatParticipant entity, ChatVisibility, IChatRepository
│   │   ├── infrastructure/             # PrismaChatRepository
│   │   ├── presentation/               # ChatsController
│   │   └── chats.module.ts
│   │
│   ├── messages/                       # Chat Messaging module
│   │   ├── application/                # SendMessageUseCase, GetChatMessagesUseCase
│   │   ├── domain/                     # Message entity, IMessageRepository
│   │   ├── infrastructure/             # PrismaMessageRepository
│   │   ├── presentation/               # MessagesController
│   │   └── messages.module.ts
│   │
│   └── admin/                          # Administrative oversight & auditing module
│       ├── application/                # AdminInspectChatUseCase, AdminListHiddenChatsUseCase, AdminListReferralsUseCase
│       ├── presentation/               # AdminController
│       └── admin.module.ts
│
├── shared/                             # Cross-cutting concerns & shared kernel
│   ├── domain/                         # DomainError hierarchy (NotFoundError, ForbiddenError, ConflictError, ValidationError)
│   ├── infrastructure/                 # PrismaService, EnvConfig validation with Zod
│   ├── presentation/                   # GlobalHttpExceptionFilter, AdminApiKeyGuard, UserAuthGuard
│   └── shared.module.ts
│
└── main.ts                             # Bootstrap entry point
```

---

## 2. Module Responsibilities

| Module | Core Responsibility |
|---|---|
| **Telegram** | Handles Telegram `/start` updates and text messages, webhook ingestion, formatting Telegram replies. **Contains zero business logic**. |
| **Users** | Manages internal `User` identity decoupled from Telegram (`id` vs `telegramUserId`), idempotent profile updates. |
| **Referrals** | Dedicated `ReferralPayload` Value Object parsing deep-link payloads safely, distinguishing organic vs referral starts, recording referral history and statuses. |
| **Matches** | Represents the match relationship between users from the dating service, validates participant ownership and match expiration. |
| **Chats** | Enforces chat visibility (`HIDDEN`), transactional creation of chat + participants, idempotency (`unique(matchId)` and `unique(chatId, userId)`). |
| **Messages** | Enforces participant authorization before creating or viewing messages (`sender belongs to chat`). |
| **Admin** | Programmatic access for administrators to inspect hidden chats, users, match contexts, messages, and referral events. |
| **Shared** | Global exception filter, strict config validation, Prisma client lifecycle, security guards. |

---

## 3. Database Model & Integrity Constraints

Defined in [schema.prisma](file:///home/keyhan/Documents/projects/luniversal/chat_channel/prisma/schema.prisma):

```
User (id PK, telegramUserId UK, username, firstName, lastName, createdAt, updatedAt)
Referral (id PK, userId FK, type, referenceId, source, rawPayload, status, createdAt)
Match (id PK, externalMatchId UK, user1Id FK, user2Id FK, status, expiresAt, createdAt)
Chat (id PK, matchId UK, visibility, title, createdAt, updatedAt)
ChatParticipant (id PK, chatId FK, userId FK, role, joinedAt) [UNIQUE(chatId, userId)]
Message (id PK, chatId FK, senderId FK, content, createdAt, updatedAt)
AdminUser (id PK, username UK, apiKey UK, role, createdAt)
```

### Key Database Guarantees:
- **`Chat.matchId` is UNIQUE**: Exactly one chat can exist for a match. Concurrent attempts to start a chat for the same match resolve to the same chat without race condition duplicates.
- **`ChatParticipant(chatId, userId)` is UNIQUE**: A participant cannot be added twice to the same chat.
- **`User.telegramUserId` is UNIQUE**: Concurrent `/start` commands from the same user cannot duplicate user records.
- **Cascading Foreign Keys & Indexes**: Indexed lookups on foreign keys and unique identifiers ensure fast queries and referential integrity.

---

## 4. Deep-Link Payload Format

Deep links generated by the Dating Bot:

```text
https://t.me/<bot_username>?start=ref_12345
https://t.me/<bot_username>?start=match_a1b2c3d4-e5f6
https://t.me/<bot_username>?start=invite_xyz-999
```

Telegram delivers these to the bot as:

```text
/start ref_12345
/start match_a1b2c3d4-e5f6
```

### Parser Specification (`ReferralPayload` Value Object)
- **Supported Prefixes**: `ref_`, `match_`, `invite_` (case-insensitive).
- **Identifier Validation**: `^[a-zA-Z0-9_-]{1,64}$`.
- **Organic Start (`/start`)**: Explicitly marked as `ReferralSource.ORGANIC`.
- **Error Safety**: Malformed payloads (`ref_`, `random_text`, illegal characters) are safely rejected with descriptive domain messages without throwing unhandled exceptions or crashing the bot.

---

## 5. Complete Request & Authorization Flow

```text
Dating Bot Match Generated
           ↓
User clicks: https://t.me/chat_bot?start=ref_12345
           ↓
Telegram Webhook: POST /api/v1/telegram/webhook (/start ref_12345)
           ↓
TelegramController → TelegramBotService
           ↓
HandleTelegramStartUseCase
  ├── 1. FindOrCreateTelegramUserUseCase (resolves/creates internal User)
  ├── 2. ProcessReferralUseCase (parses payload, checks duplicate processing)
  ├── 3. ResolveMatchContextUseCase (verifies match exists, active, user belongs to match)
  ├── 4. GetOrCreateMatchChatUseCase (transactionally creates hidden chat + participants)
  └── 5. Marks referral as RESOLVED and formats friendly Telegram response
```

### Backend Authorization Rules
1. **User Chat Listing (`GET /api/v1/chats`)**:
   - Queries `WHERE visibility != 'HIDDEN'` at the database level.
   - Hidden chats **never** leak into standard user chat lists.
2. **Chat Access (`GET /api/v1/chats/:chatId`)**:
   - Checks `isParticipant(chatId, requestingUserId)`.
   - Returns `403 Forbidden` if the user is not an active participant.
3. **Message Ingestion & Retrieval (`POST/GET /api/v1/chats/:chatId/messages`)**:
   - Checks `isParticipant(chatId, requestingUserId)`.
   - Returns `403 Forbidden` if unauthorized.
4. **Admin Access (`/api/v1/admin/*`)**:
   - Guarded by `AdminApiKeyGuard`. Requires valid `x-admin-key` or `Authorization: Bearer <key>`.

---

## 6. REST API Endpoints

### User Endpoints (Guarded by `UserAuthGuard` via `x-user-id`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/chats` | Lists user's chats (strictly excludes hidden chats) |
| `GET` | `/api/v1/chats/:chatId` | Retrieves chat details (only for participants) |
| `GET` | `/api/v1/chats/:chatId/messages` | Lists chat messages (only for participants) |
| `POST` | `/api/v1/chats/:chatId/messages` | Sends a message to the chat (only for participants) |

### Admin Endpoints (Guarded by `AdminApiKeyGuard` via `x-admin-key`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/chats` | Lists hidden chats with pagination (`limit`, `offset`) |
| `GET` | `/api/v1/admin/chats/:chatId` | Inspects hidden chat, participants, users, match context |
| `GET` | `/api/v1/admin/chats/:chatId/messages` | Inspects chat message history |
| `GET` | `/api/v1/admin/referrals` | Lists tracked referral events with pagination |

### Telegram & System Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/telegram/webhook` | Telegram update webhook handler |
| `GET` | `/api/v1/health` | Service health status |

---

## 7. Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLite file or PostgreSQL connection URL | `file:./dev.db` |
| `TELEGRAM_BOT_TOKEN` | Bot API token from @BotFather | (required) |
| `ADMIN_API_KEY` | Secret key for admin programmatic access | (required, min 8 chars) |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `TELEGRAM_POLLING` | Set to `true` to enable polling mode instead of webhooks | `false` |

---

## 8. Running the Application & Tests

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Setup & Migrations
```bash
# Install dependencies
npm install

# Generate Prisma Client & Sync Database
npm run prisma:generate
npm run prisma:push
```

### Running Tests
```bash
# Run all tests (unit, integration, e2e)
npm test

# Run unit tests only
npm run test:unit

# Run database integration tests only
npm run test:integration

# Run E2E API scenario tests only
npm run test:e2e
```

### Starting the Server
```bash
# Development mode
npm run start:dev

# Production build & run
npm run build
npm start
```

---

## 9. Assumptions & Design Decisions

1. **Decoupled User Identity**: Users have an internal UUID `User.id` and a unique `telegramUserId`. This prevents coupling domain entities directly to Telegram.
2. **Database-Level Hidden Visibility**: To strictly prevent accidental leakage of hidden chats, queries filtering normal chats apply `WHERE visibility != 'HIDDEN'` in SQL.
3. **Idempotent Match-to-Chat Mapping**: The unique constraint on `Chat.matchId` and transactional creation ensure that duplicate Telegram webhook updates or simultaneous user clicks cannot spawn duplicate chats.
4. **Resilient Deep-Link Handling**: Both Telegram official command entities and raw text `/start ref_...` are supported, guaranteeing compatibility across webhook proxies and test suites.
