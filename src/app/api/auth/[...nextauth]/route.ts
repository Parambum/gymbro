import { handlers } from "@/auth";

export const runtime = "nodejs"; // Mongoose + bcrypt are not edge-compatible

export const { GET, POST } = handlers;
