# City Crafters — Wallet System

A production-quality async wallet microservice built with **NestJS**, **MySQL (TypeORM)**, **Redis**, and **BullMQ**.

---

## Architecture

```
┌─────────────────────────────────┐       ┌──────────────────────────────┐
│            API Service          │       │         Worker Service        │
│                                 │       │                               │
│  POST /wallet                   │       │  @Processor(TRANSFER_QUEUE)   │
│  GET  /wallet/:userId           │──┐    │  handleTransfer(job)          │
│  POST /transfer   ──► Queue ───►│  │    │   ├─ idempotency guard        │
│  GET  /transaction/:id          │  └───►│   ├─ acquire row locks        │
│  GET  /health                   │       │   ├─ authoritative balance chk│
└─────────────────────────────────┘       │   ├─ atomic DB transaction    │
                                          │   └─ update status            │
          MySQL ◄───────────────────────────────────────────────────────┘
          Redis (BullMQ) ◄──────────────────────────────────────────────
```

### Monorepo layout

```
apps/
  api/         → HTTP API (controllers, services, queue producer)
  worker/      → BullMQ consumer (no HTTP port)
libs/
  common/      → Shared TypeORM entities + queue constants
```

---

## How to run

### Via Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

The API will be available at `http://localhost:3000`.

### Local development

```bash
# Prerequisites: MySQL 8 and Redis 7 running locally

cp .env.example .env        # adjust values as needed
npm install

# Terminal 1 – API
npm run start:api:dev

# Terminal 2 – Worker
npm run start:worker:dev
```

---

## API Reference

### Create wallet

```
POST /wallet
{ "userId": "user-abc" }
→ 201 { id, userId, balance: "0.00", ... }
```

### Get wallet balance

```
GET /wallet/:userId
→ 200 { id, userId, balance, ... }
```

### Initiate transfer (async)

```
POST /transfer
{
  "fromUserId": "user-abc",
  "toUserId": "user-xyz",
  "amount": 50.00,
  "idempotencyKey": "<optional-uuid>"   ← prevents duplicate transfers on retry
}
→ 202 { "status": "processing", "transactionId": "<uuid>" }
```

### Poll transaction status

```
GET /transaction/:id
→ 200 { id, status: "pending"|"completed"|"failed", failureReason?, ... }
```

### Health check

```
GET /health
→ 200 { status: "ok", db: "connected", timestamp }
```

---

## Architecture Decisions & Trade-offs

### 1. Row-level locking instead of optimistic locking

The worker acquires `SELECT … FOR UPDATE` locks on both wallet rows before modifying balances. This is the most straightforward way to guarantee mutual exclusion in MySQL InnoDB without application-level retry logic.

**Trade-off:** Higher lock contention under extreme concurrency. Mitigation: locks are held for microseconds (a single balance update), so throughput is still very high in practice.

### 2. Deterministic lock ordering to prevent deadlocks

When transferring between user A and user B, we always acquire the lock for the alphabetically-first userId first. This ensures that two concurrent transfers (A→B and B→A) lock rows in the same order, eliminating the circular-wait condition that causes deadlocks.

### 3. Two-phase balance check

- **Optimistic pre-check** in the API service (fast fail, avoids creating a pending transaction for obviously invalid requests)
- **Authoritative check** inside the DB transaction in the worker (the only check that actually prevents double-spending)

The pre-check can produce false negatives under load (race window between check and job dispatch), but the authoritative check always wins.

### 4. Idempotency at two levels

| Level | Mechanism |
|---|---|
| API | `idempotencyKey` column with unique index; duplicate requests return the existing transaction |
| Worker | Checks `transaction.status` before processing; skips if already `completed`/`failed` |
| BullMQ | Job ID = `transactionId`; BullMQ deduplicates jobs with the same ID |

### 5. Permanent vs transient failures

`InsufficientFundsError` marks the transaction `failed` immediately and returns without throwing, so BullMQ does **not** retry it. All other errors (DB outages, deadlocks) are re-thrown and retried up to 3 times with exponential backoff (2s, 4s, 8s).

### 6. DECIMAL(18,2) for balances

Floating-point types (`FLOAT`, `DOUBLE`) cannot represent all decimal values exactly. Using `DECIMAL(18,2)` stores money as a fixed-point number and avoids rounding errors.

---

## Concurrency Guarantee Summary

| Scenario | Protection |
|---|---|
| Two concurrent transfers from the same wallet | `FOR UPDATE` lock — second job waits until first commits |
| Worker crash mid-transfer | DB transaction rolls back; BullMQ retries the job; idempotency guard skips if already settled |
| Network retry with same idempotency key | Unique index on `idempotency_key`; duplicate returned without re-processing |
| A→B and B→A simultaneously | Deterministic lock ordering eliminates deadlock |
| Negative / zero amounts | `@Min(0.01)` validation in DTO |
| Same sender and receiver | Explicit check in `TransferService` |
