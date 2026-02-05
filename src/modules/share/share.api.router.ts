import { Router } from "express";

import { sendWelcomeMessage, sendWordShare } from "./share.api.controller";

export const shareApiRouter = Router();

shareApiRouter.post("/word/send", sendWordShare);
shareApiRouter.post("/welcome", sendWelcomeMessage);
