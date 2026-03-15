# SQL Import → ERD Specification

This document describes how the system converts SQL schema definitions
into ER diagrams automatically.

The feature allows users to paste SQL DDL statements and instantly
visualize database relationships.

------------------------------------------------------------------------

# 1. Overview

Goal:

Allow users to paste SQL schema and automatically generate:

-   DBML schema
-   ER diagram

Example SQL:

CREATE TABLE users ( id BIGINT PRIMARY KEY, name VARCHAR(255) );

CREATE TABLE orders ( id BIGINT PRIMARY KEY, user_id BIGINT, FOREIGN KEY
(user_id) REFERENCES users(id) );

Output:

DBML + ER diagram.

------------------------------------------------------------------------

# 2. System Architecture

SQL Input ↓ SQL Parser ↓ Schema Model ↓ DBML Generator ↓ DBML Parser ↓
Layout Engine ↓ ER Diagram

------------------------------------------------------------------------

# 3. Backend Module Structure

backend ├ sql-import │ ├ sql-parser.ts │ ├ schema-builder.ts │ └
dbml-generator.ts

Responsibilities:

sql-parser.ts Parse SQL statements.

schema-builder.ts Build internal schema model.

dbml-generator.ts Convert schema model to DBML.

------------------------------------------------------------------------

# 4. SQL Parser

Recommended library:

node-sql-parser

Benefits:

-   supports multiple SQL dialects
-   reliable grammar
-   easy AST extraction

Supported databases:

-   MySQL
-   PostgreSQL
-   SQLite

------------------------------------------------------------------------

# 5. Schema Model

Internal representation:

interface SqlSchema { tables: SqlTable\[\] }

interface SqlTable { name: string columns: SqlColumn\[\] foreignKeys:
ForeignKey\[\] }

------------------------------------------------------------------------

# 6. DBML Conversion

Example SQL:

CREATE TABLE users ( id INT PRIMARY KEY );

Generated DBML:

Table users { id int \[pk\] }

------------------------------------------------------------------------

# 7. Foreign Key Mapping

SQL:

FOREIGN KEY (user_id) REFERENCES users(id)

DBML:

user_id int \[ref: \> users.id\]

------------------------------------------------------------------------

# 8. Frontend Integration

User workflow:

Import SQL ↓ Paste SQL ↓ Click Convert ↓ DBML generated ↓ Diagram
rendered

UI components:

-   ImportSQLModal
-   SQLTextEditor
-   ConvertButton

------------------------------------------------------------------------

# 9. Error Handling

If SQL parsing fails:

Display syntax error.

Example:

Invalid SQL near line 4.

------------------------------------------------------------------------

# 10. Security

Important rule:

SQL must never be executed.

System only parses SQL.

------------------------------------------------------------------------

# 11. Performance Strategy

For large schemas:

-   parse SQL once
-   cache schema result

------------------------------------------------------------------------

# Summary

This feature allows existing databases to be visualized instantly by
converting SQL DDL into DBML and rendering the ER diagram.
