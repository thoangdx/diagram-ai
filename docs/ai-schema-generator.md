# AI Schema Generator

## Overview

The system generates database schema from natural language prompts.

Example:

Prompt:
Design schema for ecommerce system

Output:
DBML schema.

---

# Architecture

User Prompt
↓
AI Service
↓
LLM API
↓
DBML
↓
Parser
↓
Diagram Engine

---

# AI Service

Module:

backend/ai

Files:

ai-controller.ts
schema-generator.ts
prompt-template.ts

---

# Prompt Template

You are a database architect.

Generate DBML schema.

Requirements:

- normalized schema
- primary keys
- foreign keys

Output only DBML.

---

# Validation Pipeline

AI output must be validated.

Steps:

1 parse DBML
2 validate schema
3 regenerate if invalid

---

# Frontend Integration

Add AI prompt input.

When user clicks generate:

1 send prompt to backend
2 receive DBML
3 update editor
4 render diagram