import { Hono } from "hono";
import user from "./utilisateurs";
import { exercicesApp, optionsQCMApp } from "./exercices";
import classes from "./classes";
import lecons from "./lecons";
import sousLecons from "./souslecons";

const api_routes = new Hono<{ Bindings: CloudflareBindings }>();

api_routes.route("/users", user);
api_routes.route("/exercices", exercicesApp);
api_routes.route("/options-qcm", optionsQCMApp);
api_routes.route("/classes", classes);
api_routes.route("/lecons", lecons);
api_routes.route("/souslecons", sousLecons);

api_routes.get("/", ({ json }) => {
  return json({
    message: "je suis dans la route",
  });
});
export default api_routes;
