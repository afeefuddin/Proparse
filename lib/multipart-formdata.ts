import type { IncomingMessage } from "http";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type Body = {
  files?: Record<
    string,
    {
      filepath: string;
      "content-type": string;
    }
  >;
} & Record<string, string>;

type Header = {
  name: string;
  filename?: string;
};

const promises: Promise<void>[] = [];

function getBoundary(contentType: string | undefined) {
  if (!contentType) return undefined;
  const boundary = contentType.split("multipart/form-data;")[1];
  return "--" + boundary.split("boundary=")[1];
}

function getFileName(filename: string) {
  const splittedFilename = filename.split('.')
  const extension = splittedFilename.pop()
  const randomString = crypto.randomBytes(8).toString('hex')
  return splittedFilename.join() + randomString + '.' + extension
}

function parsePartHeader(header: string) {
  const lines = header.split("\r\n").filter((line) => line.trim() !== "");

  const dispositionHeader = lines[0];

  const nameMatch = dispositionHeader.match(/name="([^"]+)"/);
  const filenameMatch = dispositionHeader.match(/filename="([^"]+)"/);

  return {
    name: nameMatch ? nameMatch[1] : "",
    filename: filenameMatch ? filenameMatch[1] : undefined,
  };
}

function extractBinaryContent(rawData: string, boundary: string): Buffer {
  const binaryStartIndex = rawData.indexOf("\r\n\r\n");
  if (binaryStartIndex === -1) {
    console.error("Could not find binary content start");
    return Buffer.from([]);
  }

  const binaryEndIndex = rawData.indexOf(boundary, binaryStartIndex);

  const binaryContent = rawData.slice(
    binaryStartIndex + 4,
    binaryEndIndex > -1 ? binaryEndIndex : undefined
  );

  return Buffer.from(binaryContent, "binary");
}

function makeFile(rawData: Buffer, filename: string) {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, filename);

  try {
    const writePromise = fs.promises.writeFile(filePath, rawData);
    promises.push(writePromise);
    return writePromise;
  } catch (err) {
    console.error("Error writing binary file:", err);
  }
}

function detectContentType(header: string) {
  const contentTypeMatch = header.match(/Content-Type:\s*([^\r\n]+)/);
  const contentType = contentTypeMatch
    ? contentTypeMatch[1]
    : "application/octet-stream";
  return contentType;
}

function parseFile(
  rawData: string,
  boundary: string,
  cleanHeader: string,
  body: Body
) {
  const fileBuffer = extractBinaryContent(rawData, boundary);
  const header = parsePartHeader(cleanHeader);
  const filename = getFileName(header.filename || `unknown_file_${Date.now()}`);
  const writePromise = makeFile(fileBuffer, filename);
  writePromise?.then(() => {
    const contentType = detectContentType(cleanHeader);
    body.files = body.files || {};
    body.files[header.name] = {
      filepath: `/uploads/${filename}`,
      "content-type": contentType,
    };
  });
}

function typeOfData(header: Header): "keyValue" | "file" {
  if (header.filename) {
    return "file";
  }
  return "keyValue";
}

function cleanData(rawData: string) {
  return rawData
    .split("\r\n")
    .filter((dataPart) => dataPart.trim() !== "")
    .join();
}

function parseBuffer(buffer: Buffer, boundary: string): Body {
  let data = buffer.toString("binary");

  const fullBoundary = boundary;

  let parsedData = data.split(fullBoundary);
  let body: Body = {};

  // Remove -- from the end
  parsedData.pop();

  parsedData.forEach((part, index) => {
    if (part.trim() === "") {
      return;
    }
    // Every part have two subparts
    // - Part Header
    // - Part Body
    // It is separated by \r\n\r\n

    const splittedParts = part.split("\r\n\r\n");

    const cleanHeader = cleanData(splittedParts[0]);
    const cleanBody = cleanData(splittedParts[1]);

    const header = parsePartHeader(cleanHeader);
    try {
      if (typeOfData(header) === "keyValue") {
        body[header.name] = cleanBody;
      } else {
        parseFile(part, fullBoundary, cleanHeader, body);
      }
    } catch (error) {
      console.error(`Error parsing part ${index}:`, error);
    }
  });

  return body;
}

function parseMultipartFormData(req: IncomingMessage) {
  let raw_data: any[] = [];
  return new Promise<Body>((resolve, reject) => {
    let body: Body;
    req
      .on("data", (chunk) => {
        raw_data.push(chunk);
      })
      .on("end", async () => {
        const buffer = Buffer.concat(raw_data);
        const boundary = getBoundary(req.headers["content-type"]);
        if (!boundary) {
          reject(new Error("No bounday found"));
          return;
        }
        body = parseBuffer(buffer, boundary);
        await Promise.all(promises);
        resolve(body);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

export { parseMultipartFormData };
