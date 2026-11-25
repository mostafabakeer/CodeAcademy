/* =================== Unit Tests for actionStore =================== */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionStore } from './actionStore';
import { toast } from './toastStore';

// Mock toast
vi.mock('./toastStore', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('actionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useActionStore.setState({ active: {} });
    vi.clearAllMocks();
  });

  it('should prevent duplicate action with same key', async () => {
    const run = useActionStore.getState().run;
    let callCount = 0;

    const task = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success';
    });

    // First call
    const promise1 = run({ key: 'test:action', label: 'Test Action' }, task);

    // Second call with same key (should be ignored)
    const promise2 = run({ key: 'test:action', label: 'Test Action' }, task);

    await Promise.all([promise1, promise2]);

    // Task should only be called once
    expect(callCount).toBe(1);
  });

  it('should allow different keys to run concurrently', async () => {
    const run = useActionStore.getState().run;
    let callCount1 = 0;
    let callCount2 = 0;

    const task1 = vi.fn().mockImplementation(async () => {
      callCount1++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success1';
    });

    const task2 = vi.fn().mockImplementation(async () => {
      callCount2++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success2';
    });

    const [result1, result2] = await Promise.all([
      run({ key: 'action:1', label: 'Action 1', blocking: false }, task1),
      run({ key: 'action:2', label: 'Action 2', blocking: false }, task2),
    ]);

    expect(callCount1).toBe(1);
    expect(callCount2).toBe(1);
    expect(result1).toBe('success1');
    expect(result2).toBe('success2');
  });

  it('should block new blocking action when another blocking action is running', async () => {
    const run = useActionStore.getState().run;
    let callCount = 0;

    const longTask = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'success';
    });

    // Start first blocking action
    const promise1 = run(
      { key: 'blocking:1', label: 'Blocking Action 1', blocking: true },
      longTask
    );

    // Try to start second blocking action (should be blocked)
    const promise2 = run(
      { key: 'blocking:2', label: 'Blocking Action 2', blocking: true },
      longTask
    );

    await Promise.all([promise1, promise2]);

    // Second task should not have been called
    expect(callCount).toBe(1);
    expect(toast.info).toHaveBeenCalledWith('Blocking Action 2');
  });

  it('should show success toast on successful completion', async () => {
    const run = useActionStore.getState().run;

    const task = vi.fn().mockResolvedValue('success');

    await run(
      { key: 'success:test', label: 'Success Action', successMessage: 'Done!' },
      task
    );

    expect(toast.success).toHaveBeenCalledWith('Done!');
  });

  it('should show error toast on failure', async () => {
    const run = useActionStore.getState().run;

    const task = vi.fn().mockRejectedValue(new Error('Something went wrong'));

    try {
      await run({ key: 'error:test', label: 'Error Action' }, task);
    } catch (e) {
      // Expected to throw
    }

    expect(toast.error).toHaveBeenCalledWith('تعذّر إتمام الإجراء، حاول مجدداً');
  });

  it('should not show error toast for user cancellation', async () => {
    const run = useActionStore.getState().run;

    const controller = new AbortController();
    const task = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    try {
      await run(
        { key: 'cancel:test', label: 'Cancel Action', kind: 'delete' },
        task
      );
    } catch (e) {
      // Expected
    }

    expect(toast.info).toHaveBeenCalledWith('تم إلغاء الإجراء');
  });

  it('should track active actions correctly', async () => {
    const { isRunning, run } = useActionStore.getState();

    const task = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'success';
    });

    expect(isRunning('test:action')).toBe(false);

    const promise = run({ key: 'test:action', label: 'Test' }, task);

    // Should be running now
    expect(isRunning('test:action')).toBe(true);

    await promise;

    // Should be done
    expect(isRunning('test:action')).toBe(false);
  });

  it('should support progress updates', async () => {
    const run = useActionStore.getState().run;
    const progressValues: number[] = [];

    const task = vi.fn().mockImplementation(async (ctx: { setProgress: (v: number | null) => void }) => {
      ctx.setProgress(25);
      await new Promise((resolve) => setTimeout(resolve, 10));
      ctx.setProgress(50);
      await new Promise((resolve) => setTimeout(resolve, 10));
      ctx.setProgress(100);
      return 'success';
    });

    await run(
      { key: 'progress:test', label: 'Progress Action', kind: 'upload' },
      task
    );

    expect(task).toHaveBeenCalled();
  });
});