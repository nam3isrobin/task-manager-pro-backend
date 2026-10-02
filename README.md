# TaskManager Pro — Backend REST API

High-performance, secure backend API for **TaskManager Pro** featuring full task and subtask orchestration, commentary threads, activity audit trails, role-based access control, and single root administrator governance.

## Tech Stack
- **Runtime**: Node.js v18+
- **Framework**: Express 4.18
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) with direct registration (OTP-free)
- **Email Service**: Gmail SMTP with graceful development fallbacks

## API Modules
- `/api/auth`: User registration, direct login, password reset, and user profiling
- `/api/tasks`: Full task CRUD, filtering, Kanban status updates, subtasks, and commentary
- `/api/admin`: Root administrator governance and user access management
- `/api/health`: System uptime and MongoDB connectivity telemetry

## Local Setup
```bash
npm install
cp .env.example .env
npm run dev
```

Run tests:
```bash
npm test
```
