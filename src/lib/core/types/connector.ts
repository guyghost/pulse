/**
 * @deprecated L'ancien type ConnectorError est remplacé par AppError dans $lib/core/errors
 * Utilisez import { type ConnectorError } from '$lib/core/errors' à la place
 * 
 * Ce fichier ne contient plus que ConnectorStatus pour la compatibilité.
 */

/** Statuts possibles d'un connecteur */
export type ConnectorStatus = 'detecting' | 'authenticated' | 'expired' | 'fetching' | 'done' | 'error';
