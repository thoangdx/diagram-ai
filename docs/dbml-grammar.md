# DBML Grammar Specification

## DBML Overview

DBML (Database Markup Language) is a DSL used to describe database
schemas.

Example:

Table users { id int \[pk\] name varchar }

Table orders { id int \[pk\] user_id int \[ref: \> users.id\] }

The parser converts DBML into an Abstract Syntax Tree (AST).

------------------------------------------------------------------------

## Grammar (EBNF)

database ::= statement\*

statement ::= table_definition

table_definition ::= "Table" identifier "{" column_definition\* "}"

column_definition ::= identifier type column_option\*

type ::= identifier

column_option ::= "\[" option_list "\]"

option_list ::= option ("," option)\*

option ::= "pk" \| "not null" \| "unique" \| reference_option

reference_option ::= "ref:" relation_direction identifier "." identifier

relation_direction ::= "\>" \| "\<"

identifier ::= letter (letter \| digit \| "\_")\*

------------------------------------------------------------------------

## AST Model

TypeScript representation:

interface DatabaseSchema { tables: TableNode\[\] relations:
RelationNode\[\] }

interface TableNode { name: string columns: ColumnNode\[\] }

interface ColumnNode { name: string type: string primaryKey?: boolean
unique?: boolean notNull?: boolean }

interface RelationNode { fromTable: string fromColumn: string toTable:
string toColumn: string }

------------------------------------------------------------------------

## Parser Architecture

Pipeline:

DBML Text ↓ Tokenizer ↓ Token Stream ↓ Recursive Descent Parser ↓ AST

Parser module structure:

parser ├ tokenizer.ts ├ parser.ts ├ ast.ts ├ validator.ts └ index.ts

Public API:

parseDBML(schema: string): DatabaseSchema

------------------------------------------------------------------------

## Validation Rules

1.  Table names must be unique.
2.  Column names must be unique within a table.
3.  Relationship targets must exist.
