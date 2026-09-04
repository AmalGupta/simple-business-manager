import { EXTRACTION_TOOL } from "./tool";
import { SYSTEM_PROMPT } from "./system";
import { buildUserMessage } from "./render";

export const v4 = {
  version: "v4",
  tool: EXTRACTION_TOOL,
  system: SYSTEM_PROMPT,
  buildUserMessage,
};
