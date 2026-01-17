// src/shared/types/uuid.ts

/**
 * Stringified UUIDv7.
 * @format uuid
 * @pattern ^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 * @example "01234567-89ab-7def-8012-3456789abcde"
 */
export type UUID = string;
