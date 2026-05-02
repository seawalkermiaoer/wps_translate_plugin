# Server TS Migration & Pino Logger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the backend to TypeScript, enforce ESLint `no-console` rules, and implement a unified Pino logger with AsyncLocalStorage-based request tracking.

**Architecture:** 
1. **TS Migration**: Move JS files to `src/` and rewrite to TS.
2. **ESLint**: Enforce no-console to ensure clean production code.
3. **Logger Context**: Use `AsyncLocalStorage` to store `requestId` at the start of the request, and use Pino's `mixin` to automatically inject it into all logs without passing `req` everywhere.
4. **Pino Http**: Bind HTTP request logging to capture incoming traffic, ignoring `/api/health`.

**Tech Stack:** TypeScript, Express, Pino, pino-http, ESLint.

---

### Task 1: TS Migration & File Restructuring

**Files:**
- Create: `server/tsconfig.json`
- Modify: `server/package.json`
- Rename & Modify: `server/server.js` -> `server/src/server.ts`
- Rename & Modify: `server/routes/translate.js` -> `server/src/routes/translate.ts`
- Rename & Modify: `server/services/llm.js` -> `server/src/services/llm.ts`

**Step 1: Install dependencies**
Run: `cd server && npm i -D typescript @types/node @types/express @types/cors tsx`

**Step 2: Initialize tsconfig**
Create `server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Update package.json**
Change scripts: `"start": "node dist/server.js"`, `"dev": "tsx watch src/server.ts"`, `"build": "tsc"`

**Step 4: Rename and refactor code**
Move files to `server/src/` and change `require` to `import`. Add basic typings for `req` and `res`.

**Step 5: Commit**
```bash
git add server && git commit -m "chore: migrate server to typescript"
```

### Task 2: ESLint Setup

**Files:**
- Create: `server/.eslintrc.js`
- Modify: `server/package.json`

**Step 1: Install ESLint dependencies**
Run: `cd server && npm i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin`

**Step 2: Create config**
Create `server/.eslintrc.js`:
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  },
  env: {
    node: true
  }
};
```

**Step 3: Add script**
Add `"lint": "eslint src --ext .ts"` to `package.json`.

**Step 4: Commit**
```bash
git add server && git commit -m "chore: configure eslint with no-console"
```

### Task 3: Implement Pino Logger

**Files:**
- Create: `server/src/lib/logger.ts`

**Step 1: Install Pino**
Run: `cd server && npm i pino pino-http uuid`
Run: `cd server && npm i -D pino-pretty @types/uuid`

**Step 2: Write logger.ts**
```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const asyncLocalStorage = new AsyncLocalStorage<string>();
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    service: process.env.SERVICE_NAME ?? 'wps-translate-server',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const reqId = asyncLocalStorage.getStore();
    return reqId ? { requestId: reqId } : {};
  },
  redact: {
    paths: [
      'password', 'token', 'authorization',
      '*.password', '*.token',
      'req.headers.authorization', 'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

**Step 3: Commit**
```bash
git add server/src/lib/logger.ts server/package* && git commit -m "feat(logger): implement pino logger instance"
```

### Task 4: Integrate Logger and Replace Console

**Files:**
- Modify: `server/src/server.ts`
- Modify: `server/src/routes/translate.ts`
- Modify: `server/src/services/llm.ts`

**Step 1: Add ALS & pino-http middleware to server.ts**
```typescript
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { logger, asyncLocalStorage } from './lib/logger';

// Before other middlewares
app.use((req, res, next) => {
  const reqId = (req.headers['x-request-id'] as string) || randomUUID();
  asyncLocalStorage.run(reqId, () => {
    next();
  });
});

app.use(pinoHttp({
  logger,
  genReqId: () => asyncLocalStorage.getStore() || randomUUID(),
  autoLogging: {
    ignore: (req) => req.url === '/api/health'
  }
}));
```

**Step 2: Replace console calls**
Use `logger.info`, `logger.error` etc. Make sure errors are passed properly: `logger.error({ err }, "msg")` instead of string interpolation.

**Step 3: Run lint**
Run `npm run lint` and verify it passes without `no-console` warnings.

**Step 4: Commit**
```bash
git add server && git commit -m "feat: replace console with pino logger and add http logging"
```
