import type { DatabaseSchema } from './ast'

export interface ValidationError {
  message: string
}

export function validate(schema: DatabaseSchema): ValidationError[] {
  const errors: ValidationError[] = []

  const tableNames = new Set<string>()

  for (const table of schema.tables) {
    // Rule 1: table names must be unique
    if (tableNames.has(table.name)) {
      errors.push({ message: `Duplicate table name '${table.name}'` })
    }
    tableNames.add(table.name)

    // Rule 2: column names must be unique within a table
    const columnNames = new Set<string>()
    for (const col of table.columns) {
      if (columnNames.has(col.name)) {
        errors.push({
          message: `Duplicate column name '${col.name}' in table '${table.name}'`,
        })
      }
      columnNames.add(col.name)
    }
  }

  // Rule 3: relation targets must reference existing tables and columns
  for (const rel of schema.relations) {
    const toTable = schema.tables.find((t) => t.name === rel.toTable)
    if (!toTable) {
      errors.push({
        message: `Relation references unknown table '${rel.toTable}'`,
      })
      continue
    }

    const columnExists = toTable.columns.some((c) => c.name === rel.toColumn)
    if (!columnExists) {
      errors.push({
        message: `Relation references unknown column '${rel.toColumn}' in table '${rel.toTable}'`,
      })
    }
  }

  return errors
}
