# Collaborative Editing Architecture

This document describes the real-time collaborative editing architecture
for the database diagram platform.

The goal is to allow multiple users to edit the same schema
simultaneously, similar to collaborative tools like Google Docs.

------------------------------------------------------------------------

# 1. Goals

The collaboration system must support:

-   real-time editing
-   multi-user editing
-   automatic conflict resolution
-   offline editing support
-   eventual consistency

------------------------------------------------------------------------

# 2. High-Level Architecture

Browser Clients │ WebSocket Gateway │ Collaboration Service │ CRDT
Engine │ Persistence Layer

Flow:

User edits schema ↓ Local CRDT update ↓ WebSocket broadcast ↓ Other
clients apply update

------------------------------------------------------------------------

# 3. Why CRDT

Traditional REST approach causes conflicts:

User A saves schema User B overwrites schema

CRDT solves this by allowing automatic merge of concurrent edits.

------------------------------------------------------------------------

# 4. Schema Document Model

Schema text is treated as a collaborative document.

Example structure:

interface SchemaDocument { content: string version: number }

Supported operations:

-   insert
-   delete
-   update

------------------------------------------------------------------------

# 5. CRDT Library

Recommended library:

Yjs

Advantages:

-   mature CRDT implementation
-   fast synchronization
-   offline support
-   battle-tested in production systems

------------------------------------------------------------------------

# 6. Yjs Data Model

Client document:

Y.Doc

Shared text structure:

Y.Text

Example:

const ydoc = new Y.Doc() const ytext = ydoc.getText("schema")

------------------------------------------------------------------------

# 7. Editing Flow

Editor change ↓ Update Yjs document ↓ Broadcast via WebSocket ↓ Other
clients apply change ↓ Editor updates view

------------------------------------------------------------------------

# 8. WebSocket Communication

Communication protocol:

WebSocket

Example message:

{ "type": "update", "diagramId": "abc123", "payload": "binary-update" }

------------------------------------------------------------------------

# 9. Backend Collaboration Service

Module structure:

backend ├ collaboration │ ├ gateway.ts │ ├ document-manager.ts │ └
persistence.ts

Responsibilities:

-   manage active documents
-   broadcast updates
-   persist document state

------------------------------------------------------------------------

# 10. Document Manager

Manages in-memory collaborative documents.

Example:

class DocumentManager {

documents = new Map()

getDocument(id) { if (!this.documents.has(id)) { this.documents.set(id,
new Y.Doc()) } return this.documents.get(id) }

}

------------------------------------------------------------------------

# 11. Persistence Strategy

Two persistence strategies:

Snapshot Save the entire document periodically.

Incremental Updates Store CRDT update operations.

Recommended approach:

Snapshot + incremental updates.

------------------------------------------------------------------------

# 12. Editor Integration

Editor: Monaco Editor

Integration approach:

Monaco → Yjs binding

Library:

y-monaco

------------------------------------------------------------------------

# 13. Cursor Awareness

Collaborative editors display user cursors.

Example:

User A editing line 3 User B editing line 5

Yjs Awareness API enables presence tracking.

Example:

provider.awareness.setLocalStateField("user", { name: "Alice" })

------------------------------------------------------------------------

# 14. Real-time Diagram Update

When schema changes:

CRDT change ↓ Parse DBML ↓ Generate AST ↓ Run Layout Engine ↓ Render
diagram

------------------------------------------------------------------------

# 15. Performance Considerations

Large schemas may cause heavy rendering.

Strategy:

Debounce schema parsing (e.g., 300ms).

------------------------------------------------------------------------

# 16. Security

Access control roles:

-   owner
-   editor
-   viewer

Permissions should be validated on WebSocket connection.

------------------------------------------------------------------------

# 17. Scaling Architecture

For multiple collaboration servers:

Client │ WebSocket Node │ Redis Pub/Sub │ Other Nodes

Redis is used to propagate updates across instances.

------------------------------------------------------------------------

# 18. Deployment Strategy

Recommended services:

services ├ api ├ collaboration └ parser

Collaboration service handles all WebSocket sessions.

------------------------------------------------------------------------

# 19. Summary

The collaborative editing system includes:

-   CRDT engine (Yjs)
-   WebSocket synchronization
-   document manager
-   persistence layer
-   editor integration

This architecture enables real-time multi-user schema editing.
