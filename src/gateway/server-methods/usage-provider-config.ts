import {
  UsageProviderConfigValidationError,
  deleteUsageProviderConfig,
  listUsageProviderConfigs,
  upsertUsageProviderConfig,
} from "../../infra/usage-provider-configs.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

function toErrorPayload(err: unknown) {
  if (err instanceof UsageProviderConfigValidationError) {
    return errorShape(ErrorCodes.INVALID_REQUEST, err.message);
  }
  return errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err));
}

export const usageProviderConfigHandlers: GatewayRequestHandlers = {
  "usage.provider.config.list": async ({ respond }) => {
    try {
      const snapshot = await listUsageProviderConfigs();
      respond(true, snapshot, undefined);
    } catch (err) {
      respond(false, undefined, toErrorPayload(err));
    }
  },
  "usage.provider.config.upsert": async ({ params, respond }) => {
    try {
      const snapshot = await upsertUsageProviderConfig(params?.item);
      respond(true, snapshot, undefined);
    } catch (err) {
      respond(false, undefined, toErrorPayload(err));
    }
  },
  "usage.provider.config.delete": async ({ params, respond }) => {
    try {
      const snapshot = await deleteUsageProviderConfig(params?.id);
      respond(true, snapshot, undefined);
    } catch (err) {
      respond(false, undefined, toErrorPayload(err));
    }
  },
};
