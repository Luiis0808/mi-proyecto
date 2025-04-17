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

// Registrar un ingreso (añadir material al inventario)
router.post('/', (req, res) => {
  const { material, cantidad } = req.body;

  db.run('INSERT INTO inventario (material, cantidad) VALUES (?, ?)', [material, cantidad], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ id: this.lastID });
    }
  });
});

// Exportar ingresos a CSV
router.get('/export', (req, res) => {
  db.all('SELECT * FROM inventario', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const csv = new Parser().parse(rows);
      res.header('Content-Type', 'text/csv');
      res.attachment('ingresos.csv');
      res.send(csv);
    }
  });
});

module.exports = router;
