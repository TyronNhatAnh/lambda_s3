const AWS = require("aws-sdk");
const sharp = require("sharp");

// get reference to S3 client
const s3 = new AWS.S3();

const DEV_ENV = "dev"
const STAG_ENV = "stag"
const PROD_ENV = "prod"

const DEV_RESIZED_BUCKET = process.env.DEV_RESIZED_BUCKET;
const STAG_RESIZED_BUCKET = process.env.STAG_RESIZED_BUCKET;
const PROD_RESIZED_BUCKET = process.env.PROD_RESIZED_BUCKET;
const ALLOWED_DIMENSIONS = new Set();

// Allowed dimensions format: "wxh,16x16,28x28"
if (process.env.ALLOWED_DIMENSIONS) {
  const dimensions = process.env.ALLOWED_DIMENSIONS.split(",");
  dimensions.forEach(dimension => ALLOWED_DIMENSIONS.add(dimension));

}

function getExtension(fileName) {
  const split = fileName.split(".");
  return split[split.length - 1];
}

async function handleNoSize(fileName, coldBucket, s3) {
  try {
    const fileExtension = getExtension(fileName);
    const uploaded = await s3
    .getObject({Bucket: coldBucket, Key: fileName})
    .promise();

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/" + fileExtension,
      "Content-Disposition": `attachment; filename=${fileName}`,
    },
    body: uploaded.Body?.toString("base64") || "",
    isBase64Encoded: true,
  };
  } catch (error) {
    console.log(error);
  }
  
}

async function handleResized(key, resizedBucket, s3) {
    const fileExtension = getExtension(key);
    const uploaded = await s3
    .getObject({Bucket: resizedBucket, Key: "thumbnail/" + key})
    .promise();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/" + fileExtension,
        "Content-Disposition": `attachment; filename=${"thumbnail/" + key}`,
      },
      body: uploaded.Body?.toString("base64") || "",
      isBase64Encoded: true,
    };
}

async function handleResize(
  fileName,
  key,
  dimensions,
  coldBucket,
  resizedBucket,
  s3,
) {
  
// Upload the thumbnail image to the destination bucket
  try {
    const fileExtension = getExtension(fileName);

  const uploaded = await s3
    .getObject({Bucket: coldBucket, Key: fileName})
    .promise();

  const image = await sharp(uploaded.Body)
    .resize(dimensions.width, dimensions.height)
    .toBuffer();

    const destparams = {
      Bucket: resizedBucket,
      Key: "thumbnail/" + key,
      Body: image,
      ContentType: "image"
    };
    console.log(`Key push object: ${destparams.Key}`);
                  
    await s3.putObject(destparams).promise();     
    
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/" + fileExtension,
      "Content-Disposition": `attachment; filename=${"thumbnail/" + key}`,
    },
    body: image.toString("base64"),
    isBase64Encoded: true,
  };
  } catch (error) {
    console.log(error);
    return;
  }
}

exports.handler = async event => {
  try{
    console.log("ImageHandler event: ", event);

    let fileName = event.pathParameters?.file;
    const size = event.queryStringParameters?.size;

    console.log("ImageHandler FileName: ", fileName);

    if (!fileName) throw Error("No file name provided");

    fileName = decodeURI(fileName);

    //get current env
    const CURRENT_ENV = event.requestContext?.stage;
    if (!CURRENT_ENV) {
      console.log("CURRENT_ENV Not Existed");
      return {statusCode: 403, headers: {}, body: ""};
    }
    let CURRENT_RESIZED_BUCKET = ""
    switch (CURRENT_ENV) {
      case DEV_ENV:
        CURRENT_RESIZED_BUCKET = DEV_RESIZED_BUCKET
        break;
      case STAG_ENV:
        CURRENT_RESIZED_BUCKET = STAG_RESIZED_BUCKET
        break;
      case PROD_ENV:
        CURRENT_RESIZED_BUCKET = PROD_RESIZED_BUCKET
        break;
      default:
        break;
    }

    console.log("ImageHandler CURRENT_RESIZED_BUCKET: ", CURRENT_RESIZED_BUCKET);

    if (!CURRENT_RESIZED_BUCKET) {
      console.log("image Handler: No Bucket");
      return {statusCode: 403, headers: {}, body: ""};
    }

    if (!size) {
      console.log("image Handler: handleNoSize");
      return await handleNoSize(fileName, CURRENT_RESIZED_BUCKET, s3);
    }

    if (ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(size)) {
      console.log("DIMENSIONS Not Existed: ", size);
      console.log("DIMENSIONS Current: ", ALLOWED_DIMENSIONS);
      return {statusCode: 403, headers: {}, body: ""};
    }

    const resizedKey = size + "/" + fileName;

    try {
      console.log("image Handler: handleResized");
      return await handleResized(resizedKey, CURRENT_RESIZED_BUCKET, s3);
    } catch {
      const split = size.split("x");
      console.log("image Handler: handleResize");
      return await handleResize(
          fileName,
          resizedKey,
          {width: parseInt(split[0]), height: parseInt(split[1])},
          CURRENT_RESIZED_BUCKET,
          CURRENT_RESIZED_BUCKET,
          s3,
        );
    }
  } catch (error) {
    console.log(error);
    return;
  }
};
