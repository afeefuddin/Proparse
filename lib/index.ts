import type { IncomingMessage } from "http";
import { parseMultipartFormData } from "./multipart-formdata";

async function proParse(req: IncomingMessage) {
  const contentType = req.headers["content-type"];
  if (contentType?.startsWith("multipart/form-data")) {
    const data = await parseMultipartFormData(req);
    return data;
  }
  return null;
}

export {proParse}
