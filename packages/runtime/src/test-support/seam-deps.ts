import {
  createLocalLiveEventPublisher,
  createLocalSessionCoordinator,
} from "../seams/local/index.js";

export function createTestSeamDeps(onCancel?: (sessionId: string) => void) {
  return {
    livePublisher: createLocalLiveEventPublisher(),
    sessionCoordinator: createLocalSessionCoordinator(
      onCancel !== undefined ? { onCancel } : {},
    ),
  };
}
