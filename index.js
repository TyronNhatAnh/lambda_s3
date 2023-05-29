const AWS = require('aws-sdk');
const sharp = require('sharp');
                
// get reference to S3 client
const s3 = new AWS.S3();

const COLD_BUCKET = process.env.COLD_BUCKET;
const RESIZED_BUCKET = process.env.RESIZED_BUCKET;
const ALLOWED_DIMENSIONS = new Set();

// Allowed dimensions format: "wxh,16x16,28x28"
if (process.env.ALLOWED_DIMENSIONS) {
    const dimensions = process.env.ALLOWED_DIMENSIONS.split(",");
    dimensions.forEach((dimension) => ALLOWED_DIMENSIONS.add(dimension));
}

function getExtension (fileName) {
  const split = fileName.split(".");
  return split[split.length - 1];
};

async function handleNoSize(fileName, coldBucket, s3) {
  const fileExtension = getExtension(fileName);

  const uploaded = await s3.getObject({ Bucket: coldBucket, Key: fileName }).promise();

  return {
      statusCode: 200,
      headers: { "Content-Type": "application/" + fileExtension, "Content-Disposition": `attachment; filename=${fileName}` },
      body: uploaded.Body?.toString("base64") || "",
      isBase64Encoded: true,
  };
};

async function handleResized(key, resizedBucket, s3) {
  const fileExtension = getExtension(key);

  const uploaded = await s3.getObject({ Bucket: resizedBucket, Key: key }).promise();

  return {
      statusCode: 200,
      headers: { "Content-Type": "application/" + fileExtension, "Content-Disposition": `attachment; filename=${key}` },
      body: uploaded.Body?.toString("base64") || "",
      isBase64Encoded: true,
  };
};

async function handleResize(fileName, key, dimensions, coldBucket, resizedBucket, s3) {
  const fileExtension = getExtension(fileName);

  const uploaded = await s3.getObject({ Bucket: coldBucket, Key: fileName }).promise();

  const image = await sharp(uploaded.Body)
      .resize(dimensions.width, dimensions.height)
      .toBuffer();

  await s3.upload({ Body: image, Bucket: resizedBucket, Key: key }).promise();

  return {
      statusCode: 200,
      headers: { "Content-Type": "application/" + fileExtension, "Content-Disposition": `attachment; filename=${key}` },
      body: image.toString("base64"),
      isBase64Encoded: true,
  };
};


exports.handler = async (event) => {
    const fileName = event.pathParameters?.file;
    const size = event.queryStringParameters?.size;

    if (!fileName) throw Error("No file name provided");
    if (!size) return await handleNoSize(fileName, COLD_BUCKET, s3);

    if (ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(size)) return { statusCode: 403, headers: {}, body: "" };

    const resizedKey = size + "." + fileName;

    try {
        return await handleResized(resizedKey, RESIZED_BUCKET, s3);
    } catch {
        const split = size.split("x");

        return await handleResize(fileName, resizedKey, { width: parseInt(split[0]), height: parseInt(split[1]) }, COLD_BUCKET, RESIZED_BUCKET, s3);
    }
};
