const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");

const s3 = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a base64 image or Buffer to S3
 */
exports.uploadToS3 = async (
  fileContent,
  folder = "media-assets",
  customName = null,
) => {
  try {
    let buffer;
    let contentType = "image/png";
    let extension = "png";

    if (typeof fileContent === "string" && fileContent.startsWith("data:")) {
      // Handle base64
      const matches = fileContent.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error("Invalid base64 string");
      }
      contentType = matches[1];
      extension = contentType.split("/")[1] || "png";
      buffer = Buffer.from(matches[2], "base64");
    } else if (Buffer.isBuffer(fileContent)) {
      buffer = fileContent;
    } else {
      throw new Error("Invalid file content type");
    }

    const fileName = customName
      ? `${customName}-${crypto.randomBytes(3).toString("hex")}.${extension}`
      : `${crypto.randomBytes(8).toString("hex")}.${extension}`;

    const key = `${folder}/${fileName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};
