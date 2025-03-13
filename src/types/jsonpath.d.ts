/**
 * Type declarations for jsonpath package
 * Used by the SageMaker provider to handle various response formats
 */

declare module 'jsonpath' {
  /**
   * Extracts values from an object using a JSONPath expression
   * @param obj The object to query
   * @param path The JSONPath expression string
   * @returns An array of matched values
   */
  export function query(obj: any, path: string): any[];

  /**
   * Parses a JSONPath expression for validation
   * @param path The JSONPath expression string to parse
   * @returns The parsed expression (implementation-specific)
   */
  export function parse(path: string): any;
}