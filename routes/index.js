const express = require('express');
const router = express.Router();

// Root endpoint
router.get('/api', (req, res) => {
  res.send('Welcome to the API! Use /api/stats/temhum1 for stats.');
});

module.exports = router;
