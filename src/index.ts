/**
 * Connectic - A JavaScript Library for Pub/Sub Messaging and Real-Time Data Synchronization
 * 
 * @author Oluwaferanmi Adeniji
 * @version 1.0.0
 * @license MIT
 */

// Export types and interfaces
export type {
  ConnecticError as ConnecticErrorType
} from './types';


// Version information
export const VERSION = '1.0.0';
/**
 * Library information
 */

export const LIBRARY_INFO = {
  name: 'connectic',
  version: VERSION,
  description: 'Connectic is a JavaScript library for pub/sub messaging, event handling, and data synchronization in real-time applications.',
  author: 'Oluwaferanmi Adeniji',
  license: 'MIT',
} as const;
