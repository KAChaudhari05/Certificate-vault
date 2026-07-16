const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const authMiddleware = require('../middleware/authMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// Protect all routes under /api/certificates
router.use(authMiddleware);

// Certificate Endpoints
router.post('/', uploadMiddleware.single('file'), certificateController.createCertificate);
router.get('/', certificateController.getCertificates);
router.get('/:id', certificateController.getCertificateById);
router.put('/:id', certificateController.updateCertificate);
router.delete('/:id', certificateController.deleteCertificate);

module.exports = router;
