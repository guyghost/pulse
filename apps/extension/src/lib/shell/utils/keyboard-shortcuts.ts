/**
 * Keyboard shortcuts manager - Shell layer
 * 
 * Handles global keyboard shortcuts with proper context awareness.
 * Shortcuts are disabled when inputs are focused.
 */

export interface ShortcutConfig {
	/** The key to listen for (e.g., 'r', 'f', '/', 'Escape', '?') */
	key: string;
	/** Require Ctrl key */
	ctrl?: boolean;
	/** Require Shift key */
	shift?: boolean;
	/** Require Alt key */
	alt?: boolean;
	/** Require Meta key (Cmd on Mac, Win on Windows) */
	meta?: boolean;
	/** Whether to prevent default browser behavior */
	preventDefault?: boolean;
	/** Description for the help modal */
	description: string;
	/** Category for grouping in help */
	category?: string;
}

type ShortcutHandler = (event: KeyboardEvent) => void;

interface RegisteredShortcut extends ShortcutConfig {
	handler: ShortcutHandler;
	id: string;
}

// Global registry
const registeredShortcuts = new Map<string, RegisteredShortcut>();
let isListening = false;
let idCounter = 0;

/**
 * Check if the current active element is an input field.
 * Shortcuts should be disabled when user is typing.
 */
function isInputFocused(): boolean {
	const activeElement = document.activeElement;
	if (!activeElement) return false;
	
	const tagName = activeElement.tagName.toLowerCase();
	const isEditable = 
		tagName === 'input' ||
		tagName === 'textarea' ||
		tagName === 'select' ||
		activeElement.getAttribute('contenteditable') === 'true';
	
	return isEditable;
}

/**
 * Get the shortcut key identifier from a keyboard event.
 */
function getKeyIdentifier(event: KeyboardEvent): string {
	const parts: string[] = [];
	
	if (event.ctrlKey) parts.push('ctrl');
	if (event.altKey) parts.push('alt');
	if (event.shiftKey) parts.push('shift');
	if (event.metaKey) parts.push('meta');
	parts.push(event.key.toLowerCase());
	
	return parts.join('+');
}

/**
 * Build a key identifier from a shortcut config.
 */
function buildKeyIdentifier(config: ShortcutConfig): string {
	const parts: string[] = [];
	
	if (config.ctrl) parts.push('ctrl');
	if (config.alt) parts.push('alt');
	if (config.shift) parts.push('shift');
	if (config.meta) parts.push('meta');
	parts.push(config.key.toLowerCase());
	
	return parts.join('+');
}

/**
 * Global keydown handler.
 */
function handleKeydown(event: KeyboardEvent): void {
	// Don't trigger shortcuts when typing in inputs
	if (isInputFocused()) {
		// Except for Escape which should always work
		if (event.key !== 'Escape') {
			return;
		}
	}
	
	const keyId = getKeyIdentifier(event);
	const shortcut = registeredShortcuts.get(keyId);
	
	if (shortcut) {
		if (shortcut.preventDefault) {
			event.preventDefault();
		}
		shortcut.handler(event);
	}
}

/**
 * Start listening for keyboard events.
 */
function startListening(): void {
	if (!isListening && typeof window !== 'undefined') {
		window.addEventListener('keydown', handleKeydown);
		isListening = true;
	}
}

/**
 * Stop listening for keyboard events.
 */
function stopListening(): void {
	if (isListening && typeof window !== 'undefined') {
		window.removeEventListener('keydown', handleKeydown);
		isListening = false;
	}
}

/**
 * Register a single keyboard shortcut.
 * Returns an unsubscribe function.
 */
export function registerShortcut(
	config: ShortcutConfig,
	handler: ShortcutHandler,
): () => void {
	const id = `shortcut-${++idCounter}`;
	const keyId = buildKeyIdentifier(config);
	
	registeredShortcuts.set(keyId, {
		...config,
		handler,
		id,
	});
	
	startListening();
	
	// Return unsubscribe function
	return () => {
		registeredShortcuts.delete(keyId);
		if (registeredShortcuts.size === 0) {
			stopListening();
		}
	};
}

/**
 * Register multiple shortcuts at once.
 * Returns a function to unregister all at once.
 */
export function registerShortcuts(
	shortcuts: Array<{ config: ShortcutConfig; handler: ShortcutHandler }>,
): () => void {
	const unsubscribes: Array<() => void> = [];
	
	for (const { config, handler } of shortcuts) {
		unsubscribes.push(registerShortcut(config, handler));
	}
	
	return () => {
		for (const unsubscribe of unsubscribes) {
			unsubscribe();
		}
	};
}

/**
 * Get all registered shortcuts for help display.
 */
export function getRegisteredShortcuts(): ShortcutConfig[] {
	return Array.from(registeredShortcuts.values()).map(({ handler, id, ...config }) => config);
}

/**
 * Format a shortcut for display (e.g., "Ctrl+R" or "?").
 */
export function formatShortcut(config: ShortcutConfig): string {
	const parts: string[] = [];
	
	if (config.ctrl) parts.push('Ctrl');
	if (config.alt) parts.push('Alt');
	if (config.shift) parts.push('Shift');
	if (config.meta) parts.push('Cmd');
	
	// Special key formatting
	let key = config.key;
	if (key === 'Escape') key = 'Esc';
	if (key === ' ') key = 'Space';
	if (key === 'ArrowUp') key = '↑';
	if (key === 'ArrowDown') key = '↓';
	if (key === 'ArrowLeft') key = '←';
	if (key === 'ArrowRight') key = '→';
	
	parts.push(key);
	
	return parts.join('+');
}

/**
 * Clear all registered shortcuts.
 * Useful for testing or when unmounting an app.
 */
export function clearAllShortcuts(): void {
	registeredShortcuts.clear();
	stopListening();
}

/**
 * Check if a shortcut is already registered.
 */
export function isShortcutRegistered(config: ShortcutConfig): boolean {
	const keyId = buildKeyIdentifier(config);
	return registeredShortcuts.has(keyId);
}

/**
 * Predefined shortcut categories.
 */
export const ShortcutCategories = {
	NAVIGATION: 'Navigation',
	ACTIONS: 'Actions',
	SEARCH: 'Recherche',
	FILTERS: 'Filtres',
	HELP: 'Aide',
} as const;

/**
 * Common shortcuts for the feed page.
 */
export const FeedShortcuts = {
	REFRESH: {
		key: 'r',
		description: 'Rafraîchir le feed',
		category: ShortcutCategories.ACTIONS,
	} satisfies ShortcutConfig,
	
	TOGGLE_FAVORITES: {
		key: 'f',
		description: 'Afficher/masquer favoris',
		category: ShortcutCategories.FILTERS,
	} satisfies ShortcutConfig,
	
	FOCUS_SEARCH: {
		key: '/',
		description: 'Focus sur la recherche',
		preventDefault: true,
		category: ShortcutCategories.SEARCH,
	} satisfies ShortcutConfig,
	
	CLEAR_SEARCH: {
		key: 'Escape',
		description: 'Effacer la recherche / fermer',
		category: ShortcutCategories.SEARCH,
	} satisfies ShortcutConfig,
	
	SHOW_HELP: {
		key: '?',
		shift: true,
		description: 'Afficher l\'aide des raccourcis',
		preventDefault: true,
		category: ShortcutCategories.HELP,
	} satisfies ShortcutConfig,
	
	TOGGLE_HIDDEN: {
		key: 'h',
		description: 'Afficher/masquer missions ignorées',
		category: ShortcutCategories.FILTERS,
	} satisfies ShortcutConfig,
} as const;
