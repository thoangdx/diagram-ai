// Domain entity types shared between frontend and backend

export interface Project {
  id: string
  name: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface Diagram {
  id: string
  projectId: string
  schemaText: string
  createdAt: string
  updatedAt: string
}
