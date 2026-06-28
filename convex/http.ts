import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Registers the auth HTTP endpoints (magic-link verification callback, etc.).
auth.addHttpRoutes(http);

export default http;
