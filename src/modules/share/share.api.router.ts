import { Router } from "express";

import { sendWordShare } from "./share.api.controller";

export const shareApiRouter = Router();

shareApiRouter.post("/word/send", sendWordShare);
