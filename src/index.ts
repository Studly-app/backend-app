import { Hono } from "hono";
import { cors } from "hono/cors";
import api_routes from "./ApiRoutes";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", cors());

app.route("/api", api_routes);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

export default app;
