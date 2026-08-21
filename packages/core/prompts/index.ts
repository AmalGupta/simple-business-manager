// Swapping versions is one line. Never edit a shipped version in place —
// a prompt change creates v2/; calls.prompt_version records which one produced
// a given extraction. See docs/BUILD_BRIEF.md "The prompt layer".

import { v1 } from "./v1";

export const ACTIVE = v1;
