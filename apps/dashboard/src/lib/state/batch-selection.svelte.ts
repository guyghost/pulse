/**
 * Batch selection store — Svelte 5 runes wrapper around the M3 transition table.
 *
 * Holds the current BatchSelectionState and dispatches every event through the
 * pure `transition()` reducer. No transition logic lives here: the model is the
 * source of truth, this class only exposes ergonomic getters + senders. The LLM
 * never decides a transition; the model does. Server actions emit APPLY_SUCCESS /
 * APPLY_ERROR back into the store via reportSuccess / reportError.
 */
import {
  initialBatchSelectionState,
  transition,
  type BatchSelectionEvent,
  type BatchSelectionState,
  type BulkAction,
  type BulkSummary,
} from '../../models/batch-selection.machine';

export class BatchSelectionStore {
  private state = $state<BatchSelectionState>(initialBatchSelectionState);

  get status(): BatchSelectionState['status'] {
    return this.state.status;
  }

  get selectedIds(): ReadonlySet<string> {
    return this.state.selectedIds;
  }

  get count(): number {
    return this.state.selectedIds.size;
  }

  get isSelecting(): boolean {
    return this.state.status === 'selecting';
  }

  get isApplying(): boolean {
    return this.state.status === 'applying';
  }

  get action(): BulkAction | null {
    return this.state.action;
  }

  get summary(): BulkSummary | null {
    return this.state.summary;
  }

  get errorMessage(): string | null {
    return this.state.errorMessage;
  }

  /** True when checkboxes + the action bar must be disabled. */
  get isLocked(): boolean {
    return (
      this.state.status === 'applying' ||
      this.state.status === 'done' ||
      this.state.status === 'error'
    );
  }

  isSelected(id: string): boolean {
    return this.state.selectedIds.has(id);
  }

  private send(event: BatchSelectionEvent): void {
    this.state = transition(this.state, event);
  }

  enterSelectMode(): void {
    this.send({ type: 'ENTER_SELECT_MODE' });
  }

  exitSelectMode(): void {
    this.send({ type: 'EXIT_SELECT_MODE' });
  }

  toggle(id: string): void {
    this.send({ type: 'TOGGLE_ITEM', id });
  }

  selectVisible(ids: string[]): void {
    this.send({ type: 'SELECT_VISIBLE', ids });
  }

  clear(): void {
    this.send({ type: 'CLEAR_SELECTION' });
  }

  apply(action: BulkAction): void {
    this.send({ type: 'APPLY_BULK', action });
  }

  reportSuccess(summary: BulkSummary): void {
    this.send({ type: 'APPLY_SUCCESS', summary });
  }

  reportError(message: string): void {
    this.send({ type: 'APPLY_ERROR', message });
  }

  dismiss(): void {
    this.send({ type: 'DISMISS' });
  }
}
