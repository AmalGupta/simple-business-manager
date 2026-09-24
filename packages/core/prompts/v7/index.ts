import { EXTRACTION_TOOL } from "./tool";
import { SYSTEM_PROMPT } from "./system";
import { buildUserMessage } from "./render";

export const v7 = {
  version: "v7",
  tool: EXTRACTION_TOOL,
  system: SYSTEM_PROMPT,
  buildUserMessage,
};
