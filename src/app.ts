import { Hono } from "hono";
import { AppEnv, Bindings } from "./config/env";
import { apiMiddleware } from "./middleware/api/api.middleware";
import { apiOnError } from "./middleware/api/api.onError";
import { apiNotFound } from "./middleware/api/api.notFound";
import { router } from "./router";
import { cors } from "hono/cors";
import { processRecurringReminders } from "./features/recurring-reminder/cron.service";

const app = new Hono<AppEnv>()
	.use("*", cors({
		origin: (origin, c) => {
			const allowedOrigins = [c.env.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"];
			return allowedOrigins.includes(origin) ? origin : c.env.FRONTEND_URL;
		},
		credentials: true,
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}))
	.use(apiMiddleware)
	.onError(apiOnError)
	.notFound(apiNotFound)

router.forEach((route) => app.route(route.path, route.handler));

export default {
	async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
		const dynamicApp = new Hono<AppEnv>().basePath(env.BASE_PATH).onError(apiOnError);

		dynamicApp.route("/", app);

		return dynamicApp.fetch(request, env, ctx);
	},
	async scheduled(event: any, env: Bindings, ctx: ExecutionContext) {
		ctx.waitUntil(processRecurringReminders(env));
	}
};