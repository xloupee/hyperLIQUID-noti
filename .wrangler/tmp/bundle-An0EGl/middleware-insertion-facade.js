				import worker, * as OTHER_EXPORTS from "/Users/kennethjiang/Desktop/hyperLIQUID/src/worker.js";
				import * as __MIDDLEWARE_0__ from "/Users/kennethjiang/Desktop/hyperLIQUID/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts";
import * as __MIDDLEWARE_1__ from "/Users/kennethjiang/Desktop/hyperLIQUID/node_modules/wrangler/templates/middleware/middleware-scheduled.ts";
import * as __MIDDLEWARE_2__ from "/Users/kennethjiang/Desktop/hyperLIQUID/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts";

				export * from "/Users/kennethjiang/Desktop/hyperLIQUID/src/worker.js";
				const MIDDLEWARE_TEST_INJECT = "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__";
				export const __INTERNAL_WRANGLER_MIDDLEWARE__ = [
					
					__MIDDLEWARE_0__.default,__MIDDLEWARE_1__.default,__MIDDLEWARE_2__.default
				]
				export default worker;