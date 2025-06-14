// Middleware para validar el parámetro :table
const validTables = ['luxometro', 'calidad_agua', 'temhum1', 'temhum2'];

function validateTableParam(req, res, next) {
  if (!validTables.includes(req.params.table)) {
    return res.status(400).json({ error: 'Tabla no válida' });
  }
  next();
}

module.exports = validateTableParam;
