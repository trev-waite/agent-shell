import { describe, expect, test } from "bun:test";
import {
  cancelChannel,
  cancelFlagKey,
  leaseKey,
  sessionAdmissionKey,
  LEASE_KEY_PREFIX,
} from "./keys.js";

describe("coordination keys", () => {
  test("formats lease and cancel keys", () => {
    expect(leaseKey("abc")).toBe(`${LEASE_KEY_PREFIX}abc`);
    expect(cancelChannel("worker-1")).toBe("relay:cancel:worker-1");
    expect(cancelFlagKey("sess-1")).toBe("relay:cancel-flag:sess-1");
    expect(sessionAdmissionKey("sess-1")).toBe("relay:admission:sess-1");
  });
});
