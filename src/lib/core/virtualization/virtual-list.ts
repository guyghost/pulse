/**
 * Virtual List - Logique pure de virtualisation (Core-compatible)
 * 
 * Pas de DOM, pas de I/O, pas de async - juste des calculs mathématiques purs.
 */

export interface VirtualItem<T> {
  index: number;
  data: T;
  style: {
    position: 'absolute';
    top: number;
    height: number;
  };
}

export interface VirtualListConfig {
  itemHeight: number; // Hauteur fixe ou estimation
  overscan: number;   // Nombre d'items à rendre en dehors du viewport
  totalItems: number;
}

export interface VirtualListState<T> {
  virtualItems: VirtualItem<T>[];
  totalHeight: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Fonction pure qui calcule quels items doivent être rendus.
 * 
 * @param items - Liste complète des items
 * @param scrollTop - Position du scroll en pixels
 * @param containerHeight - Hauteur du container visible
 * @param config - Configuration de la virtual list
 * @returns État virtuel avec les items à rendre et les métadonnées
 */
export function calculateVirtualItems<T>(
  items: T[],
  scrollTop: number,
  containerHeight: number,
  config: VirtualListConfig
): VirtualListState<T> {
  const { itemHeight, overscan } = config;
  const totalItems = items.length;
  
  // Calcul de la hauteur totale
  const totalHeight = totalItems * itemHeight;
  
  // Index de l'item au début du viewport
  const startIndexRaw = Math.floor(scrollTop / itemHeight);
  
  // Index de l'item à la fin du viewport
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndexRaw = startIndexRaw + visibleCount;
  
  // Application de l'overscan (buffer avant/après)
  const startIndex = Math.max(0, startIndexRaw - overscan);
  const endIndex = Math.min(totalItems - 1, endIndexRaw + overscan);
  
  // Construction des items virtuels
  const virtualItems: VirtualItem<T>[] = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    if (i >= 0 && i < totalItems) {
      virtualItems.push({
        index: i,
        data: items[i],
        style: {
          position: 'absolute',
          top: i * itemHeight,
          height: itemHeight,
        },
      });
    }
  }
  
  return {
    virtualItems,
    totalHeight,
    startIndex,
    endIndex,
  };
}

/**
 * Calcule le scroll vers un index spécifique.
 * Utile pour "scroll to item".
 */
export function getScrollToIndex(
  index: number,
  config: Pick<VirtualListConfig, 'itemHeight'>
): number {
  return index * config.itemHeight;
}

/**
 * Trouve l'index d'un item à une position Y donnée.
 * Utile pour le scroll-to-click.
 */
export function getIndexAtPosition(
  positionY: number,
  config: Pick<VirtualListConfig, 'itemHeight'>
): number {
  return Math.floor(positionY / config.itemHeight);
}

/**
 * Vérifie si un index est dans la zone visible (sans overscan).
 */
export function isIndexVisible(
  index: number,
  scrollTop: number,
  containerHeight: number,
  config: Pick<VirtualListConfig, 'itemHeight'>
): boolean {
  const itemTop = index * config.itemHeight;
  const itemBottom = itemTop + config.itemHeight;
  const viewportBottom = scrollTop + containerHeight;
  
  return itemBottom > scrollTop && itemTop < viewportBottom;
}
