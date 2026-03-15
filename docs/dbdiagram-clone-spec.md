# DB Diagram Clone -- Complete AI Implementation Specification

This document consolidates the system architecture, DBML grammar
specification, and Claude Code prompt workflow required to build a
platform similar to dbdiagram.io.

------------------------------------------------------------------------

# 1. Project Overview

This project is a web-based database diagram design platform similar to
dbdiagram.io.

The platform allows developers and database architects to define
database schema using a DSL (DBML - Database Markup Language) and
automatically generate ER diagrams.

Core capabilities:

-   Schema editing using text
-   Automatic diagram generation
-   Interactive visualization
-   Schema storage
-   Shareable diagram links
-   SQL export

Target scale:

-   up to 200 tables
-   up to 1000 relationships

Target users:

-   software engineers
-   database architects
-   backend developers

------------------------------------------------------------------------

# 2. High Level Architecture

Browser\
│\
Frontend Application\
│\
API Layer\
│\
Backend Services\
│\
Database

Core components:

1.  Schema Editor
2.  DBML Parser
3.  Diagram Layout Engine
4.  Diagram Renderer
5.  Project Storage
6.  Share Link Service

------------------------------------------------------------------------

# 3. Technology Stack

Frontend:

-   Next.js
-   React
-   TypeScript
-   Monaco Editor
-   React Flow
-   Dagre Layout Engine

Backend:

-   Node.js
-   NestJS
-   TypeScript

Database:

-   PostgreSQL

Infrastructure:

-   Docker
-   Nginx
-   Cloud hosting

------------------------------------------------------------------------

# 4. Repository Structure

repo

frontend\
editor\
diagram\
components\
api

backend\
auth\
project\
diagram\
parser

shared\
types\
schema

docs

infra

------------------------------------------------------------------------

# 5. Domain Model

Core entities:

Project\
Diagram\
Table\
Column\
Relationship

Project

-   id
-   name
-   owner_id
-   created_at

Diagram

-   id
-   project_id
-   schema_text
-   created_at

------------------------------------------------------------------------

# 6. DBML Overview

Example DSL:

    Table users {
      id int [pk]
      name varchar
    }

    Table orders {
      id int [pk]
      user_id int [ref: > users.id]
    }

Parser must convert DBML text into AST.

------------------------------------------------------------------------

# 7. DBML Grammar (EBNF)

    database        ::= statement*

    statement       ::= table_definition
                      | relationship_definition
                      | note_definition

    table_definition ::= "Table" identifier "{" column_definition* "}"

    column_definition ::= identifier type column_option*

    type            ::= identifier

    column_option   ::= "[" option_list "]"

    option_list     ::= option ("," option)*

    option          ::= "pk"
                      | "not null"
                      | "unique"
                      | reference_option

    reference_option ::= "ref:" relation_direction identifier "." identifier

    relation_direction ::= ">" | "<"

    identifier      ::= letter (letter | digit | "_")*

------------------------------------------------------------------------

# 8. AST Model

TypeScript structure:

``` ts
interface DatabaseSchema {
  tables: TableNode[]
  relations: RelationNode[]
}

interface TableNode {
  name: string
  columns: ColumnNode[]
}

interface ColumnNode {
  name: string
  type: string
  primaryKey?: boolean
  unique?: boolean
  notNull?: boolean
}

interface RelationNode {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
}
```

------------------------------------------------------------------------

# 9. Parser Architecture

Pipeline:

DBML text\
↓\
Tokenizer\
↓\
Token Stream\
↓\
Recursive Descent Parser\
↓\
AST

Parser responsibilities:

-   identify tables
-   identify columns
-   identify relationships
-   validate syntax

Parser module structure:

    parser
     ├ tokenizer.ts
     ├ parser.ts
     ├ ast.ts
     ├ validator.ts
     └ index.ts

Public API:

    parseDBML(schema: string): DatabaseSchema

------------------------------------------------------------------------

# 10. Diagram Engine

Responsibilities:

-   convert schema AST → graph
-   layout nodes
-   render edges

Graph Model:

Node = Table\
Edge = Relationship

Layout engine:

Dagre

------------------------------------------------------------------------

# 11. Frontend Architecture

Modules:

editor\
diagram\
state\
api

Editor:

-   Monaco editor
-   syntax highlight
-   real time parsing

Diagram:

-   React Flow
-   zoom
-   pan
-   drag nodes

------------------------------------------------------------------------

# 12. Backend Architecture

Framework:

NestJS

Modules:

project\
diagram\
auth

Features:

-   create project
-   save schema
-   load schema
-   share diagram

------------------------------------------------------------------------

# 13. API Design

Projects

GET /projects\
POST /projects

Diagram

GET /diagram/:id\
POST /diagram

Share

/d/{diagram_id}

------------------------------------------------------------------------

# 14. Performance Strategy

Large diagram optimization:

-   viewport rendering
-   lazy edge rendering
-   layout caching

Target support:

200 tables\
1000 relationships

------------------------------------------------------------------------

# 15. Claude Code Prompt Framework

## Initialize Project

Prompt:

Initialize the repository using the architecture documentation. Create
frontend, backend, parser modules. Use TypeScript.

------------------------------------------------------------------------

## Build Parser

Prompt:

Implement DBML parser based on docs/dbml-grammar.md. Create tokenizer,
parser, AST, validator.

------------------------------------------------------------------------

## Build Diagram Engine

Prompt:

Convert AST into graph nodes and edges. Use Dagre layout engine.

------------------------------------------------------------------------

## Build Frontend

Prompt:

Implement Next.js application.

Requirements:

-   Monaco editor
-   React Flow diagram
-   real-time parsing

------------------------------------------------------------------------

## Build Backend

Prompt:

Implement backend services using NestJS.

Features:

-   project management
-   diagram storage
-   share links

------------------------------------------------------------------------

## Integrate System

Prompt:

Connect frontend, parser, diagram engine and backend. Ensure full flow
works end-to-end.

------------------------------------------------------------------------

# 16. Development Roadmap

Phase 1 -- MVP

-   schema editor
-   diagram rendering
-   save diagram
-   share diagram

Phase 2

-   SQL import/export

Phase 3

-   collaboration
-   version history

------------------------------------------------------------------------

# 17. Future Extensions

Possible advanced features:

-   collaborative editing (CRDT)
-   schema versioning
-   migration generation
-   database reverse engineering
-   AI schema generation
