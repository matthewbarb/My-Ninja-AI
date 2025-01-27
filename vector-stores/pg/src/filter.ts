export type OperatorType =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'contains'
  | 'exists'
  | '$and'
  | '$or';

// Type guard to check if an operator is valid
export function isValidOperator(operator: string): operator is OperatorType {
  return operator in FILTER_OPERATORS;
}

type FilterOperator = {
  sql: string;
  needsValue: boolean;
  transformValue?: (value: any) => any;
};

type FilterOperatorMap = {
  [K in OperatorType]: (key: string, paramIndex: number) => FilterOperator;
};

// Helper functions to create operators
const createBasicOperator = (symbol: string) => {
  const isLikeOperator = symbol.toLowerCase().includes('like');
  return (key: string, paramIndex: number): FilterOperator => ({
    sql: `metadata#>>'{${key.replace(/\./g, ',')}}' ${symbol} $${paramIndex}`,
    needsValue: true,
    transformValue: isLikeOperator ? (value: string) => `%${value}%` : undefined,
  });
};

const createNumericOperator = (symbol: string) => {
  return (key: string, paramIndex: number): FilterOperator => ({
    sql: `(metadata#>>'{${key.replace(/\./g, ',')}}')::numeric ${symbol} $${paramIndex}`,
    needsValue: true,
  });
};

// Define all filter operators
export const FILTER_OPERATORS: FilterOperatorMap = {
  // Equal
  eq: createBasicOperator('='),
  // Not equal
  neq: createBasicOperator('!='),

  // Greater than
  gt: createNumericOperator('>'),
  // Greater than or equal
  gte: createNumericOperator('>='),
  // Less than
  lt: createNumericOperator('<'),
  // Less than or equal
  lte: createNumericOperator('<='),

  // Pattern matching (LIKE)
  like: createBasicOperator('LIKE'),
  // Case-insensitive pattern matching (ILIKE)
  ilike: createBasicOperator('ILIKE'),

  // IN array of values
  in: (key: string, paramIndex: number): FilterOperator => ({
    sql: `metadata#>>'{${key.split('.').join(',')}}' = ANY($${paramIndex}::text[])`,
    needsValue: true,
    transformValue: (value: string) => (Array.isArray(value) ? value : value.split(',')),
  }),
  // JSONB contains
  contains: (key: string, paramIndex: number): FilterOperator => ({
    sql: `metadata @> $${paramIndex}::jsonb`,
    needsValue: true,
    transformValue: (value: any) => {
      const parts = key.split('.');
      return JSON.stringify(parts.reduceRight((value, key) => ({ [key]: value }), value));
    },
  }),
  // Key exists
  exists: (key: string): FilterOperator => ({
    sql: `metadata ? '${key}'`,
    needsValue: false,
  }),
  $and: (key: string) => ({ sql: `(${key})`, needsValue: false }),
  $or: (key: string) => ({ sql: `(${key})`, needsValue: false }),
};

type FilterCondition = {
  operator: OperatorType;
  value?: any;
};

export type Filter = Record<string, FilterCondition | any>;
