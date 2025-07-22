import { Hono } from "hono";
import user from "./utilisateurs";
import { exercicesApp, optionsQCMApp } from "./exercices";

const api_routes = new Hono<{ Bindings: CloudflareBindings }>();

api_routes.route("/users", user);
api_routes.route("/exercices", exercicesApp);
api_routes.route("/options-qcm", optionsQCMApp);

api_routes.get("/", ({ json }) => {
  return json({
    message: "je suis dans la route",
  });
});
export default api_routes;
