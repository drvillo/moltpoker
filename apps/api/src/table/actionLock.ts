type UnlockFn = () => void;

class TableActionLock {
  private locks = new Map<string, Promise<void>>();
  private unlockFns = new Map<string, UnlockFn>();

  async acquire(tableId: string): Promise<UnlockFn> {
    // Wait for existing lock
    const existing = this.locks.get(tableId);
    if (existing) {
      await existing;
    }

    // Create new lock
    let unlock: UnlockFn;
    const lock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    this.locks.set(tableId, lock);
    this.unlockFns.set(tableId, unlock!);

    return () => {
      unlock!();
      if (this.locks.get(tableId) === lock) {
        this.locks.delete(tableId);
        this.unlockFns.delete(tableId);
      }
    };
  }
}

export const tableActionLock = new TableActionLock();
