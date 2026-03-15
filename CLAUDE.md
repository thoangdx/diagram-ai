# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based database schema design platform (dbdiagram.io clone) where users write DBML text to generate ER diagrams. The codebase is in early implementation phase — docs are complete, source code is being built.

## Repository Structure

```
frontend/     Next.js + React + TypeScript UI
backend/      NestJS + TypeScript API server
parser/       DBML tokenizer → parser → AST (standalone module)
shared/       Shared TypeScript types between frontend/backend/parser
infra/        Docker, Nginx configs
docs/         Architecture and specification documents (authoritative reference)
```

## Key Documentation

Before implementing any module, read the relevant spec in `docs/`:

| File | When to read |
|------|-------------|
| `docs/architecture.md` | System overview, domain model, tech stack |
| `docs/dbml-grammar.md` | EBNF grammar — source of truth for the parser |
| `docs/dbdiagram-clone-spec.md` | All-in-one implementation spec |
| `docs/layout-engine.md` | Dagre-based ERD layout algorithm |
| `docs/sql-import.md` | SQL DDL → DBML conversion pipeline |
| `docs/ai-schema-generator.md` | LLM-based DBML generation |
| `docs/collaboration.md` | Real-time editing via Yjs + WebSockets |

## Architecture

### Data Flow

```
DBML text (Monaco Editor)
  → parser/ (tokenize → parse → AST)
  → layout engine (AST → Dagre graph → node positions)
  → React Flow renderer (frontend/diagram/)
```

### Parser Pipeline

```
DBML text → Tokenizer → Token stream → Recursive descent parser → AST
```

Key files (to be created): `parser/src/tokenizer.ts`, `parser/src/parser.ts`, `parser/src/ast.ts`, `parser/src/validator.ts`

### Backend Modules (NestJS)

`project`, `diagram`, `auth`, `sql-import`, `ai`, `collaboration`

API: `GET/POST /projects`, `GET/POST /diagram/:id`, `GET /d/{id}` (public share)

### Frontend Modules

`editor/` — Monaco Editor integration
`diagram/` — React Flow canvas
`components/` — Shared UI
`api/` — API client calls

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Monaco Editor, React Flow, Dagre
- **Backend:** Node.js, NestJS, TypeScript
- **Database:** PostgreSQL
- **Infra:** Docker, Nginx

## Development Roadmap (from `docs/promt_layout.txt`)

1. Initialize repository (package.json, tsconfig, workspace setup)
2. Implement `parser/` module using the DBML grammar in `docs/dbml-grammar.md`
3. Implement layout engine using Dagre (see `docs/layout-engine.md`)
4. Build frontend editor + diagram renderer
5. Build NestJS backend

## DBML Syntax Reference

```dbml
Table users {
  id int [pk]
  name varchar
  email varchar [not null, unique]
}

Table orders {
  id int [pk]
  user_id int [ref: > users.id]
  created_at timestamp
}
```

Column options: `pk`, `not null`, `unique`, `ref: > table.col` (many-to-one), `ref: < table.col` (one-to-many), `ref: - table.col` (one-to-one)

## Performance Targets

- Support up to 200 tables and 1000 relationships
- Use viewport rendering, lazy edge rendering, and layout caching
