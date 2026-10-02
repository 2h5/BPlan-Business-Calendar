/**
 * What the Find Time box needs to know about each of its three flows — find
 * a slot, book it, move an existing event — reduced to plain values, so the
 * box's decisions can be tested without rendering it.
 */
export interface FindTimeBoxInputs {
  text: string;
  findTime: {
    isPending: boolean;
    hasProposal: boolean;
    hasClarification: boolean;
    errorMessage: string | null;
    requiresUpgrade: boolean;
  };
  confirmSlot: {
    hasConfirmation: boolean;
    errorMessage: string | null;
  };
  edit: {
    isPending: boolean;
    optionCount: number;
    hasClarification: boolean;
    hasMoved: boolean;
    errorMessage: string | null;
    requiresUpgrade: boolean;
  };
}

export interface FindTimeBoxState {
  isPending: boolean;
  canSubmit: boolean;
  /** The one error to show; a failed search outranks a failed booking, which outranks a failed move. */
  errorMessage: string | null;
  requiresUpgrade: boolean;
  /** The edit flow has something on screen: options, a question, or a saved move. */
  editShowing: boolean;
  /** A booking or move completed — the box may offer more help, then close. */
  finished: boolean;
  /** Anything at all is showing below the field. */
  hasResults: boolean;
  /** Nothing typed and nothing showing — losing focus may fold the box away. */
  isIdle: boolean;
}

export function deriveFindTimeBoxState({
  text,
  findTime,
  confirmSlot,
  edit,
}: FindTimeBoxInputs): FindTimeBoxState {
  const isPending = findTime.isPending || edit.isPending;
  const errorMessage = findTime.errorMessage ?? confirmSlot.errorMessage ?? edit.errorMessage;
  const editShowing = edit.optionCount > 0 || edit.hasClarification || edit.hasMoved;
  const hasResults =
    isPending ||
    editShowing ||
    findTime.hasProposal ||
    findTime.hasClarification ||
    confirmSlot.hasConfirmation ||
    errorMessage !== null;
  const isEmpty = text.trim().length === 0;

  return {
    isPending,
    canSubmit: !isEmpty && !isPending,
    errorMessage,
    requiresUpgrade: findTime.requiresUpgrade || edit.requiresUpgrade,
    editShowing,
    finished: edit.hasMoved || confirmSlot.hasConfirmation,
    hasResults,
    isIdle: isEmpty && !hasResults,
  };
}

export interface StaleResults {
  findTime: boolean;
  confirmSlot: boolean;
  edit: boolean;
}

/**
 * Which flows to reset once the user edits the text: any answer on screen
 * was for the old text, so it goes as soon as the request changes.
 */
export function staleResultsOnEdit({
  findTime,
  confirmSlot,
  edit,
}: Omit<FindTimeBoxInputs, 'text'>): StaleResults {
  const editShowing = edit.optionCount > 0 || edit.hasClarification || edit.hasMoved;
  return {
    findTime: findTime.hasProposal || findTime.hasClarification || findTime.errorMessage !== null,
    confirmSlot: confirmSlot.hasConfirmation || confirmSlot.errorMessage !== null,
    edit: editShowing || edit.errorMessage !== null,
  };
}
