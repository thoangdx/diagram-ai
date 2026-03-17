export type TokenType =
  | 'KEYWORD_TABLE'   // Table
  | 'KEYWORD_REF'     // ref
  | 'KEYWORD_PK'      // pk
  | 'KEYWORD_UNIQUE'  // unique
  | 'KEYWORD_NOT'     // not
  | 'KEYWORD_NULL'    // null
  | 'KEYWORD_NOTE'    // note
  | 'IDENTIFIER'      // table/column names, types
  | 'STRING'          // 'quoted' or "quoted" string literal
  | 'LBRACE'          // {
  | 'RBRACE'          // }
  | 'LBRACKET'        // [
  | 'RBRACKET'        // ]
  | 'COLON'           // :
  | 'COMMA'           // ,
  | 'DOT'             // .
  | 'REL_GT'          // >
  | 'REL_LT'          // <
  | 'REL_DASH'        // -
  | 'EOF'

export interface Token {
  type: TokenType
  value: string
  line: number
  col: number
}

// Keywords matched case-sensitively per the grammar spec.
// 'not' and 'null' are split tokens so the parser can handle "not null" as a
// two-token sequence rather than a single compound keyword.
const KEYWORDS: Record<string, TokenType> = {
  Table:  'KEYWORD_TABLE',
  ref:    'KEYWORD_REF',
  pk:     'KEYWORD_PK',
  unique: 'KEYWORD_UNIQUE',
  not:    'KEYWORD_NOT',
  null:   'KEYWORD_NULL',
  note:   'KEYWORD_NOTE',
}

export class TokenizeError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly col: number
  ) {
    super(`Line ${line}, Column ${col}: ${message}`)
    this.name = 'TokenizeError'
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let col = 1

  // Consume the character at pos and update line/col tracking.
  function advance(): string {
    const ch = input[pos++]
    if (ch === '\n') {
      line++
      col = 1
    } else {
      col++
    }
    return ch
  }

  // Look at the next character without consuming it.
  function peek(): string {
    return input[pos] ?? ''
  }

  function makeToken(type: TokenType, value: string, tokenLine: number, tokenCol: number): Token {
    return { type, value, line: tokenLine, col: tokenCol }
  }

  while (pos < input.length) {
    // Skip whitespace (spaces, tabs, newlines, \r)
    if (/\s/.test(peek())) {
      advance()
      continue
    }

    // Skip single-line comments  //...
    if (peek() === '/' && input[pos + 1] === '/') {
      while (pos < input.length && peek() !== '\n') advance()
      continue
    }

    // Capture position BEFORE consuming the character so the token's location
    // points at its first character.
    const tokenLine = line
    const tokenCol = col
    const ch = advance()

    switch (ch) {
      case '{': tokens.push(makeToken('LBRACE',    ch, tokenLine, tokenCol)); break
      case '}': tokens.push(makeToken('RBRACE',    ch, tokenLine, tokenCol)); break
      case '[': tokens.push(makeToken('LBRACKET',  ch, tokenLine, tokenCol)); break
      case ']': tokens.push(makeToken('RBRACKET',  ch, tokenLine, tokenCol)); break
      case ':': tokens.push(makeToken('COLON',     ch, tokenLine, tokenCol)); break
      case ',': tokens.push(makeToken('COMMA',     ch, tokenLine, tokenCol)); break
      case '.': tokens.push(makeToken('DOT',       ch, tokenLine, tokenCol)); break
      case '>': tokens.push(makeToken('REL_GT',    ch, tokenLine, tokenCol)); break
      case '<': tokens.push(makeToken('REL_LT',    ch, tokenLine, tokenCol)); break
      case '-': tokens.push(makeToken('REL_DASH',  ch, tokenLine, tokenCol)); break

      case "'":
      case '"': {
        // Quoted string literal — consume until matching closing quote.
        const quote = ch
        let str = ''
        while (pos < input.length && peek() !== quote) {
          str += advance()
        }
        if (pos >= input.length) {
          throw new TokenizeError(`Unterminated string literal`, tokenLine, tokenCol)
        }
        advance() // consume closing quote
        tokens.push(makeToken('STRING', str, tokenLine, tokenCol))
        break
      }

      default: {
        if (/[a-zA-Z_]/.test(ch)) {
          // Greedily consume the rest of the identifier/keyword.
          let word = ch
          while (pos < input.length && /[a-zA-Z0-9_]/.test(peek())) {
            word += advance()
          }
          const kwType = KEYWORDS[word]
          tokens.push(makeToken(kwType ?? 'IDENTIFIER', word, tokenLine, tokenCol))
        } else {
          throw new TokenizeError(
            `Unexpected character '${ch}'`,
            tokenLine,
            tokenCol
          )
        }
      }
    }
  }

  tokens.push({ type: 'EOF', value: '', line, col })
  return tokens
}
