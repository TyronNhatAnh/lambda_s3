const AWS = require("aws-sdk");
const sharp = require("sharp");

// get reference to S3 client
const s3 = new AWS.S3();

const RESIZED_BUCKET = process.env.RESIZED_BUCKET;
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
  try {
    const fileExtension = getExtension(key);
    const uploaded = await s3
    .getObject({Bucket: resizedBucket, Key: "thumbnail/" + key})
    .promise();

    console.log("image body handler", uploaded.Body?.toString("base64"));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/" + fileExtension,
        "Content-Disposition": `attachment; filename=${"thumbnail/" + key}`,
      },
      body: uploaded.Body?.toString("base64") || "",
      isBase64Encoded: true,
    };
  } catch (error) {
    console.log(error);
  }
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
    console.log(`Bucket push object: ${destparams.Bucket}`);
    console.log(`Key push object: ${destparams.Key}`);
                  
    await s3.putObject(destparams).promise();     
    
    console.log("iamge handler body", image.toString("base64"));
       
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
    console.log("event handler ", event);

    console.log("event handler Bucket", RESIZED_BUCKET);

    const fileName = event.pathParameters?.file;
    const size = event.queryStringParameters?.size;

    console.log("fileName image Handler ", fileName);
    console.log("size image Handler ", size);

    if (!fileName) throw Error("No file name provided");
    if (!size) {
      console.log("image Handler: handleNoSize");
      return await handleNoSize(fileName, RESIZED_BUCKET, s3);
    }

    console.log("image Handler: handleNoSize", JSON.stringify(ALLOWED_DIMENSIONS));

    if (ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(size)) {
      console.log("DIMENSIONS Not Existed: ", size);
      return {statusCode: 403, headers: {}, body: ""};
    }

    const resizedKey = size + "." + fileName;

    try {
      console.log("image Handler: handleResized");
      return await handleResized(resizedKey, RESIZED_BUCKET, s3);
    } catch {
      const split = size.split("x");
      console.log("image Handler: handleResize");
      return await handleResize(
          fileName,
          resizedKey,
          {width: parseInt(split[0]), height: parseInt(split[1])},
          RESIZED_BUCKET,
          RESIZED_BUCKET,
          s3,
        );
    }
  } catch (error) {
    console.log(error);
    return;
  }
};
