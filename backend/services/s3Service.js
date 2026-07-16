const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

const REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'kac-certificate-vault-bucket';

// Initialize S3 Client (IAM Role credentials used automatically)
const s3Client = new S3Client({ region: REGION });

/**
 * Uploads a file buffer to S3 using the lib-storage Upload helper.
 * @param {string} userId
 * @param {string} fileId - The unique ID to identify the file (e.g. UUID)
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} originalName
 * @returns {Promise<string>} - The S3 object key
 */
exports.uploadFile = async (userId, fileId, fileBuffer, mimeType, originalName) => {
  const extension = path.extname(originalName) || '';
  const s3Key = `certificates/${userId}/${fileId}${extension}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      // Do not use ACL: 'public-read' to keep files private
    }
  });

  await upload.done();
  return s3Key;
};

/**
 * Deletes an object from S3.
 * @param {string} s3Key
 */
exports.deleteFile = async (s3Key) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key
  });
  await s3Client.send(command);
};

/**
 * Generates a pre-signed URL for viewing or downloading a file.
 * @param {string} s3Key
 * @param {boolean} downloadMode - If true, triggers file attachment download
 * @param {string} originalName - Used for download filename attachment
 * @returns {Promise<string>}
 */
exports.generatePresignedUrl = async (s3Key, downloadMode = false, originalName = '') => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: s3Key
  };

  if (downloadMode) {
    // Force download naming headers
    const safeName = encodeURIComponent(originalName || 'document');
    params.ResponseContentDisposition = `attachment; filename*=UTF-8''${safeName}`;
  }

  const command = new GetObjectCommand(params);
  // Valid for 5 minutes (300 seconds)
  return await getSignedUrl(s3Client, command, { expiresIn: 300 });
};
