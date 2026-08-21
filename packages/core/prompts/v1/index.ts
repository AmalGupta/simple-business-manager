import { EXTRACTION_TOOL } from "./tool";
import { SYSTEM_PROMPT } from "./system";
import { buildUserMessage } from "./render";

export const v1 = {
  version: "v1",
  tool: EXTRACTION_TOOL,
  system: SYSTEM_PROMPT,
  buildUserMessage,
};
