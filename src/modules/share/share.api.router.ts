import { Router } from "express";

import { sendPhraseShare, sendWelcomeMessage, sendWordShare } from "./share.api.controller";

export const shareApiRouter = Router();

shareApiRouter.post("/word/send", sendWordShare);
shareApiRouter.post("/phrase/send", sendPhraseShare);
shareApiRouter.post("/welcome", sendWelcomeMessage);
