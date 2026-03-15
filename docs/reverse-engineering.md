# Database Reverse Engineering Specification

This document describes how the system connects to an existing database
and automatically generates an ER diagram by reading database metadata.

------------------------------------------------------------------------

# 1. Overview

Goal:

Allow users to connect to an existing database and automatically
generate:

-   DBML schema
-   ER diagram

User provides:

-   host
-   port
-   username
-   password
-   database name

System flow:

connect to database ↓ read metadata ↓ build schema model ↓ generate DBML
↓ render ER diagram

------------------------------------------------------------------------

# 2. System Architecture

User │ Database Connection Service │ Metadata Reader │ Schema Builder │
DBML Generator │ Diagram Engine

------------------------------------------------------------------------

# 3. Backend Module Structure

backend ├ reverse-engineering │ ├ connection-service.ts │ ├
metadata-reader.ts │ ├ schema-builder.ts │ └ dbml-generator.ts

Responsibilities:

connection-service.ts Handles database connection.

metadata-reader.ts Reads tables, columns, indexes and relationships.

schema-builder.ts Builds internal schema representation.

dbml-generator.ts Converts schema model into DBML.

------------------------------------------------------------------------

# 4. Supported Databases

Initial support:

-   PostgreSQL
-   MySQL
-   SQLite

Drivers:

PostgreSQL → pg MySQL → mysql2 SQLite → better-sqlite3

------------------------------------------------------------------------

# 5. Metadata Extraction

Example PostgreSQL queries.

List tables:

SELECT table_name FROM information_schema.tables WHERE table_schema =
'public';

List columns:

SELECT column_name, data_type FROM information_schema.columns WHERE
table_name = 'users';

Foreign keys:

SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table,
ccu.column_name AS foreign_column FROM
information_schema.table_constraints tc JOIN
information_schema.key_column_usage kcu ON tc.constraint_name =
kcu.constraint_name JOIN information_schema.constraint_column_usage ccu
ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type =
'FOREIGN KEY';

------------------------------------------------------------------------

# 6. Schema Model

Example internal structure:

interface DatabaseSchema { tables: Table\[\] }

interface Table { name: string columns: Column\[\] foreignKeys:
ForeignKey\[\] }

------------------------------------------------------------------------

# 7. DBML Generation

Example output:

Table users { id bigint \[pk\] email varchar }

Table orders { id bigint \[pk\] user_id bigint \[ref: \> users.id\] }

------------------------------------------------------------------------

# 8. Security

Database credentials must:

-   never be stored in plaintext
-   be encrypted if stored
-   preferably used as temporary connections

Browser must never connect directly to the database.

All connections go through backend.

------------------------------------------------------------------------

# 9. Performance Strategy

Large databases may contain:

-   1000+ tables

Strategies:

-   lazy load schemas
-   allow schema filtering
-   cache metadata

Example:

database_id → metadata cache

------------------------------------------------------------------------

# 10. Frontend Workflow

User flow:

Connect Database ↓ Enter credentials ↓ Select schema ↓ Import ↓ Diagram
generated

------------------------------------------------------------------------

# Summary

Reverse engineering allows existing production databases to be
visualized instantly as ER diagrams.
