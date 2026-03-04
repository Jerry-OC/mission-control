// /api/_handler.js — Shared handler utilities to reduce boilerplate
// Files prefixed with _ are NOT treated as Vercel serverless routes.
// Provides helpers for common CRUD patterns and error handling.

import { requireAuth, corsMiddleware } from './_auth.js';

/**
 * Wraps a request handler with auth and CORS checks, plus automatic error handling.
 * @param {Function} handler - Async handler(req, res) that processes the request
 * @param {object} options - { methods?: string, requireAuth?: boolean }
 * @returns {Function} Vercel handler function
 */
export function createHandler(handler, options = {}) {
  const { methods = 'GET, POST, PATCH, DELETE, OPTIONS', requireAuthCheck = true } = options;
  
  return async (req, res) => {
    // CORS middleware
    if (!corsMiddleware(req, res, methods)) return;
    
    // Auth check
    if (requireAuthCheck && !requireAuth(req, res)) return;
    
    // Wrap handler in try-catch
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[${req.method} ${req.url}] Error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Parse request body, handling both string and object formats
 * @param {object} req - Incoming request
 * @returns {object} Parsed body object
 */
export function parseBody(req) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  return req.body || {};
}

/**
 * Extract and validate a required parameter from query string
 * @param {object} req - Request object
 * @param {string} paramName - Name of the parameter (e.g., 'id')
 * @returns {string|null} The parameter value, or null if not present
 * @throws {Error} If the parameter is missing
 */
export function requireParam(req, paramName) {
  const value = req.query?.[paramName];
  if (!value) {
    throw new Error(`${paramName} required`);
  }
  return value;
}

/**
 * Check that a required field is present in an object
 * @param {object} obj - Object to check
 * @param {string|string[]} fields - Field name(s) to require
 * @throws {Error} If any required field is missing
 */
export function requireFields(obj, fields) {
  const fieldList = Array.isArray(fields) ? fields : [fields];
  for (const field of fieldList) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      throw new Error(`${field} required`);
    }
  }
}

/**
 * Validate that a value is one of allowed options
 * @param {*} value - Value to validate
 * @param {string[]} allowed - Array of allowed values
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is not in allowed list
 */
export function validateOneOf(value, allowed, fieldName = 'value') {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${fieldName}: must be one of ${allowed.join(', ')}`);
  }
}

/**
 * Extract a subset of fields from an object, translating snake_case to camelCase if mapping provided
 * @param {object} obj - Source object
 * @param {object} mapping - Map from snake_case to camelCase (e.g., { 'job_id': 'jobId' })
 * @returns {object} New object with renamed fields
 */
export function normalizeFields(obj, mapping = {}) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = mapping[key] || key;
    result[newKey] = value;
  }
  return result;
}

/**
 * Build a PATCH payload from request body, respecting only allowed fields
 * and translating camelCase to snake_case
 * @param {object} body - Request body
 * @param {object} fieldMap - Map from snake_case to camelCase (e.g., { 'job_id': 'jobId' })
 * @returns {object} Patch object with snake_case keys, only changed fields
 */
export function buildPatch(body, fieldMap = {}) {
  const patch = {};
  const reverseMap = Object.fromEntries(
    Object.entries(fieldMap).map(([snake, camel]) => [camel, snake])
  );
  
  for (const [key, value] of Object.entries(body)) {
    const snakeKey = reverseMap[key] || key;
    if (value !== undefined) {
      patch[snakeKey] = value;
    }
  }
  return patch;
}

/**
 * Send a standardized success response
 * @param {object} res - Response object
 * @param {number} status - HTTP status code
 * @param {*} data - Data to send
 */
export function sendJson(res, status = 200, data = {}) {
  res.status(status).json(data);
}

/**
 * Send a standardized error response
 * @param {object} res - Response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 */
export function sendError(res, status = 400, message = 'Unknown error') {
  res.status(status).json({ error: message });
}
