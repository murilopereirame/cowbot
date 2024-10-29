import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";
import fs from "node:fs";

const randomHexString = () => crypto.randomBytes(16).toString("hex");
const isAudioFile = async (file: string) => {
  const fileBuffer = fs.readFileSync(file);
  const type = await fileTypeFromBuffer(fileBuffer);
  return type && type.mime.startsWith("audio");
};
const noOp = () => {};

export { randomHexString, isAudioFile, noOp };
