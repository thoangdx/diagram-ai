// HTTP request/response shapes shared between frontend API client and backend

export interface ApiResponse<T> {
  data: T
  error?: string
}

export interface CreateProjectDto {
  name: string
}

export interface UpdateDiagramDto {
  schemaText: string
}
