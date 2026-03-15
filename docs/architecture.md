# DB Diagram Platform - System Architecture Specification

## Project Overview

This project is a web-based database diagram design platform similar to
dbdiagram.io. It allows developers to define database schema using DBML
and automatically generate ER diagrams.

Core capabilities: - Schema editing using text - Automatic diagram
generation - Interactive visualization - Schema storage - Shareable
diagram links - SQL export

Target scale: - Up to 200 tables - Up to 1000 relationships

------------------------------------------------------------------------

## High Level Architecture

Browser │ Frontend Application │ API Layer │ Backend Services │ Database

Core components: 1. Schema Editor 2. DBML Parser 3. Diagram Layout
Engine 4. Diagram Renderer 5. Project Storage 6. Share Link Service

------------------------------------------------------------------------

## Technology Stack

Frontend - Next.js - React - TypeScript - Monaco Editor - React Flow -
Dagre Layout Engine

Backend - Node.js - NestJS - TypeScript

Database - PostgreSQL

Infrastructure - Docker - Nginx - Cloud hosting

------------------------------------------------------------------------

## Repository Structure

repo ├ frontend │ ├ editor │ ├ diagram │ ├ components │ └ api │ ├
backend │ ├ auth │ ├ project │ └ diagram │ ├ parser ├ shared ├ docs └
infra

------------------------------------------------------------------------

## Domain Model

Core entities: - Project - Diagram - Table - Column - Relationship

Example:

Project - id - name - owner_id - created_at

Diagram - id - project_id - schema_text - created_at

------------------------------------------------------------------------

## Diagram Engine

Responsibilities: - Convert schema AST → graph - Layout nodes - Render
edges

Graph model: Node = Table Edge = Relationship

Layout engine: Dagre

------------------------------------------------------------------------

## Performance Strategy

Optimization techniques: - Viewport rendering - Lazy edge rendering -
Layout caching

Target support: - 200 tables - 1000 relationships
