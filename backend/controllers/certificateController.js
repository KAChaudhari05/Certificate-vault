const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dynamoService = require('../services/dynamoService');
const s3Service = require('../services/s3Service');

// Create a new certificate (Upload to S3 & metadata to DynamoDB)
exports.createCertificate = async (req, res, next) => {
  try {
    const { name, organization, category, issueDate, expiryDate, description } = req.body;
    
    // File validation check
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Certificate file (PDF or Image) is required.'
      });
    }

    if (!name || !organization || !category || !issueDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, Organization, Category, and Issue Date are required.'
      });
    }

    const certificateId = uuidv4();
    const extension = path.extname(req.file.originalname) || '';
    
    // Upload buffer to S3
    const s3Key = await s3Service.uploadFile(
      req.user.id,
      certificateId,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Save metadata to DynamoDB
    const fileName = `${req.user.id}_${certificateId}${extension}`;
    const newCertificate = {
      id: certificateId,
      userId: req.user.id,
      name,
      organization,
      category,
      issueDate,
      expiryDate: expiryDate || null,
      description: description || '',
      s3Key,
      fileName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      createdAt: new Date().toISOString()
    };

    await dynamoService.createCertificate(newCertificate);

    // Return the response matching the original format
    res.status(201).json({
      success: true,
      message: 'Certificate uploaded and registered successfully.',
      data: {
        certificate: {
          ...newCertificate,
          originalName: req.file.originalname,
          fileUrl: `/uploads/${fileName}`
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Retrieve all certificates for the current logged-in user
// Includes filtering (category), searching (name, organization), and pagination/sorting
exports.getCertificates = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let certs = await dynamoService.getCertificatesByUserId(userId);

    // 1. Search filter (match by name or organization)
    const search = req.query.search ? req.query.search.toLowerCase() : '';
    if (search) {
      certs = certs.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.organization.toLowerCase().includes(search) ||
        (c.description && c.description.toLowerCase().includes(search))
      );
    }

    // 2. Category filter
    const category = req.query.category || '';
    if (category) {
      certs = certs.filter(c => c.category.toLowerCase() === category.toLowerCase());
    }

    // 3. Sorting
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    certs.sort((a, b) => {
      let valA = a[sortBy] || '';
      let valB = b[sortBy] || '';
      
      if (typeof valA === 'string') {
        return valA.localeCompare(valB) * sortOrder;
      }
      return (valA > valB ? 1 : -1) * sortOrder;
    });

    // 4. Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const paginatedCerts = certs.slice(startIndex, endIndex);

    // Generate temporary pre-signed URL for each cert in the page slice
    for (let cert of paginatedCerts) {
      cert.fileUrl = `/uploads/${cert.fileName}`;
    }

    // Aggregate statistics for dashboard info
    const totalCount = certs.length;
    const categoriesCount = [...new Set(certs.map(c => c.category))].length;
    const totalStorageBytes = certs.reduce((acc, c) => acc + (c.fileSize || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Certificates retrieved successfully.',
      data: {
        certificates: paginatedCerts,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        },
        stats: {
          totalCertificates: totalCount,
          uniqueCategories: categoriesCount,
          storageBytes: totalStorageBytes
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Retrieve a single certificate details
exports.getCertificateById = async (req, res, next) => {
  try {
    const cert = await dynamoService.getCertificateById(req.user.id, req.params.id);
    
    if (!cert) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.'
      });
    }

    // Inject fileUrl linking to S3 pre-signed URL for viewing
    cert.fileUrl = `/uploads/${cert.fileName}`;

    res.status(200).json({
      success: true,
      message: 'Certificate retrieved successfully.',
      data: {
        certificate: cert
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update certificate metadata details
exports.updateCertificate = async (req, res, next) => {
  try {
    const { name, organization, category, issueDate, expiryDate, description } = req.body;
    const certId = req.params.id;

    const cert = await dynamoService.getCertificateById(req.user.id, certId);
    if (!cert) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.'
      });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (organization) updateFields.organization = organization;
    if (category) updateFields.category = category;
    if (issueDate) updateFields.issueDate = issueDate;
    if (expiryDate !== undefined) updateFields.expiryDate = expiryDate;
    if (description !== undefined) updateFields.description = description;

    const updatedCert = await dynamoService.updateCertificate(req.user.id, certId, updateFields);
    updatedCert.fileUrl = `/uploads/${updatedCert.fileName}`;

    res.status(200).json({
      success: true,
      message: 'Certificate updated successfully.',
      data: {
        certificate: updatedCert
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete a certificate (DynamoDB & S3)
exports.deleteCertificate = async (req, res, next) => {
  try {
    const certId = req.params.id;
    const cert = await dynamoService.getCertificateById(req.user.id, certId);

    if (!cert) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found.'
      });
    }

    // Delete object from S3
    if (cert.s3Key) {
      try {
        await s3Service.deleteFile(cert.s3Key);
      } catch (err) {
        console.error(`Failed to delete S3 file: ${cert.s3Key}`, err);
      }
    }

    // Delete metadata from DynamoDB
    await dynamoService.deleteCertificate(req.user.id, certId);

    res.status(200).json({
      success: true,
      message: 'Certificate deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};
