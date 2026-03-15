# Claude Code Prompt Framework

This document contains prompt templates to guide Claude Code when
implementing the system.

------------------------------------------------------------------------

## 1. Initialize Repository

Prompt:

You are a senior software architect.

Read the documentation in the docs folder.

Initialize a monorepo project structure using TypeScript.

Create directories:

repo ├ frontend ├ backend ├ parser ├ shared ├ docs └ infra

------------------------------------------------------------------------

## 2. Implement Parser

Prompt:

Implement the DBML parser module.

Read docs/dbml-grammar.md.

Requirements:

-   tokenizer
-   recursive descent parser
-   AST generation
-   validation rules

Module structure:

parser ├ tokenizer.ts ├ parser.ts ├ ast.ts ├ validator.ts └ index.ts

Public API:

parseDBML(schema: string): DatabaseSchema

------------------------------------------------------------------------

## 3. Implement Diagram Engine

Prompt:

Create diagram engine that converts AST to graph structure.

Requirements:

-   Node = Table
-   Edge = Relationship
-   Layout using Dagre

------------------------------------------------------------------------

## 4. Implement Frontend

Prompt:

Implement Next.js frontend application.

Requirements:

-   Monaco editor
-   React Flow diagram rendering
-   Real-time parsing

Modules:

editor diagram state api

------------------------------------------------------------------------

## 5. Implement Backend

Prompt:

Implement backend services using NestJS.

Features:

-   project management
-   diagram storage
-   share links

Database: PostgreSQL

------------------------------------------------------------------------

## 6. Integrate System

Prompt:

Integrate frontend, backend, parser, and diagram engine.

Ensure the full flow works:

schema → parser → diagram → render

------------------------------------------------------------------------

## 7. Performance Optimization

Prompt:

Optimize rendering performance.

Support:

-   200 tables
-   1000 relationships

Techniques:

-   viewport rendering
-   lazy edge rendering
-   layout caching
