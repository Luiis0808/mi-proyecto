const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Parser } = require('json2csv'); // Para exportar a CSV

const router = express.Router();

// Conectar con la base de datos SQLite
const db = new sqlite3.Database('./inventory.db', (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  }
});

// Registrar un egreso (restar material del inventario)
router.post('/', (req, res) => {
  const { material, cantidad } = req.body;

  db.get('SELECT * FROM inventario WHERE material = ?', [material], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row || row.cantidad < cantidad) {
      res.status(400).json({ error: 'Stock insuficiente o material no encontrado' });
    } else {
      db.run('UPDATE inventario SET cantidad = cantidad - ? WHERE material = ?', [cantidad, material], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.status(200).json({ success: true });
        }
      });
    }
  });
});

// Exportar egresos a CSV
router.get('/export', (req, res) => {
  db.all('SELECT * FROM inventario', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const csv = new Parser().parse(rows);
      res.header('Content-Type', 'text/csv');
      res.attachment('egresos.csv');
      res.send(csv);
    }
  });
});

module.exports = router;
