// Swapping versions is one line. Never edit a shipped version in place —
// a prompt change creates vN/; calls.prompt_version records which one produced
// a given extraction. See docs/BUILD_BRIEF.md "The prompt layer".

import { v3 } from "./v3";

export const ACTIVE = v3;
