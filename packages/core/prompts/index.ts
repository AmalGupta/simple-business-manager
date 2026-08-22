// Swapping versions is one line. Never edit a shipped version in place —
// a prompt change creates v2/; calls.prompt_version records which one produced
// a given extraction. See docs/BUILD_BRIEF.md "The prompt layer".

import { v2 } from "./v2";

export const ACTIVE = v2;
