import {
  createLocalLiveEventPublisher,
  createLocalSessionCoordinator,
} from "../cloud/index.js";

export function createTestCloudDeps(onCancel?: (sessionId: string) => void) {
  return {
    livePublisher: createLocalLiveEventPublisher(),
    sessionCoordinator: createLocalSessionCoordinator(
      onCancel !== undefined ? { onCancel } : {},
    ),
  };
}
