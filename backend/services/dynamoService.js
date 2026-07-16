const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  UpdateCommand, 
  DeleteCommand 
} = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'ap-south-1';
const USERS_TABLE = 'Users';
const CERTIFICATES_TABLE = 'Certificates';

// Initialize DynamoDB Client and Document Client
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// ==================== USER OPERATIONS ====================

exports.createUser = async (user) => {
  const item = {
    userId: user.id,
    name: user.name,
    email: user.email.toLowerCase(),
    passwordHash: user.password, // Mapping password to passwordHash as requested
    profileImageKey: user.profileImageKey || '',
    createdAt: user.createdAt
  };

  const command = new PutCommand({
    TableName: USERS_TABLE,
    Item: item
  });

  await docClient.send(command);
  return user;
};

exports.findUserById = async (userId) => {
  const command = new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  });

  const response = await docClient.send(command);
  if (!response.Item) return null;

  // Map passwordHash back to password for controller compatibility
  return {
    id: response.Item.userId,
    name: response.Item.name,
    email: response.Item.email,
    password: response.Item.passwordHash,
    profileImageKey: response.Item.profileImageKey,
    createdAt: response.Item.createdAt
  };
};

exports.findUserByEmail = async (email) => {
  const command = new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': email.toLowerCase()
    }
  });

  const response = await docClient.send(command);
  if (!response.Items || response.Items.length === 0) return null;

  const item = response.Items[0];
  return {
    id: item.userId,
    name: item.name,
    email: item.email,
    password: item.passwordHash,
    profileImageKey: item.profileImageKey,
    createdAt: item.createdAt
  };
};

exports.updateUser = async (userId, updateFields) => {
  const updateExpressionParts = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Map password to passwordHash if password update is requested
  const fields = { ...updateFields };
  if (fields.password) {
    fields.passwordHash = fields.password;
    delete fields.password;
  }

  Object.keys(fields).forEach((key) => {
    updateExpressionParts.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = fields[key];
  });

  if (updateExpressionParts.length === 0) return null;

  const command = new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const response = await docClient.send(command);
  const item = response.Attributes;
  return {
    id: item.userId,
    name: item.name,
    email: item.email,
    password: item.passwordHash,
    profileImageKey: item.profileImageKey,
    createdAt: item.createdAt
  };
};

// ==================== CERTIFICATE OPERATIONS ====================

exports.createCertificate = async (cert) => {
  const item = {
    userId: cert.userId,
    certificateId: cert.id,
    certificateName: cert.name,
    organization: cert.organization,
    category: cert.category,
    issueDate: cert.issueDate,
    expiryDate: cert.expiryDate || null,
    description: cert.description || '',
    s3Key: cert.s3Key,
    fileName: cert.fileName,
    fileType: cert.fileType,
    fileSize: cert.fileSize,
    uploadedAt: cert.createdAt
  };

  const command = new PutCommand({
    TableName: CERTIFICATES_TABLE,
    Item: item
  });

  await docClient.send(command);
  return cert;
};

exports.getCertificatesByUserId = async (userId) => {
  const command = new QueryCommand({
    TableName: CERTIFICATES_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  });

  const response = await docClient.send(command);
  const items = response.Items || [];

  // Map attributes back to controller field names
  return items.map(item => ({
    id: item.certificateId,
    userId: item.userId,
    name: item.certificateName,
    organization: item.organization,
    category: item.category,
    issueDate: item.issueDate,
    expiryDate: item.expiryDate,
    description: item.description,
    s3Key: item.s3Key,
    fileName: item.fileName,
    originalName: item.fileName, // map to filename as originalName
    fileUrl: '', // generated dynamically as pre-signed URL in controller
    fileSize: item.fileSize,
    fileType: item.fileType,
    createdAt: item.uploadedAt
  }));
};

exports.getCertificateById = async (userId, certificateId) => {
  const command = new GetCommand({
    TableName: CERTIFICATES_TABLE,
    Key: { userId, certificateId }
  });

  const response = await docClient.send(command);
  if (!response.Item) return null;

  const item = response.Item;
  return {
    id: item.certificateId,
    userId: item.userId,
    name: item.certificateName,
    organization: item.organization,
    category: item.category,
    issueDate: item.issueDate,
    expiryDate: item.expiryDate,
    description: item.description,
    s3Key: item.s3Key,
    fileName: item.fileName,
    originalName: item.fileName,
    fileUrl: '',
    fileSize: item.fileSize,
    fileType: item.fileType,
    createdAt: item.uploadedAt
  };
};

exports.updateCertificate = async (userId, certificateId, updateFields) => {
  const updateExpressionParts = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Map internal controller fields to DynamoDB schema fields
  const dbFields = {};
  if (updateFields.name) dbFields.certificateName = updateFields.name;
  if (updateFields.organization) dbFields.organization = updateFields.organization;
  if (updateFields.category) dbFields.category = updateFields.category;
  if (updateFields.issueDate) dbFields.issueDate = updateFields.issueDate;
  if (updateFields.expiryDate !== undefined) dbFields.expiryDate = updateFields.expiryDate;
  if (updateFields.description !== undefined) dbFields.description = updateFields.description;

  Object.keys(dbFields).forEach((key) => {
    updateExpressionParts.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = dbFields[key];
  });

  if (updateExpressionParts.length === 0) return null;

  const command = new UpdateCommand({
    TableName: CERTIFICATES_TABLE,
    Key: { userId, certificateId },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const response = await docClient.send(command);
  const item = response.Attributes;
  return {
    id: item.certificateId,
    userId: item.userId,
    name: item.certificateName,
    organization: item.organization,
    category: item.category,
    issueDate: item.issueDate,
    expiryDate: item.expiryDate,
    description: item.description,
    s3Key: item.s3Key,
    fileName: item.fileName,
    originalName: item.fileName,
    fileUrl: '',
    fileSize: item.fileSize,
    fileType: item.fileType,
    createdAt: item.uploadedAt
  };
};

exports.deleteCertificate = async (userId, certificateId) => {
  const command = new DeleteCommand({
    TableName: CERTIFICATES_TABLE,
    Key: { userId, certificateId }
  });

  await docClient.send(command);
  return true;
};
